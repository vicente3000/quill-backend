import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ContestEntity } from '../../domain/entities/contest.entity';
import { ContestEnrollmentsService } from './contest-enrollments.service';

const userId = new Types.ObjectId().toString();
const contestId = new Types.ObjectId().toString();

const buildContest = (
  overrides: Partial<ContestEntity> = {},
): ContestEntity => ({
  id: contestId,
  name: 'Concurso Otoño',
  description: 'Concurso interno',
  startDate: new Date('2026-11-01T00:00:00.000Z'),
  endDate: new Date('2026-12-01T00:00:00.000Z'),
  initialBalance: 1_000_000,
  mode: 'INDIVIDUAL',
  allowedAccountTypes: ['UNIVERSITY'],
  status: 'ACTIVE',
  participantsCount: 2,
  createdBy: new Types.ObjectId().toString(),
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  ...overrides,
});

const leanQuery = <T>(value: T) => {
  const query = {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };

  return query;
};

describe('ContestEnrollmentsService', () => {
  let service: ContestEnrollmentsService;
  let participantModel: {
    find: jest.Mock;
    exists: jest.Mock;
    create: jest.Mock;
  };
  let contestsService: { findAll: jest.Mock; findOne: jest.Mock };

  beforeEach(() => {
    participantModel = {
      find: jest.fn(),
      exists: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    };
    contestsService = { findAll: jest.fn(), findOne: jest.fn() };
    service = new ContestEnrollmentsService(
      participantModel as never,
      contestsService as never,
    );
  });

  describe('findAllForUser', () => {
    it('devuelve participantsCount e isEnrolled sin datos internos', async () => {
      const enrolled = buildContest({ participantsCount: 4 });
      const other = buildContest({
        id: new Types.ObjectId().toString(),
        participantsCount: 0,
      });
      contestsService.findAll.mockResolvedValue([enrolled, other]);
      participantModel.find.mockReturnValue(
        leanQuery([{ contestId: new Types.ObjectId(enrolled.id) }]),
      );

      const result = await service.findAllForUser(userId);

      expect(participantModel.find).toHaveBeenCalledTimes(1);
      expect(participantModel.find).toHaveBeenCalledWith({
        userId: new Types.ObjectId(userId),
      });
      expect(result).toEqual([
        {
          id: enrolled.id,
          name: enrolled.name,
          description: enrolled.description,
          startDate: enrolled.startDate,
          endDate: enrolled.endDate,
          initialBalance: enrolled.initialBalance,
          mode: enrolled.mode,
          allowedAccountTypes: enrolled.allowedAccountTypes,
          status: 'ACTIVE',
          participantsCount: 4,
          isEnrolled: true,
        },
        expect.objectContaining({
          id: other.id,
          participantsCount: 0,
          isEnrolled: false,
        }),
      ]);
      expect(result[0]).not.toHaveProperty('createdBy');
    });
  });

  describe('enroll', () => {
    it('inscribe al usuario en un concurso activo', async () => {
      const joinedAt = new Date('2026-11-15T00:00:00.000Z');
      contestsService.findOne.mockResolvedValue(buildContest());
      participantModel.create.mockResolvedValue({ createdAt: joinedAt });

      const result = await service.enroll(contestId, userId);

      expect(participantModel.create).toHaveBeenCalledWith({
        contestId: new Types.ObjectId(contestId),
        userId: new Types.ObjectId(userId),
      });
      expect(result).toEqual({ contestId, userId, joinedAt });
    });

    it('permite inscribirse en un concurso por comenzar', async () => {
      contestsService.findOne.mockResolvedValue(
        buildContest({ status: 'UPCOMING' }),
      );
      participantModel.create.mockResolvedValue({ createdAt: new Date() });

      await expect(service.enroll(contestId, userId)).resolves.toMatchObject({
        contestId,
      });
    });

    it('propaga NotFoundException si el concurso no existe', async () => {
      contestsService.findOne.mockRejectedValue(
        new NotFoundException('Concurso no encontrado.'),
      );

      await expect(service.enroll(contestId, userId)).rejects.toThrow(
        'Concurso no encontrado.',
      );
      expect(participantModel.create).not.toHaveBeenCalled();
    });

    it('rechaza un concurso finalizado', async () => {
      contestsService.findOne.mockResolvedValue(
        buildContest({ status: 'FINISHED' }),
      );

      await expect(service.enroll(contestId, userId)).rejects.toThrow(
        new ConflictException('El concurso ya finalizó.'),
      );
      expect(participantModel.create).not.toHaveBeenCalled();
    });

    it('rechaza un concurso por equipos', async () => {
      contestsService.findOne.mockResolvedValue(buildContest({ mode: 'TEAM' }));

      await expect(service.enroll(contestId, userId)).rejects.toThrow(
        'Este concurso es por equipos; la inscripción individual no está disponible.',
      );
      expect(participantModel.create).not.toHaveBeenCalled();
    });

    it('rechaza si el usuario ya está inscrito', async () => {
      contestsService.findOne.mockResolvedValue(buildContest());
      participantModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });

      await expect(service.enroll(contestId, userId)).rejects.toThrow(
        new ConflictException('Ya estás inscrito en este concurso.'),
      );
      expect(participantModel.create).not.toHaveBeenCalled();
    });

    it('traduce una colisión concurrente (11000) a conflicto', async () => {
      contestsService.findOne.mockResolvedValue(buildContest());
      participantModel.create.mockRejectedValue({
        code: 11000,
        keyPattern: { contestId: 1, userId: 1 },
      });

      await expect(service.enroll(contestId, userId)).rejects.toThrow(
        new ConflictException('Ya estás inscrito en este concurso.'),
      );
    });

    it('propaga otros errores de persistencia', async () => {
      const failure = new Error('db caída');
      contestsService.findOne.mockResolvedValue(buildContest());
      participantModel.create.mockRejectedValue(failure);

      await expect(service.enroll(contestId, userId)).rejects.toBe(failure);
    });
  });
});
