import { CurrencyProviderFactory } from './currency-provider.factory';

describe('CurrencyProviderFactory', () => {
  const mockProvider = { getName: () => 'mock' };
  const exchangeRateProvider = { getName: () => 'exchangeRate' };
  const yahooProvider = { getName: () => 'yahooFinance' };
  const noneProvider = { getName: () => 'none' };

  it('creates mock provider', () => {
    const result = CurrencyProviderFactory.createProvider(
      'mock',
      mockProvider as never,
      exchangeRateProvider as never,
      yahooProvider as never,
      noneProvider as never,
    );
    expect(result.getName()).toBe('mock');
  });

  it('creates exchangeRate provider', () => {
    const result = CurrencyProviderFactory.createProvider(
      'exchangeRate',
      mockProvider as never,
      exchangeRateProvider as never,
      yahooProvider as never,
      noneProvider as never,
    );
    expect(result.getName()).toBe('exchangeRate');
  });

  it('creates none provider for "none"', () => {
    const result = CurrencyProviderFactory.createProvider(
      'none',
      mockProvider as never,
      exchangeRateProvider as never,
      yahooProvider as never,
      noneProvider as never,
    );
    expect(result.getName()).toBe('none');
  });

  it('creates none provider for empty string', () => {
    const result = CurrencyProviderFactory.createProvider(
      '',
      mockProvider as never,
      exchangeRateProvider as never,
      yahooProvider as never,
      noneProvider as never,
    );
    expect(result.getName()).toBe('none');
  });

  it('creates none provider for undefined', () => {
    const result = CurrencyProviderFactory.createProvider(
      undefined,
      mockProvider as never,
      exchangeRateProvider as never,
      yahooProvider as never,
      noneProvider as never,
    );
    expect(result.getName()).toBe('none');
  });

  it('trims provider name before matching', () => {
    const result = CurrencyProviderFactory.createProvider(
      '  mock  ',
      mockProvider as never,
      exchangeRateProvider as never,
      yahooProvider as never,
      noneProvider as never,
    );
    expect(result.getName()).toBe('mock');
  });

  it('throws for unknown provider', () => {
    expect(() =>
      CurrencyProviderFactory.createProvider(
        'unknown',
        mockProvider as never,
        exchangeRateProvider as never,
        yahooProvider as never,
        noneProvider as never,
      ),
    ).toThrow(/Unknown currency provider/);
  });

  it('creates yahoo provider', () => {
    const result = CurrencyProviderFactory.createProvider(
      'yahoo',
      mockProvider as never,
      exchangeRateProvider as never,
      yahooProvider as never,
      noneProvider as never,
    );
    expect(result.getName()).toBe('yahooFinance');
  });
});
