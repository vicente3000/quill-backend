import { CurrencyDataProvider } from '../../domain/interfaces/currency-data-provider.interface';
import { ExchangeRateCurrencyDataProvider } from './exchangeRate-currency-data.provider';
import { MockCurrencyDataProvider } from './mock-currency-data.provider';
import { NoneCurrencyDataProvider } from './none-currency-data.provider';
import { YahooFinanceCurrencyDataProvider } from './yahoo-finance-currency-data.provider';

export class CurrencyProviderFactory {
  static createProvider(
    providerName: string | undefined,
    mockProvider: MockCurrencyDataProvider,
    exchangeRate: ExchangeRateCurrencyDataProvider,
    yahooFinance: YahooFinanceCurrencyDataProvider,
    noneProvider: NoneCurrencyDataProvider,
  ): CurrencyDataProvider {
    const normalizedName = providerName?.trim();

    switch (normalizedName) {
      case 'mock':
        return mockProvider;
      case 'exchangeRate':
        return exchangeRate;
      case 'yahoo':
        return yahooFinance;
      case 'none':
      case '':
      case undefined:
        return noneProvider;
      default:
        throw new Error(
          `Unknown currency provider: "${providerName}". Valid options: "mock", "exchangeRate", "yahoo"`,
        );
    }
  }
}
