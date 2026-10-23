import { ConfigService } from '@nestjs/config';
import { MockMarketDataProvider } from './mock-market-data.provider';

function createLeanQuery<T>(value: T) {
  return {
    lean: jest
      .fn()
      .mockReturnValue({ exec: jest.fn().mockResolvedValue(value) }),
  };
}

function createFindOneQuery<T>(value: T | null) {
  return {
    lean: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(value),
    }),
  };
}

describe('MockMarketDataProvider', () => {
  let provider: MockMarketDataProvider;
  let configService: ConfigService;
  let stockModel: { find: jest.Mock; findOne: jest.Mock };

  beforeEach(() => {
    configService = {
      get: jest.fn((_key: string, fallback?: unknown) => fallback),
    } as unknown as ConfigService;
    stockModel = {
      find: jest.fn(),
      findOne: jest.fn().mockReturnValue(createFindOneQuery(null)),
    };
  });

  beforeEach(() => {
    provider = new MockMarketDataProvider(configService, stockModel as never);
  });

  describe('getQuote()', () => {
    it('should return MarketQuote with all required fields', async () => {
      const quote = await provider.getQuote('AAPL');

      expect(quote).toBeDefined();
      expect(quote.symbol).toBe('AAPL');
      expect(typeof quote.price).toBe('number');
      expect(quote.currency).toBe('USD');
      expect(quote.timestamp).toBeInstanceOf(Date);
      expect(quote.exchange).toBe('MOCK');
      expect(quote.open).toBeGreaterThan(0);
      expect(quote.high).toBeGreaterThanOrEqual(quote.close!);
      expect(quote.low).toBeLessThanOrEqual(quote.close!);
      expect(quote.volume).toBeGreaterThan(0);
    });

    it('should generate different prices for same symbol (momentum)', async () => {
      const quote1 = await provider.getQuote('COPEC');
      const quote2 = await provider.getQuote('COPEC');

      expect(quote1.price).not.toBe(quote2.price);
      expect(typeof quote1.price).toBe('number');
      expect(typeof quote2.price).toBe('number');
    });

    it('should handle uppercase and lowercase symbols', async () => {
      const quote1 = await provider.getQuote('aapl');
      const quote2 = await provider.getQuote('AAPL');

      expect(quote1.symbol).toBe('AAPL');
      expect(quote2.symbol).toBe('AAPL');
    });
  });

  describe('DB seeding', () => {
    it('seeds from database when stocks exist', async () => {
      const dbStocks = [
        { symbol: 'DBSTOCK', close: 250, previousClose: 245, currency: 'USD' },
      ];
      stockModel.find.mockReturnValue(createLeanQuery(dbStocks));

      const quote = await provider.getQuote('DBSTOCK');

      expect(quote.price).toBeGreaterThan(0);
      expect(quote.currency).toBe('USD');
    });

    it('falls back to hardcoded seeds when DB is empty', async () => {
      stockModel.find.mockReturnValue(createLeanQuery([]));

      const quote = await provider.getQuote('AAPL');

      expect(quote.symbol).toBe('AAPL');
      expect(quote.price).toBeGreaterThan(0);
    });

    it('falls back to hardcoded seeds when DB query fails', async () => {
      stockModel.find.mockReturnValue({
        lean: jest.fn(() => ({
          exec: jest.fn().mockRejectedValue(new Error('DB error')),
        })),
      });

      const quote = await provider.getQuote('GOOG');

      expect(quote.symbol).toBe('GOOG');
      expect(quote.price).toBeGreaterThan(0);
    });

    it('only queries the database once', async () => {
      stockModel.find.mockReturnValue(createLeanQuery([]));

      await provider.getQuote('AAPL');
      await provider.getQuote('MSFT');

      expect(stockModel.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('getName()', () => {
    it('should return "Mock"', () => {
      expect(provider.getName()).toBe('Mock');
    });
  });

  describe('getSeedData()', () => {
    it('returns seed stocks with correct shape', () => {
      const seeds = provider.getSeedData();

      expect(Array.isArray(seeds)).toBe(true);
      expect(seeds.length).toBeGreaterThan(0);
      expect(seeds[0]).toMatchObject({
        dayChangePercentage: 1.5,
        source: 'mock',
      });
      expect(typeof seeds[0].symbol).toBe('string');
      expect(typeof seeds[0].name).toBe('string');
      expect(typeof seeds[0].currency).toBe('string');
      expect(typeof seeds[0].close).toBe('number');
      expect(typeof seeds[0].previousClose).toBe('number');
    });
  });

  describe('getRefreshSchedule()', () => {
    it('returns cron from config with default fallback', () => {
      const schedule = provider.getRefreshSchedule();

      expect(schedule).toBeDefined();
      expect(schedule!.cronExpression).toBe('0 30 18 * * 1-5');
    });

    it('uses config value when provided', () => {
      configService = {
        get: jest.fn((key: string) => {
          if (key === 'MOCK_DAILY_REFRESH_CRON') return '0 0 * * *';
          return undefined;
        }),
      } as unknown as ConfigService;
      provider = new MockMarketDataProvider(configService, stockModel as never);

      const schedule = provider.getRefreshSchedule();

      expect(schedule!.cronExpression).toBe('0 0 * * *');
    });
  });
});
