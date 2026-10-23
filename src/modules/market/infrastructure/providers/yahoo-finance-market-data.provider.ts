import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';
import { fetchYahooFinanceQuote } from '../../../../common/integrations/yahoo-finance.client';
import type { MarketQuote } from '../../domain/interfaces/market-quote.interface';
import type {
  MarketDataProvider,
  ProviderRefreshSchedule,
  StockSeed,
} from './market-data-provider.interface';

@Injectable()
export class YahooFinanceMarketDataProvider implements MarketDataProvider {
  private readonly logger = new Logger(YahooFinanceMarketDataProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async getQuote(symbol: string): Promise<MarketQuote> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const quote = await fetchYahooFinanceQuote(
      normalizedSymbol,
      this.configService.get<string>(
        'YAHOO_FINANCE_BASE_URL',
        'https://query1.finance.yahoo.com',
      ),
    );
    const dayChangePercentage =
      quote.previousClose > 0
        ? new Decimal(quote.price)
            .minus(quote.previousClose)
            .dividedBy(quote.previousClose)
            .times(100)
            .toDecimalPlaces(2)
            .toNumber()
        : 0;

    return {
      symbol: normalizedSymbol,
      name: quote.name,
      price: quote.price,
      close: quote.price,
      currency: quote.currency,
      timestamp: quote.timestamp,
      exchange: quote.exchange,
      source: 'yahoo',
      open: quote.open,
      high: quote.high,
      low: quote.low,
      previousClose: quote.previousClose,
      volume: quote.volume,
      dayChangePercentage,
    };
  }

  async getQuotes(symbols: string[]): Promise<MarketQuote[]> {
    const quotes: MarketQuote[] = [];
    for (const symbol of symbols) {
      try {
        quotes.push(await this.getQuote(symbol));
      } catch (error) {
        this.logger.warn(
          `Yahoo Finance failed for ${symbol}: ${describeError(error)}`,
        );
      }
    }
    return quotes;
  }

  getName(): string {
    return 'YahooFinance';
  }

  getRefreshSchedule(): ProviderRefreshSchedule {
    return {
      cronExpression: this.configService.get<string>(
        'YAHOO_MARKET_REFRESH_CRON',
        '0 */15 9-17 * * 1-5',
      ),
    };
  }

  getSeedData(): StockSeed[] {
    return this.readSymbols().map((symbol) => ({
      symbol,
      name: symbol,
      currency: symbol.endsWith('.SN') ? 'CLP' : 'USD',
      close: 0,
      previousClose: 0,
      source: 'yahoo',
    }));
  }

  private readSymbols(): string[] {
    return this.configService
      .get<string>('YAHOO_MARKET_SYMBOLS', 'COPEC.SN,CENCOSUD.SN,CHILE.SN')
      .split(',')
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean);
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
