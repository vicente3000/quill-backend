import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import Decimal from 'decimal.js';
import { Model } from 'mongoose';
import { PRICE_UPDATE_EVENT } from '../../domain/constants/events';
import type { IMarketSimulationStrategy } from '../../../common/strategies/market-simulation-strategy.interface';
import {
  Stock,
  StockDocument,
} from '../../infrastructure/schemas/stock.schema';
import {
  PriceSnapshot,
  PriceSnapshotDocument,
} from '../../infrastructure/schemas/price-snapshot.schema';
import { CacheService } from '../../../system/application/services/cache/cache.service';

const BASE_PRICE_CACHE_PREFIX = 'stock:';
const BASE_PRICE_CACHE_SUFFIX = ':base_price';
const LIVE_PRICE_CACHE_SUFFIX = ':live_price';
const LIVE_PRICE_CACHE_TTL_MS = 60_000;

@Injectable()
export class MarketTickService {
  private readonly logger = new Logger(MarketTickService.name);
  private isTicking = false;

  constructor(
    @InjectModel(Stock.name) private readonly stockModel: Model<StockDocument>,
    @InjectModel(PriceSnapshot.name)
    private readonly snapshotModel: Model<PriceSnapshotDocument>,
    @Inject('MARKET_SIMULATION_STRATEGY')
    private readonly strategy: IMarketSimulationStrategy,
    private readonly cacheService: CacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async processTick(): Promise<void> {
    if (this.isTicking) {
      return;
    }

    this.isTicking = true;
    try {
      const stocks = await this.stockModel.find().lean().exec();

      if (!stocks.length) {
        return;
      }

      const updates: Array<{
        symbol: string;
        close: number;
        dayChangePercentage: number;
      }> = [];
      const snapshots: Array<{
        symbol: string;
        price: number;
        open: number;
        high: number;
        low: number;
        close: number;
        source: string;
        createdAt: Date;
      }> = [];
      const capturedAt = new Date();

      for (const stock of stocks) {
        const basePrice = await this.cacheService.get<number>(
          `${BASE_PRICE_CACHE_PREFIX}${stock.symbol}${BASE_PRICE_CACHE_SUFFIX}`,
        );
        const livePrice = await this.cacheService.get<number>(
          `${BASE_PRICE_CACHE_PREFIX}${stock.symbol}${LIVE_PRICE_CACHE_SUFFIX}`,
        );

        if (basePrice == null || livePrice == null) {
          continue;
        }

        const volatility = new Decimal(stock.baseVolatility ?? 0.015);
        const drift = new Decimal(stock.baseDrift ?? 0);
        const nextPrice = this.strategy.calculateNextTick(
          new Decimal(basePrice),
          new Decimal(livePrice),
          volatility,
          drift,
        );

        await this.cacheService.set(
          `${BASE_PRICE_CACHE_PREFIX}${stock.symbol}${LIVE_PRICE_CACHE_SUFFIX}`,
          nextPrice.toNumber(),
          LIVE_PRICE_CACHE_TTL_MS,
        );

        const dayChangePct = nextPrice
          .minus(basePrice)
          .dividedBy(basePrice)
          .times(100)
          .toDecimalPlaces(2)
          .toNumber();

        updates.push({
          symbol: stock.symbol,
          close: nextPrice.toNumber(),
          dayChangePercentage: dayChangePct,
        });
        snapshots.push({
          symbol: stock.symbol,
          price: nextPrice.toNumber(),
          open: livePrice,
          high: Math.max(livePrice, nextPrice.toNumber()),
          low: Math.min(livePrice, nextPrice.toNumber()),
          close: nextPrice.toNumber(),
          source: 'simulation',
          createdAt: capturedAt,
        });
      }

      if (updates.length) {
        await this.snapshotModel.insertMany(snapshots);
        this.eventEmitter.emit(PRICE_UPDATE_EVENT, updates);
      }
    } finally {
      this.isTicking = false;
    }
  }
}
