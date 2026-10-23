import { EventEmitter2 } from '@nestjs/event-emitter';
import Decimal from 'decimal.js';
import { PRICE_UPDATE_EVENT } from '../../domain/constants/events';
import { MarketTickService } from './market-tick.service';

interface MarketTickInternals {
  isTicking: boolean;
}

describe('MarketTickService', () => {
  let service: MarketTickService;
  let internals: MarketTickInternals;
  let stockModel: { find: jest.Mock };
  let snapshotModel: { insertMany: jest.Mock };
  let strategy: { calculateNextTick: jest.Mock };
  let cacheService: { get: jest.Mock; set: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  const mockStock = {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    currency: 'USD',
    previousClose: 100,
    close: 100,
    baseVolatility: 0.015,
    baseDrift: 0,
  };

  beforeEach(() => {
    stockModel = { find: jest.fn() };
    snapshotModel = { insertMany: jest.fn().mockResolvedValue([]) };
    strategy = { calculateNextTick: jest.fn() };
    cacheService = { get: jest.fn(), set: jest.fn() };
    eventEmitter = { emit: jest.fn() };

    service = new MarketTickService(
      stockModel as never,
      snapshotModel as never,
      strategy as never,
      cacheService as never,
      eventEmitter as never as EventEmitter2,
    );
    internals = service as unknown as MarketTickInternals;
  });

  describe('processTick', () => {
    it('skips when already ticking (concurrent guard)', async () => {
      internals.isTicking = true;

      await service.processTick();

      expect(stockModel.find).not.toHaveBeenCalled();
    });

    it('returns early when no stocks in database', async () => {
      stockModel.find.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });

      await service.processTick();

      expect(cacheService.get).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('processes all stocks and emits price updates', async () => {
      stockModel.find.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([
            { ...mockStock, symbol: 'AAPL' },
            {
              ...mockStock,
              symbol: 'GOOGL',
              baseVolatility: 0.02,
              baseDrift: 0.001,
            },
          ]),
        }),
      });
      cacheService.get
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(102)
        .mockResolvedValueOnce(1800)
        .mockResolvedValueOnce(1820);
      strategy.calculateNextTick
        .mockReturnValueOnce(new Decimal(105))
        .mockReturnValueOnce(new Decimal(1850));

      await service.processTick();

      expect(strategy.calculateNextTick).toHaveBeenCalledTimes(2);
      expect(cacheService.set).toHaveBeenNthCalledWith(
        1,
        'stock:AAPL:live_price',
        105,
        60_000,
      );
      expect(cacheService.set).toHaveBeenNthCalledWith(
        2,
        'stock:GOOGL:live_price',
        1850,
        60_000,
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(PRICE_UPDATE_EVENT, [
        expect.objectContaining({ symbol: 'AAPL', close: 105 }),
        expect.objectContaining({ symbol: 'GOOGL', close: 1850 }),
      ]);
      expect(snapshotModel.insertMany).toHaveBeenCalledWith([
        expect.objectContaining({
          symbol: 'AAPL',
          open: 102,
          high: 105,
          low: 102,
          close: 105,
          source: 'simulation',
        }),
        expect.objectContaining({
          symbol: 'GOOGL',
          open: 1820,
          high: 1850,
          low: 1820,
          close: 1850,
          source: 'simulation',
        }),
      ]);
    });

    it('skips stocks with missing cache data', async () => {
      stockModel.find.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest
            .fn()
            .mockResolvedValue([mockStock, { ...mockStock, symbol: 'GOOGL' }]),
        }),
      });
      cacheService.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(102)
        .mockResolvedValueOnce(1800)
        .mockResolvedValueOnce(null);

      await service.processTick();

      expect(strategy.calculateNextTick).not.toHaveBeenCalled();
      expect(snapshotModel.insertMany).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('uses default volatility and drift when stock values are missing', async () => {
      stockModel.find.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([
            {
              symbol: 'TEST',
              name: 'Test',
              currency: 'USD',
              previousClose: 100,
              close: 100,
            },
          ]),
        }),
      });
      cacheService.get.mockResolvedValueOnce(100).mockResolvedValueOnce(102);
      strategy.calculateNextTick.mockReturnValue(new Decimal(104));

      await service.processTick();

      const calls = strategy.calculateNextTick.mock.calls as unknown as Array<
        [unknown, unknown, Decimal, Decimal]
      >;
      const volatilityArg = calls[0][2];
      const driftArg = calls[0][3];
      expect(volatilityArg.toNumber()).toBe(0.015);
      expect(driftArg.toNumber()).toBe(0);
    });

    it('resets isTicking in finally block', async () => {
      stockModel.find.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });

      await service.processTick();

      expect(internals.isTicking).toBe(false);
    });

    it('does not emit when no updates collected', async () => {
      stockModel.find.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockStock]),
        }),
      });
      cacheService.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      await service.processTick();

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
