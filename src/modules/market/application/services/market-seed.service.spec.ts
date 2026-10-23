import { MarketSeedService } from './market-seed.service';
import { Logger } from '@nestjs/common';

interface MarketSeedInternals {
  logger: Logger;
  resolveSeedStocks(): Array<Record<string, unknown>>;
  prepareSeedDocuments(
    stocks: Array<{
      symbol: string;
      name: string;
      currency: string;
      close: number;
    }>,
  ): Array<Record<string, unknown>>;
}

describe('MarketSeedService', () => {
  let service: MarketSeedService;
  let internals: MarketSeedInternals;
  let stockModel: { find: jest.Mock; insertMany: jest.Mock };
  let provider: { getName: jest.Mock; getSeedData: jest.Mock };

  beforeEach(() => {
    stockModel = {
      find: jest.fn(),
      insertMany: jest.fn().mockResolvedValue([]),
    };
    provider = {
      getName: jest.fn().mockReturnValue('mock'),
      getSeedData: jest.fn(),
    };
    service = new MarketSeedService(
      stockModel as never,
      provider as never,
    );
    internals = service as unknown as MarketSeedInternals;
  });
  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  describe('seedInitialStocks', () => {
    it('returns early when no seed data resolved', async () => {
      provider.getSeedData.mockReturnValue([]);

      await service.seedInitialStocks();

      expect(stockModel.find).not.toHaveBeenCalled();
      expect(stockModel.insertMany).not.toHaveBeenCalled();
    });

    it('inserts missing stocks that do not exist in DB', async () => {
      provider.getSeedData.mockReturnValue([
        { symbol: 'AAPL', name: 'Apple', currency: 'USD', close: 150 },
        { symbol: 'GOOGL', name: 'Alphabet', currency: 'USD', close: 2800 },
      ]);
      stockModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([{ symbol: 'AAPL' }]),
          }),
        }),
      });

      await service.seedInitialStocks();

      expect(stockModel.insertMany).toHaveBeenCalledWith([
        expect.objectContaining({ symbol: 'GOOGL' }),
      ]);
    });

    it('does not insert any stocks when all already exist', async () => {
      provider.getSeedData.mockReturnValue([
        { symbol: 'AAPL', name: 'Apple', currency: 'USD', close: 150 },
      ]);
      stockModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([{ symbol: 'AAPL' }]),
          }),
        }),
      });

      await service.seedInitialStocks();

      expect(stockModel.insertMany).not.toHaveBeenCalled();
    });

    it('does not generate historical snapshots when creating symbols', async () => {
      provider.getSeedData.mockReturnValue([
        { symbol: 'AAPL', name: 'Apple', currency: 'USD', close: 150 },
      ]);
      stockModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      await service.seedInitialStocks();

      expect(stockModel.insertMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('resolveSeedStocks', () => {
    it('returns provider seed data when available', () => {
      provider.getSeedData.mockReturnValue([{ symbol: 'TEST', close: 100 }]);
      const result = internals.resolveSeedStocks();
      expect(result).toEqual([{ symbol: 'TEST', close: 100 }]);
    });

    it('returns empty array when provider returns empty array', () => {
      provider.getSeedData.mockReturnValue([]);
      const result = internals.resolveSeedStocks();
      expect(result).toEqual([]);
    });

    it('falls back to hardcoded seed stocks when provider has no getSeedData', () => {
      provider.getSeedData.mockReturnValue(undefined);
      const result = internals.resolveSeedStocks();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('symbol');
    });
  });

  describe('prepareSeedDocuments', () => {
    it('normalizes stock documents with defaults', () => {
      const docs = internals.prepareSeedDocuments([
        { symbol: 'AAPL', name: 'Apple', currency: 'USD', close: 150 },
      ]);
      expect(docs[0]).toMatchObject({
        symbol: 'AAPL',
        name: 'Apple',
        currency: 'USD',
        close: 150,
        previousClose: 0,
        dayChangePercentage: 0,
        source: 'mock',
      });
    });
  });
});
