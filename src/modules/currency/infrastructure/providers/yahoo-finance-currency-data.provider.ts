import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchYahooFinanceQuote } from '../../../../common/integrations/yahoo-finance.client';
import type { MarketQuote } from '../../../market/domain/interfaces/market-quote.interface';
import type {
  CurrencyDataProvider,
  ProviderRefreshSchedule,
} from '../../domain/interfaces/currency-data-provider.interface';

@Injectable()
export class YahooFinanceCurrencyDataProvider implements CurrencyDataProvider {
  constructor(private readonly configService: ConfigService) {}

  async getQuote(symbol: string): Promise<MarketQuote> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const ticker =
      normalizedSymbol === 'USDCLP' ? 'CLP=X' : `${normalizedSymbol}=X`;
    const quote = await fetchYahooFinanceQuote(
      ticker,
      this.configService.get<string>(
        'YAHOO_FINANCE_BASE_URL',
        'https://query1.finance.yahoo.com',
      ),
    );

    return {
      symbol: normalizedSymbol,
      price: quote.price,
      close: quote.price,
      currency: normalizedSymbol.slice(3),
      timestamp: quote.timestamp,
      exchange: quote.exchange,
      source: 'yahoo',
      previousClose: quote.previousClose,
    };
  }

  getName(): string {
    return 'yahooFinance';
  }

  getSymbols(): string[] {
    return this.configService
      .get<string>('YAHOO_CURRENCY_SYMBOLS', 'USDCLP')
      .split(',')
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean);
  }

  getRefreshSchedule(): ProviderRefreshSchedule {
    return {
      cronExpression: this.configService.get<string>(
        'YAHOO_CURRENCY_REFRESH_CRON',
        '0 */15 * * * *',
      ),
    };
  }
}
