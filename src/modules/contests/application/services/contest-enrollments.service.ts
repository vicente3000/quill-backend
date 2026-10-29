import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ContestEnrollmentEntity,
  ContestSummaryEntity,
} from '../../domain/entities/contest.entity';
import { ContestParticipant } from '../../infrastructure/schemas/contest-participant.schema';
import { ContestsService } from './contests.service';

const ALREADY_ENROLLED_MESSAGE = 'Ya estás inscrito en este concurso.';

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

@Injectable()
export class ContestEnrollmentsService {
  constructor(
    @InjectModel(ContestParticipant.name)
    private readonly participantModel: Model<ContestParticipant>,
    private readonly contestsService: ContestsService,
  ) {}

  async findAllForUser(userId: string): Promise<ContestSummaryEntity[]> {
    const [contests, enrollments] = await Promise.all([
      this.contestsService.findAll(),
      this.participantModel
        .find({ userId: new Types.ObjectId(userId) })
        .select('contestId')
        .lean<{ contestId: Types.ObjectId }[]>()
        .exec(),
    ]);
    const enrolledIds = new Set(
      enrollments.map((enrollment) => enrollment.contestId.toString()),
    );

    return contests.map((contest) => ({
      id: contest.id,
      name: contest.name,
      description: contest.description,
      startDate: contest.startDate,
      endDate: contest.endDate,
      initialBalance: contest.initialBalance,
      mode: contest.mode,
      allowedAccountTypes: contest.allowedAccountTypes,
      status: contest.status,
      participantsCount: contest.participantsCount,
      isEnrolled: enrolledIds.has(contest.id),
    }));
  }

  async enroll(
    contestId: string,
    userId: string,
  ): Promise<ContestEnrollmentEntity> {
    const contest = await this.contestsService.findOne(contestId);

    if (contest.status === 'FINISHED') {
      throw new ConflictException('El concurso ya finalizó.');
    }

    if (contest.mode === 'TEAM') {
      throw new ConflictException(
        'Este concurso es por equipos; la inscripción individual no está disponible.',
      );
    }

    const enrollment = {
      contestId: new Types.ObjectId(contestId),
      userId: new Types.ObjectId(userId),
    };

    if (await this.participantModel.exists(enrollment)) {
      throw new ConflictException(ALREADY_ENROLLED_MESSAGE);
    }

    try {
      const participant = await this.participantModel.create(enrollment);

      return { contestId, userId, joinedAt: participant.createdAt! };
    } catch (error) {
      // Dos inscripciones simultáneas pasan el exists; el índice único decide.
      if (isDuplicateKeyError(error)) {
        throw new ConflictException(ALREADY_ENROLLED_MESSAGE);
      }

      throw error;
    }
  }
}
