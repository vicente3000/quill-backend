import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  MarketDataProvider,
  StockSeed,
} from '../../infrastructure/providers/market-data-provider.interface';
import { seedStocks } from '../../domain/constants/seed-stocks';
import {
  Stock,
  StockDocument,
} from '../../infrastructure/schemas/stock.schema';

/**
 * Seeds initial stock records on application startup.
 * Delegates seed data resolution to the active provider via getSeedData(),
 * avoiding any hardcoded provider name comparisons.
 */
@Injectable()
export class MarketSeedService {
  private readonly logger = new Logger(MarketSeedService.name);

  constructor(
    @InjectModel(Stock.name)
    private readonly stockModel: Model<StockDocument>,
    @Inject('MARKET_DATA_PROVIDER')
    private readonly provider: MarketDataProvider,
  ) {}

  async seedInitialStocks(): Promise<void> {
    const seedData = this.resolveSeedStocks();

    if (!seedData.length) {
      return;
    }

    const symbols = seedData.map((stock) => stock.symbol);
    const existingStocks = await this.stockModel
      .find({ symbol: { $in: symbols } })
      .select('symbol')
      .lean<Array<Pick<Stock, 'symbol'>>>()
      .exec();
    const typedExistingStocks = existingStocks as unknown as Array<
      Pick<Stock, 'symbol'>
    >;
    const existingSymbols = new Set(
      typedExistingStocks.map((stock) => stock.symbol.toUpperCase()),
    );
    const missingStocks = seedData.filter(
      (stock) => !existingSymbols.has(stock.symbol),
    );

    if (!missingStocks.length) {
      return;
    }

    const stocks = this.prepareSeedDocuments(missingStocks);
    await this.stockModel.insertMany(stocks);
    this.logger.log(
      'Market symbols created. Price history will accumulate from live captures.',
    );
  }

  /**
   * Resolves seed data from the provider's getSeedData() method.
   * Falls back to hardcoded mock stocks only if the provider
   * does not implement getSeedData() at all.
   */
  private resolveSeedStocks(): StockSeed[] {
    const providerSeedData = this.provider.getSeedData?.();

    if (providerSeedData !== undefined) {
      // Provider explicitly declared seed data (even if empty)
      return providerSeedData;
    }

    // Fallback: provider doesn't implement getSeedData, use hardcoded mock stocks
    return seedStocks.map((stock) => ({
      symbol: stock.symbol,
      name: stock.name,
      currency: stock.currency,
      close: stock.close,
      previousClose: 0,
    }));
  }

  /**
   * Prepares stock documents for insertion, normalizing defaults.
   */
  private prepareSeedDocuments(
    seedData: Array<{
      symbol: string;
      name: string;
      currency: string;
      close: number;
      previousClose?: number;
      dayChangePercentage?: number;
      source?: string;
    }>,
  ) {
    const providerName = this.provider.getName().toLowerCase();

    return seedData.map((stock) => ({
      ...stock,
      close: stock.close ?? 0,
      previousClose: stock.previousClose ?? 0,
      dayChangePercentage: stock.dayChangePercentage ?? 0,
      source: stock.source ?? providerName,
    }));
  }

}
