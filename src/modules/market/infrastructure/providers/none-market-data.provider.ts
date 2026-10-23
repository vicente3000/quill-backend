import type { MarketQuote } from '../../domain/interfaces/market-quote.interface';
import { MarketDataProvider } from './market-data-provider.interface';

export class NoneMarketDataProvider implements MarketDataProvider {
  getName(): string {
    return 'none';
  }

  getQuote(symbol: string): Promise<MarketQuote> {
    return Promise.reject(
      new Error(
        `No hay datos configurados para ${symbol}. Establezca MARKET_PROVIDER=mock, MARKET_PROVIDER=eodhd o MARKET_PROVIDER=yahoo en el archivo .env`,
      ),
    );
  }
}
