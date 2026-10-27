import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { Connection, Model, Types } from 'mongoose';
import type { JwtPayload } from '../../../../common/interfaces/jwt-payload.interface';
import type { TournamentStatus } from '../../domain/tournament.types';
import {
  Tournament,
  TournamentDocument,
} from '../../infrastructure/schemas/tournament.schema';
import {
  TournamentParticipant,
  TournamentParticipantDocument,
} from '../../infrastructure/schemas/tournament-participant.schema';
import { CreateTournamentDto } from '../../presentation/dto/create-tournament.dto';
import { JoinTournamentDto } from '../../presentation/dto/join-tournament.dto';
import { TournamentListQueryDto } from '../../presentation/dto/tournament-list-query.dto';
import { UpdateTournamentDto } from '../../presentation/dto/update-tournament.dto';

const MAX_TOURNAMENT_DURATION_MS = 366 * 24 * 60 * 60 * 1000;

function hashJoinCode(value: string): string {
  return createHash('sha256').update(value.trim().toUpperCase()).digest('hex');
}

function generateJoinCode(): string {
  return randomBytes(6)
    .toString('base64url')
    .replace(/[^A-Z0-9]/gi, '')
    .slice(0, 8)
    .toUpperCase()
    .padEnd(8, 'X');
}

function secureHashEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as { code?: unknown }).code === 11000;
}

@Injectable()
export class TournamentsService {
  constructor(
    @InjectModel(Tournament.name)
    private readonly tournamentModel: Model<TournamentDocument>,
    @InjectModel(TournamentParticipant.name)
    private readonly participantModel: Model<TournamentParticipantDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async create(ownerId: string, dto: CreateTournamentDto) {
    const { startAt, endAt } = this.validateDates(dto.startAt, dto.endAt);
    const joinCode = generateJoinCode();
    const tournament = await this.tournamentModel.create({
      ownerId: new Types.ObjectId(ownerId),
      name: dto.name.trim(),
      description: dto.description?.trim() ?? '',
      startAt,
      endAt,
      initialBalance: dto.initialBalance,
      commissionRate: dto.commissionRate ?? 0,
      visibility: dto.visibility ?? 'PRIVATE',
      maxParticipants: dto.maxParticipants,
      participantCount: 0,
      joinCodeHash: hashJoinCode(joinCode),
      status: 'DRAFT',
      baseCurrency: 'CLP',
    });

    return {
      tournament: tournament.toObject(),
      joinCode,
    };
  }

  async list(user: JwtPayload, query: TournamentListQueryDto) {
    const filter: Record<string, any> = {};
    const scope = query.scope ?? 'available';

    if (query.status) filter.status = query.status;
    if (query.search?.trim()) {
      filter.name = {
        $regex: escapeRegExp(query.search.trim()),
        $options: 'i',
      };
    }

    if (scope === 'owned') {
      filter.ownerId = new Types.ObjectId(user.sub);
    } else if (['joined', 'current', 'history'].includes(scope)) {
      const memberships = await this.participantModel
        .find({ userId: new Types.ObjectId(user.sub) }, { tournamentId: 1 })
        .lean()
        .exec();
      filter._id = { $in: memberships.map((entry) => entry.tournamentId) };
      if (scope === 'current') filter.status = { $in: ['OPEN', 'ACTIVE'] };
      if (scope === 'history') filter.status = { $in: ['FINISHED', 'CANCELLED'] };
    } else if (scope === 'available') {
      const memberships = await this.participantModel
        .find({ userId: new Types.ObjectId(user.sub) }, { tournamentId: 1 })
        .lean()
        .exec();
      filter._id = { $nin: memberships.map((entry) => entry.tournamentId) };
      filter.visibility = 'PUBLIC';
      filter.status = query.status ?? { $in: ['OPEN', 'ACTIVE'] };
    } else if (scope === 'all' && user.role !== 'admin') {
      throw new ForbiddenException(
        'Solo un administrador puede consultar todos los torneos.',
      );
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [items, total] = await Promise.all([
      this.tournamentModel
        .find(filter)
        .sort({ startAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.tournamentModel.countDocuments(filter).exec(),
    ]);

    return {
      data: items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getAccessible(tournamentId: string, user: JwtPayload) {
    const tournament = await this.findById(tournamentId);
    if (
      user.role === 'admin' ||
      tournament.ownerId.equals(user.sub) ||
      (tournament.visibility === 'PUBLIC' && tournament.status !== 'DRAFT')
    ) {
      return tournament;
    }

    const membership = await this.participantModel.exists({
      tournamentId: tournament._id,
      userId: new Types.ObjectId(user.sub),
    });
    if (!membership) {
      throw new ForbiddenException('No tienes acceso a este torneo.');
    }
    return tournament;
  }

  async update(
    tournamentId: string,
    user: JwtPayload,
    dto: UpdateTournamentDto,
  ) {
    const tournament = await this.assertOwnerOrAdmin(tournamentId, user);
    if (!['DRAFT', 'OPEN'].includes(tournament.status)) {
      throw new ConflictException(
        'No se pueden cambiar las reglas de un torneo iniciado.',
      );
    }

    const startAt = dto.startAt ?? tournament.startAt.toISOString();
    const endAt = dto.endAt ?? tournament.endAt.toISOString();
    this.validateDates(startAt, endAt);

    const participantCount = await this.participantModel.countDocuments({
      tournamentId: tournament._id,
    });
    if (
      dto.maxParticipants !== undefined &&
      dto.maxParticipants < participantCount
    ) {
      throw new BadRequestException(
        'El maximo de participantes no puede ser menor que los ya inscritos.',
      );
    }
    if (dto.initialBalance !== undefined && participantCount > 0) {
      throw new ConflictException(
        'El capital inicial no se puede cambiar despues de la primera inscripcion.',
      );
    }

    const updates: Record<string, unknown> = { ...dto };
    if (dto.name !== undefined) updates.name = dto.name.trim();
    if (dto.description !== undefined) {
      updates.description = dto.description.trim();
    }
    if (dto.startAt !== undefined) updates.startAt = new Date(dto.startAt);
    if (dto.endAt !== undefined) updates.endAt = new Date(dto.endAt);

    tournament.set(updates);
    await tournament.save();
    return tournament;
  }

  async publish(tournamentId: string, user: JwtPayload) {
    const tournament = await this.assertOwnerOrAdmin(tournamentId, user);
    if (tournament.status !== 'DRAFT') {
      throw new ConflictException('Solo se puede publicar un torneo borrador.');
    }
    if (tournament.endAt.getTime() <= Date.now()) {
      throw new BadRequestException('La fecha de termino ya paso.');
    }
    tournament.status =
      tournament.startAt.getTime() <= Date.now() ? 'ACTIVE' : 'OPEN';
    await tournament.save();
    return tournament;
  }

  async start(tournamentId: string, user: JwtPayload) {
    const tournament = await this.assertOwnerOrAdmin(tournamentId, user);
    if (!['DRAFT', 'OPEN'].includes(tournament.status)) {
      throw new ConflictException(
        'El torneo no se puede iniciar en su estado actual.',
      );
    }
    if (tournament.endAt.getTime() <= Date.now()) {
      throw new BadRequestException('La fecha de termino ya paso.');
    }
    tournament.status = 'ACTIVE';
    tournament.startAt = new Date();
    await tournament.save();
    return tournament;
  }

  async join(tournamentId: string, userId: string, dto: JoinTournamentDto) {
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(async () => {
        const tournament = await this.tournamentModel
          .findById(tournamentId)
          .select('+joinCodeHash')
          .session(session)
          .exec();
        if (!tournament) throw new NotFoundException('Torneo no encontrado.');
        if (tournament.status !== 'OPEN') {
          throw new ConflictException(
            'El torneo no acepta nuevas inscripciones.',
          );
        }

        if (tournament.visibility === 'PRIVATE') {
          if (!dto.joinCode || !tournament.joinCodeHash) {
            throw new ForbiddenException('El codigo de acceso es obligatorio.');
          }
          const suppliedHash = hashJoinCode(dto.joinCode);
          if (!secureHashEquals(suppliedHash, tournament.joinCodeHash)) {
            throw new ForbiddenException('El codigo de acceso no es valido.');
          }
        }

        const capacityFilter = tournament.maxParticipants
          ? { participantCount: { $lt: tournament.maxParticipants } }
          : {};
        const claimed = await this.tournamentModel
          .findOneAndUpdate(
            { _id: tournament._id, ...capacityFilter },
            { $inc: { participantCount: 1 } },
            { returnDocument: 'after', session },
          )
          .exec();
        if (!claimed) {
          throw new ConflictException('El torneo alcanzo su capacidad maxima.');
        }

        const [participant] = await this.participantModel.create(
          [
            {
              tournamentId: tournament._id,
              userId: new Types.ObjectId(userId),
              availableBalance: tournament.initialBalance,
              reservedBalance: 0,
              initialBalance: tournament.initialBalance,
              status: 'ACTIVE',
              joinedAt: new Date(),
            },
          ],
          { session },
        );
        return participant;
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException('Ya estas inscrito en este torneo.');
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async listParticipants(tournamentId: string, user: JwtPayload) {
    await this.assertOwnerOrAdmin(tournamentId, user);
    return this.participantModel
      .find({ tournamentId: new Types.ObjectId(tournamentId) })
      .populate('userId', 'fullName username email accountType')
      .sort({ joinedAt: 1 })
      .lean()
      .exec();
  }

  async removeParticipant(
    tournamentId: string,
    participantUserId: string,
    user: JwtPayload,
  ): Promise<void> {
    const tournament = await this.assertOwnerOrAdmin(tournamentId, user);
    if (!['DRAFT', 'OPEN'].includes(tournament.status)) {
      throw new ConflictException(
        'No se puede retirar participantes despues de iniciar el torneo.',
      );
    }
    const result = await this.participantModel.deleteOne({
      tournamentId: tournament._id,
      userId: new Types.ObjectId(participantUserId),
    });
    if (!result.deletedCount) {
      throw new NotFoundException('Participante no encontrado.');
    }
    await this.tournamentModel.updateOne(
      { _id: tournament._id, participantCount: { $gt: 0 } },
      { $inc: { participantCount: -1 } },
    );
  }

  async rotateJoinCode(tournamentId: string, user: JwtPayload) {
    const tournament = await this.assertOwnerOrAdmin(tournamentId, user);
    if (['FINISHED', 'CANCELLED'].includes(tournament.status)) {
      throw new ConflictException('El torneo ya esta cerrado.');
    }
    const joinCode = generateJoinCode();
    tournament.joinCodeHash = hashJoinCode(joinCode);
    await tournament.save();
    return { joinCode };
  }

  async assertOwnerOrAdmin(tournamentId: string, user: JwtPayload) {
    const tournament = await this.findById(tournamentId);
    if (user.role !== 'admin' && !tournament.ownerId.equals(user.sub)) {
      throw new ForbiddenException('No administras este torneo.');
    }
    return tournament;
  }

  async findById(tournamentId: string) {
    const tournament = await this.tournamentModel.findById(tournamentId).exec();
    if (!tournament) throw new NotFoundException('Torneo no encontrado.');
    return tournament;
  }

  private validateDates(startValue: string, endValue: string) {
    const startAt = new Date(startValue);
    const endAt = new Date(endValue);
    if (endAt.getTime() <= startAt.getTime()) {
      throw new BadRequestException(
        'La fecha de termino debe ser posterior a la fecha de inicio.',
      );
    }
    if (endAt.getTime() - startAt.getTime() > MAX_TOURNAMENT_DURATION_MS) {
      throw new BadRequestException(
        'Un torneo no puede durar mas de 366 dias.',
      );
    }
    return { startAt, endAt };
  }

  async transitionAutomatically(
    from: TournamentStatus,
    to: TournamentStatus,
    dateFilter: Record<string, any>,
  ): Promise<void> {
    await this.tournamentModel.updateMany(
      { status: from, ...dateFilter },
      { $set: { status: to } },
    );
  }
}
