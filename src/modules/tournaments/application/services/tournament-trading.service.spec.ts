import { Types } from 'mongoose';
import { TournamentTradingService } from './tournament-trading.service';

function sessionQuery<T>(value: T) {
  return {
    session: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(value),
    }),
  };
}

describe('TournamentTradingService', () => {
  let service: TournamentTradingService;
  let orderModel: { create: jest.Mock };
  let participant: {
    userId: Types.ObjectId;
    availableBalance: number;
    reservedBalance: number;
    save: jest.Mock;
  };
  let tournament: {
    _id: Types.ObjectId;
    status: string;
    startAt: Date;
    endAt: Date;
    commissionRate: number;
  };
  let session: { withTransaction: jest.Mock; endSession: jest.Mock };

  beforeEach(() => {
    const userId = new Types.ObjectId();
    tournament = {
      _id: new Types.ObjectId(),
      status: 'ACTIVE',
      startAt: new Date(Date.now() - 60_000),
      endAt: new Date(Date.now() + 60_000),
      commissionRate: 0.01,
    };
    participant = {
      userId,
      availableBalance: 1_000,
      reservedBalance: 0,
      save: jest.fn(),
    };
    session = {
      withTransaction: jest.fn((callback: () => Promise<unknown>) =>
        callback(),
      ),
      endSession: jest.fn(),
    };
    orderModel = { create: jest.fn().mockResolvedValue([{ id: 'order-1' }]) };

    service = new TournamentTradingService(
      { startSession: jest.fn().mockResolvedValue(session) } as never,
      {
        findById: jest.fn().mockReturnValue(sessionQuery(tournament)),
      } as never,
      {
        findOne: jest.fn().mockReturnValue(sessionQuery(participant)),
      } as never,
      {} as never,
      orderModel as never,
      {} as never,
      {
        findOne: jest
          .fn()
          .mockReturnValue(sessionQuery({ symbol: 'AAPL', currency: 'CLP' })),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('reserva el saldo dentro de la cuenta del torneo', async () => {
    const result = await service.createOrder(
      tournament._id.toString(),
      participant.userId.toString(),
      {
        symbol: 'aapl',
        side: 'BUY',
        quantity: 2,
        type: 'LIMIT',
        limitPrice: 100,
      },
    );

    expect(participant.availableBalance).toBe(798);
    expect(participant.reservedBalance).toBe(202);
    expect(participant.save).toHaveBeenCalledWith({ session });
    expect(orderModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          tournamentId: tournament._id,
          userId: participant.userId,
          symbol: 'AAPL',
          reservedAmount: 202,
          status: 'PENDING',
        }),
      ],
      { session },
    );
    expect(result).toEqual({ id: 'order-1' });
  });
});
