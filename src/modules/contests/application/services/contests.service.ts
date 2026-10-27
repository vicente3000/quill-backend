import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ContestEntity,
  deriveContestStatus,
} from '../../domain/entities/contest.entity';
import { Contest } from '../../infrastructure/schemas/contest.schema';
import { CreateContestDto } from '../../presentation/dto/create-contest.dto';

type ContestRecord = Contest & { _id: Types.ObjectId };

@Injectable()
export class ContestsService {
  constructor(
    @InjectModel(Contest.name)
    private readonly contestModel: Model<Contest>,
  ) {}

  async create(adminId: string, dto: CreateContestDto): Promise<ContestEntity> {
    const contest = await this.contestModel.create({
      name: dto.name,
      description: dto.description,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      initialBalance: dto.initialBalance,
      mode: dto.mode,
      allowedAccountTypes: dto.allowedAccountTypes,
      createdBy: new Types.ObjectId(adminId),
    });

    return this.toEntity(contest);
  }

  async findAll(): Promise<ContestEntity[]> {
    const contests = await this.contestModel
      .find()
      .sort({ startDate: -1 })
      .lean<ContestRecord[]>()
      .exec();

    return contests.map((contest) => this.toEntity(contest));
  }

  async findOne(id: string): Promise<ContestEntity> {
    const contest = await this.contestModel
      .findById(id)
      .lean<ContestRecord>()
      .exec();

    if (!contest) {
      throw new NotFoundException('Concurso no encontrado.');
    }

    return this.toEntity(contest);
  }

  private toEntity(contest: ContestRecord): ContestEntity {
    return {
      id: contest._id.toString(),
      name: contest.name,
      description: contest.description,
      startDate: contest.startDate,
      endDate: contest.endDate,
      initialBalance: contest.initialBalance,
      mode: contest.mode,
      allowedAccountTypes: contest.allowedAccountTypes,
      status: deriveContestStatus(contest.startDate, contest.endDate),
      createdBy: contest.createdBy.toString(),
      createdAt: contest.createdAt!,
      updatedAt: contest.updatedAt!,
    };
  }
}
