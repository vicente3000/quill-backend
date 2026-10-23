import { MarketDataProviderFactory } from './market-data-provider.factory';
import { EodhdMarketDataProvider } from './eodhd-market-data.provider';
import { MockMarketDataProvider } from './mock-market-data.provider';
import { NoneMarketDataProvider } from './none-market-data.provider';
import { ConfigService } from '@nestjs/config';
import { YahooFinanceMarketDataProvider } from './yahoo-finance-market-data.provider';

describe('ProviderFactory', () => {
  let mockProvider: MockMarketDataProvider;
  let eodhdProvider: EodhdMarketDataProvider;
  let yahooProvider: YahooFinanceMarketDataProvider;
  let noneProvider: NoneMarketDataProvider;
  let configService: ConfigService;
  let stockModel: { find: jest.Mock };

  beforeEach(() => {
    configService = {
      get: jest.fn(),
    } as unknown as ConfigService;
    stockModel = { find: jest.fn() };

    mockProvider = new MockMarketDataProvider(
      configService,
      stockModel as never,
    );

    eodhdProvider = { getName: () => 'EODHD' } as EodhdMarketDataProvider;
    yahooProvider = {
      getName: () => 'YahooFinance',
    } as YahooFinanceMarketDataProvider;
    noneProvider = new NoneMarketDataProvider();
  });

  it('should create MockMarketDataProvider when "mock" is requested', () => {
    const provider = MarketDataProviderFactory.createProvider(
      'mock',
      mockProvider,
      eodhdProvider,
      yahooProvider,
      noneProvider,
    );

    expect(provider).toBe(mockProvider);
    expect(provider.getName()).toBe('Mock');
  });

  it('should create NoneMarketDataProvider when provider is empty', () => {
    const provider = MarketDataProviderFactory.createProvider(
      '',
      mockProvider,
      eodhdProvider,
      yahooProvider,
      noneProvider,
    );

    expect(provider).toBe(noneProvider);
    expect(provider.getName()).toBe('none');
  });

  it('should create NoneMarketDataProvider when provider is undefined', () => {
    const provider = MarketDataProviderFactory.createProvider(
      undefined,
      mockProvider,
      eodhdProvider,
      yahooProvider,
      noneProvider,
    );

    expect(provider).toBe(noneProvider);
    expect(provider.getName()).toBe('none');
  });

  it('should throw error for invalid provider name', () => {
    expect(() =>
      MarketDataProviderFactory.createProvider(
        'invalid',
        mockProvider,
        eodhdProvider,
        yahooProvider,
        noneProvider,
      ),
    ).toThrow('Unknown market provider');
  });

  it('should create EodhdMarketDataProvider when "eodhd" is requested', () => {
    const provider = MarketDataProviderFactory.createProvider(
      'eodhd',
      mockProvider,
      eodhdProvider,
      yahooProvider,
      noneProvider,
    );

    expect(provider).toBe(eodhdProvider);
    expect(provider.getName()).toBe('EODHD');
  });

  it('should be case-insensitive for provider names', () => {
    const provider1 = MarketDataProviderFactory.createProvider(
      'MOCK',
      mockProvider,
      eodhdProvider,
      yahooProvider,
      noneProvider,
    );
    const provider2 = MarketDataProviderFactory.createProvider(
      'MoCk',
      mockProvider,
      eodhdProvider,
      yahooProvider,
      noneProvider,
    );

    expect(provider1).toBe(mockProvider);
    expect(provider2).toBe(mockProvider);
  });

  it('should create YahooFinanceMarketDataProvider when "yahoo" is requested', () => {
    const provider = MarketDataProviderFactory.createProvider(
      'yahoo',
      mockProvider,
      eodhdProvider,
      yahooProvider,
      noneProvider,
    );

    expect(provider).toBe(yahooProvider);
  });
});
