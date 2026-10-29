import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { deriveContestStatus } from '../../domain/entities/contest.entity';
import { CreateContestDto } from '../../presentation/dto/create-contest.dto';
import { ContestsService } from './contests.service';

const adminId = new Types.ObjectId().toString();

const buildRecord = (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  name: 'Concurso Otoño',
  description: 'Concurso interno',
  startDate: new Date('2026-11-01T00:00:00.000Z'),
  endDate: new Date('2026-12-01T00:00:00.000Z'),
  initialBalance: 1_000_000,
  mode: 'INDIVIDUAL',
  allowedAccountTypes: ['UNIVERSITY'],
  createdBy: new Types.ObjectId(adminId),
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  ...overrides,
});

const leanQuery = <T>(value: T) => {
  const query = {
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };

  return query;
};

const execQuery = <T>(value: T) => ({
  exec: jest.fn().mockResolvedValue(value),
});

describe('ContestsService', () => {
  let service: ContestsService;
  let contestModel: {
    create: jest.Mock;
    find: jest.Mock;
    findById: jest.Mock;
  };
  let participantModel: { aggregate: jest.Mock; countDocuments: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-15T00:00:00.000Z') });
    contestModel = { create: jest.fn(), find: jest.fn(), findById: jest.fn() };
    participantModel = { aggregate: jest.fn(), countDocuments: jest.fn() };
    service = new ContestsService(
      contestModel as never,
      participantModel as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('create', () => {
    const dto: CreateContestDto = {
      name: 'Concurso Otoño',
      description: 'Concurso interno',
      startDate: '2026-11-01T00:00:00.000Z',
      endDate: '2026-12-01T00:00:00.000Z',
      initialBalance: 1_000_000,
      mode: 'INDIVIDUAL',
      allowedAccountTypes: ['UNIVERSITY'],
    };

    it('persiste el concurso con createdBy y fechas como Date', async () => {
      const record = buildRecord();
      contestModel.create.mockResolvedValue(record);

      const result = await service.create(adminId, dto);

      expect(contestModel.create).toHaveBeenCalledWith({
        ...dto,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        createdBy: new Types.ObjectId(adminId),
      });
      expect(result).toEqual({
        id: record._id.toString(),
        name: record.name,
        description: record.description,
        startDate: record.startDate,
        endDate: record.endDate,
        initialBalance: record.initialBalance,
        mode: record.mode,
        allowedAccountTypes: record.allowedAccountTypes,
        status: 'ACTIVE',
        participantsCount: 0,
        createdBy: adminId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
    });
  });

  describe('findAll', () => {
    it('ordena por startDate descendente y devuelve el status derivado', async () => {
      const upcoming = buildRecord({
        startDate: new Date('2026-12-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
      });
      const finished = buildRecord({
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-10-01T00:00:00.000Z'),
      });
      const query = leanQuery([upcoming, finished]);
      contestModel.find.mockReturnValue(query);
      participantModel.aggregate.mockReturnValue(execQuery([]));

      const result = await service.findAll();

      expect(query.sort).toHaveBeenCalledWith({ startDate: -1 });
      expect(result.map((contest) => contest.status)).toEqual([
        'UPCOMING',
        'FINISHED',
      ]);
    });

    it('incluye participantsCount con una sola agregación', async () => {
      const withParticipants = buildRecord();
      const withoutParticipants = buildRecord();
      contestModel.find.mockReturnValue(
        leanQuery([withParticipants, withoutParticipants]),
      );
      participantModel.aggregate.mockReturnValue(
        execQuery([{ _id: withParticipants._id, count: 3 }]),
      );

      const result = await service.findAll();

      expect(participantModel.aggregate).toHaveBeenCalledTimes(1);
      expect(participantModel.countDocuments).not.toHaveBeenCalled();
      expect(result.map((contest) => contest.participantsCount)).toEqual([
        3, 0,
      ]);
    });

    it('devuelve una lista vacía si no hay concursos', async () => {
      contestModel.find.mockReturnValue(leanQuery([]));
      participantModel.aggregate.mockReturnValue(execQuery([]));

      await expect(service.findAll()).resolves.toEqual([]);
    });
  });

  describe('findOne', () => {
    it('devuelve el concurso encontrado', async () => {
      const record = buildRecord();
      contestModel.findById.mockReturnValue(leanQuery(record));
      participantModel.countDocuments.mockReturnValue(execQuery(5));

      const result = await service.findOne(record._id.toString());

      expect(contestModel.findById).toHaveBeenCalledWith(record._id.toString());
      expect(participantModel.countDocuments).toHaveBeenCalledWith({
        contestId: record._id,
      });
      expect(result.id).toBe(record._id.toString());
      expect(result.participantsCount).toBe(5);
    });

    it('lanza NotFoundException si no existe', async () => {
      contestModel.findById.mockReturnValue(leanQuery(null));

      await expect(
        service.findOne(new Types.ObjectId().toString()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('status derivado', () => {
    const startDate = new Date('2026-11-01T00:00:00.000Z');
    const endDate = new Date('2026-12-01T00:00:00.000Z');
    const at = (iso: string) =>
      deriveContestStatus(startDate, endDate, new Date(iso));

    it.each([
      [
        'un milisegundo antes del inicio',
        '2026-10-31T23:59:59.999Z',
        'UPCOMING',
      ],
      ['exactamente en startDate', '2026-11-01T00:00:00.000Z', 'ACTIVE'],
      ['durante el concurso', '2026-11-15T00:00:00.000Z', 'ACTIVE'],
      ['exactamente en endDate', '2026-12-01T00:00:00.000Z', 'ACTIVE'],
      [
        'un milisegundo después del fin',
        '2026-12-01T00:00:00.001Z',
        'FINISHED',
      ],
    ])('%s', (_label, now, expected) => {
      expect(at(now)).toBe(expected);
    });

    it('usa la hora actual por defecto', () => {
      jest.setSystemTime(new Date('2027-01-01T00:00:00.000Z'));

      expect(deriveContestStatus(startDate, endDate)).toBe('FINISHED');
    });
  });
});
