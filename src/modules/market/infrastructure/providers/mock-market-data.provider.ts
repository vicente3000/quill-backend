import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { StockDocument } from '../schemas/stock.schema';
import { Stock } from '../schemas/stock.schema';
import { MarketQuote } from '../../domain/interfaces/market-quote.interface';
import { seedStocks } from '../../domain/constants/seed-stocks';
import { getCurrencyFromSymbol } from '../../../../common/utils/currency-mapper';
import {
  MarketDataProvider,
  ProviderRefreshSchedule,
  StockSeed,
} from './market-data-provider.interface';
import { ConfigService } from '@nestjs/config';

/**
 * Mock market data provider that generates realistic price movements
 * using a momentum-based algorithm. No external API calls are made.
 */
@Injectable()
export class MockMarketDataProvider implements MarketDataProvider {
  private readonly logger = new Logger(MockMarketDataProvider.name);
  private readonly momentumBySymbol = new Map<string, number>();
  private readonly mockStocks = new Map<
    string,
    { price: number; previousClose: number; currency: string }
  >();
  private initialized = false;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Stock.name)
    private readonly stockModel: Model<StockDocument>,
  ) {}

  /*
   * Get quote for a symbol using mock price generation.
   * Creates realistic price movements with momentum algorithm.
   */
  async getQuote(symbol: string): Promise<MarketQuote> {
    const upperSymbol = symbol.toUpperCase();

    // Initialize from database on first request
    if (!this.initialized) {
      await this.seedFromDatabase();
    }

    // Fallback: try DB first, then hardcoded seed
    if (!this.mockStocks.has(upperSymbol)) {
      const dbStock = await this.stockModel
        .findOne({ symbol: upperSymbol })
        .lean()
        .exec();
      if (dbStock) {
        this.mockStocks.set(upperSymbol, {
          price: dbStock.close,
          previousClose: dbStock.previousClose ?? dbStock.close,
          currency: dbStock.currency,
        });
      } else {
        const seed = seedStocks.find((s) => s.symbol === upperSymbol);
        this.mockStocks.set(upperSymbol, {
          price: seed?.close ?? 100,
          previousClose: seed?.close ?? 100,
          currency: seed?.currency ?? getCurrencyFromSymbol(upperSymbol),
        });
      }
    }

    const stock = this.mockStocks.get(upperSymbol)!;

    const open = stock.price;

    // Generate next price using momentum algorithm
    const nextPrice = this.generateNextPrice({
      symbol: upperSymbol,
      close: open,
    } as Pick<StockDocument, 'symbol' | 'close'>);

    const wickFactor = 0.0004 + Math.random() * 0.0012;
    const high = Number((Math.max(open, nextPrice) * (1 + wickFactor)).toFixed(2));
    const low = Number((Math.min(open, nextPrice) * (1 - wickFactor)).toFixed(2));
    const movement = Math.abs(nextPrice - open) / Math.max(open, 1);
    const volume = Math.round(18000 + movement * 8_000_000 + Math.random() * 14000);

    // Update internal price
    stock.price = nextPrice;

    // Calculate day change
    const dayChangePercentage =
      ((nextPrice - stock.previousClose) / stock.previousClose) * 100;

    return {
      symbol: upperSymbol,
      price: nextPrice,
      open,
      high,
      low,
      close: nextPrice,
      volume,
      currency: stock.currency,
      timestamp: new Date(),
      exchange: 'MOCK',
      previousClose: stock.previousClose,
      dayChangePercentage,
    };
  }

  private async seedFromDatabase(): Promise<void> {
    try {
      const stocks = await this.stockModel.find().lean().exec();

      if (stocks.length > 0) {
        this.logger.log(
          `Seeding mock provider from DB: ${stocks.length} stocks found`,
        );
        for (const stock of stocks) {
          const close = stock.close ?? 100;
          this.mockStocks.set(stock.symbol, {
            price: close,
            previousClose: stock.previousClose ?? close,
            currency: stock.currency,
          });
        }
      } else {
        this.logger.log('No stocks in DB, mock will use hardcoded seed data');
      }
    } catch (error) {
      this.logger.warn(
        `Failed to read stocks from DB for mock seeding: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    this.initialized = true;
  }

  getName(): string {
    return 'Mock';
  }

  /**
   * Return seed data for initial stock setup.
   * Uses the predefined Chilean/US stock list with realistic prices.
   */
  getSeedData(): StockSeed[] {
    const basePrice = 0.985;

    return seedStocks.map((stock) => ({
      symbol: stock.symbol,
      name: stock.name,
      currency: stock.currency,
      close: stock.close,
      previousClose: Number((stock.close * basePrice).toFixed(2)),
      dayChangePercentage: 1.5,
      source: 'mock',
    }));
  }

  getRefreshSchedule(): ProviderRefreshSchedule | undefined {
    const cronExpression = this.configService.get<string>(
      'MOCK_DAILY_REFRESH_CRON',
      '0 30 18 * * 1-5',
    );
    return { cronExpression };
  }

  /**
   * Generate next price with momentum algorithm.
   * Internal helper kept for backward compatibility.
   */
  generateNextPrice(stock: Pick<StockDocument, 'symbol' | 'close'>): number {
    const previousMomentum = this.momentumBySymbol.get(stock.symbol) ?? 0;
    const noise = (Math.random() - 0.5) * 0.006;
    const wave = Math.sin(Date.now() / 45000 + stock.close / 120) * 0.0016;

    const nextMomentum = Math.max(
      Math.min(previousMomentum * 0.62 + noise + wave, 0.009),
      -0.009,
    );

    this.momentumBySymbol.set(stock.symbol, nextMomentum);

    const nextPrice = stock.close * (1 + nextMomentum);

    return Number(Math.max(nextPrice, 5).toFixed(2));
  }
}
