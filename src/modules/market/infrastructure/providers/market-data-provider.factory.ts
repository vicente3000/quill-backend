import { MarketDataProvider } from './market-data-provider.interface';
import { EodhdMarketDataProvider } from './eodhd-market-data.provider';
import { MockMarketDataProvider } from './mock-market-data.provider';
import { NoneMarketDataProvider } from './none-market-data.provider';
import { YahooFinanceMarketDataProvider } from './yahoo-finance-market-data.provider';

/**
 * Factory for creating provider instances based on configuration.
 * Supports dynamic provider selection at runtime.
 */
export class MarketDataProviderFactory {
  /**
   * Create a provider instance based on provider name.
   *
   * @param providerName - 'mock' | 'eodhd' | 'none' | undefined | ''
   * @param mockProvider - Injected MockMarketDataProvider instance
   * @param eodhdProvider - Injected EodhdMarketDataProvider instance
   * @param noneProvider - Injected NoneMarketDataProvider instance
   * @returns MarketDataProvider instance ready to use
   * @throws Error if provider name is invalid
   */
  static createProvider(
    providerName: string | undefined,
    mockProvider: MockMarketDataProvider,
    eodhdProvider: EodhdMarketDataProvider,
    yahooProvider: YahooFinanceMarketDataProvider,
    noneProvider: NoneMarketDataProvider,
  ): MarketDataProvider {
    const normalizedName = providerName?.toLowerCase().trim();

    switch (normalizedName) {
      case 'mock':
        return mockProvider;
      case 'eodhd':
        return eodhdProvider;
      case 'yahoo':
        return yahooProvider;
      case 'none':
      case '':
      case undefined:
        return noneProvider;
      default:
        throw new Error(
          `Unknown market provider: "${providerName}". Valid options: "mock", "eodhd", "yahoo"`,
        );
    }
  }
}
