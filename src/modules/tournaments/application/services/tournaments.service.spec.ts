import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Types } from 'mongoose';
import { TournamentsService } from './tournaments.service';

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('TournamentsService', () => {
  let service: TournamentsService;
  let tournamentModel: {
    create: jest.Mock;
    findById: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
  let participantModel: {
    create: jest.Mock;
    countDocuments: jest.Mock;
    exists: jest.Mock;
  };
  let session: { withTransaction: jest.Mock; endSession: jest.Mock };

  beforeEach(() => {
    tournamentModel = {
      create: jest.fn(),
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };
    participantModel = {
      create: jest.fn(),
      countDocuments: jest.fn().mockResolvedValue(0),
      exists: jest.fn(),
    };
    session = {
      withTransaction: jest.fn((callback: () => Promise<unknown>) =>
        callback(),
      ),
      endSession: jest.fn(),
    };
    service = new TournamentsService(
      tournamentModel as never,
      participantModel as never,
      { startSession: jest.fn().mockResolvedValue(session) } as never,
    );
  });

  it('crea un torneo privado con codigo de acceso almacenado como hash', async () => {
    tournamentModel.create.mockImplementation(
      (input: Record<string, unknown>) =>
        Promise.resolve({ toObject: () => input }),
    );

    const result = await service.create(new Types.ObjectId().toString(), {
      name: 'Torneo Finanzas 2026',
      startAt: '2026-11-01T12:00:00.000Z',
      endAt: '2026-11-30T12:00:00.000Z',
      initialBalance: 1_000_000,
      visibility: 'PRIVATE',
    });

    expect(result.joinCode).toMatch(/^[A-Z0-9]{8}$/);
    expect(tournamentModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Torneo Finanzas 2026',
        initialBalance: 1_000_000,
        status: 'DRAFT',
      }),
    );
    const createCalls = tournamentModel.create.mock.calls as unknown as Array<
      [{ joinCodeHash: string }]
    >;
    const createInput = createCalls[0][0];
    expect(createInput.joinCodeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createInput.joinCodeHash).not.toBe(result.joinCode);
  });

  it('rechaza un rango de fechas invalido', async () => {
    await expect(
      service.create(new Types.ObjectId().toString(), {
        name: 'Torneo invalido',
        startAt: '2026-11-30T12:00:00.000Z',
        endAt: '2026-11-01T12:00:00.000Z',
        initialBalance: 100_000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tournamentModel.create).not.toHaveBeenCalled();
  });

  it('valida el codigo de un torneo privado antes de crear la cuenta', async () => {
    const tournamentId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const tournament = {
      _id: tournamentId,
      status: 'OPEN',
      visibility: 'PRIVATE',
      joinCodeHash: hash('ABC12345'),
      initialBalance: 500_000,
      maxParticipants: 30,
    };
    tournamentModel.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(tournament),
        }),
      }),
    });
    tournamentModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(tournament),
    });
    participantModel.create.mockResolvedValue([{ id: 'membership-1' }]);

    await expect(
      service.join(tournamentId.toString(), userId.toString(), {
        joinCode: 'BAD12345',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await service.join(tournamentId.toString(), userId.toString(), {
      joinCode: 'ABC12345',
    });

    expect(participantModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          tournamentId,
          userId,
          availableBalance: 500_000,
          reservedBalance: 0,
          initialBalance: 500_000,
        }),
      ],
      { session },
    );
  });
});
