import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { PRICE_UPDATE_EVENT } from '../../domain/constants/events';
import {
  PriceSnapshot,
  PriceSnapshotDocument,
} from '../../infrastructure/schemas/price-snapshot.schema';
import {
  Stock,
  StockDocument,
} from '../../infrastructure/schemas/stock.schema';
import { CacheService } from '../../../system/application/services/cache/cache.service';
import { MarketRefreshService } from './market-refresh.service';
import { MarketSeedService } from './market-seed.service';
import Decimal from 'decimal.js';
import {
  TournamentOrder,
  TournamentOrderDocument,
} from '../../../tournaments/infrastructure/schemas/tournament-order.schema';
import {
  TournamentPosition,
  TournamentPositionDocument,
} from '../../../tournaments/infrastructure/schemas/tournament-position.schema';
import {
  TournamentTrade,
  TournamentTradeDocument,
} from '../../../tournaments/infrastructure/schemas/tournament-trade.schema';
import {
  Order,
  OrderDocument,
} from '../../../orders/infrastructure/schemas/order.schema';
import {
  Position,
  PositionDocument,
} from '../../../portfolio/infrastructure/schemas/position.schema';
import {
  Trade,
  TradeDocument,
} from '../../../trades/infrastructure/schemas/trade.schema';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const MAX_STOCK_SEARCH_LENGTH = 64;

function normalizeStockSearch(value?: string): string {
  return (
    value?.trim().replace(/\s+/g, ' ').slice(0, MAX_STOCK_SEARCH_LENGTH) ?? ''
  );
}

@Injectable()
export class MarketService implements OnModuleInit {
  private readonly logger = new Logger(MarketService.name);

  constructor(
    @InjectModel(Stock.name)
    private readonly stockModel: Model<StockDocument>,
    @InjectModel(PriceSnapshot.name)
    private readonly snapshotModel: Model<PriceSnapshotDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Position.name)
    private readonly positionModel: Model<PositionDocument>,
    @InjectModel(Trade.name)
    private readonly tradeModel: Model<TradeDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
    private readonly marketRefreshService: MarketRefreshService,
    private readonly marketSeedService: MarketSeedService,
    private readonly cacheService: CacheService,
    private readonly eventEmitter: EventEmitter2,
    @Optional()
    @InjectModel(TournamentOrder.name)
    private readonly tournamentOrderModel?: Model<TournamentOrderDocument>,
    @Optional()
    @InjectModel(TournamentPosition.name)
    private readonly tournamentPositionModel?: Model<TournamentPositionDocument>,
    @Optional()
    @InjectModel(TournamentTrade.name)
    private readonly tournamentTradeModel?: Model<TournamentTradeDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.marketSeedService.seedInitialStocks();
    await this.seedInitialRedisPrices();

    if (this.configService.get<boolean>('MARKET_FETCH_ON_STARTUP')) {
      await this.marketRefreshService.refreshMarket();
    }
  }

  private async seedInitialRedisPrices(): Promise<void> {
    const stocks = await this.stockModel.find().lean().exec();
    for (const stock of stocks) {
      const [existingBase, existingLive] = await Promise.all([
        this.cacheService.get<number>(`stock:${stock.symbol}:base_price`),
        this.cacheService.get<number>(`stock:${stock.symbol}:live_price`),
      ]);
      if (existingBase == null) {
        await this.cacheService.set(
          `stock:${stock.symbol}:base_price`,
          stock.close,
        );
      }
      if (existingLive == null) {
        await this.cacheService.set(
          `stock:${stock.symbol}:live_price`,
          stock.close,
          60_000,
        );
      }
    }
    this.logger.log(`Seeded initial Redis prices for ${stocks.length} stocks`);
  }

  async listQuotes() {
    return this.stockModel.find().sort({ symbol: 1 }).lean().exec();
  }

  async getQuote(symbol: string) {
    const stock = await this.stockModel
      .findOne({ symbol: symbol.toUpperCase() })
      .lean()
      .exec();

    if (!stock) {
      throw new NotFoundException('La accion solicitada no existe.');
    }

    return stock;
  }

  async getPriceHistory(symbol: string, limit = 24) {
    const stock = await this.getQuote(symbol);

    const snapshots = await this.snapshotModel
      .find({ symbol: symbol.toUpperCase(), source: stock.source })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return snapshots.reverse();
  }

  async getTopMovers(limit = 4) {
    return this.stockModel
      .find()
      .sort({ dayChangePercentage: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  async refreshMarket() {
    return this.marketRefreshService.refreshMarket();
  }

  async listStocks(params: {
    search?: string;
    source?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, source, page = 1, limit = 50 } = params;
    const filter: Record<string, unknown> = {};

    if (source) {
      filter.source = source;
    }

    const normalizedSearch = normalizeStockSearch(search);
    if (normalizedSearch) {
      const regex = {
        $regex: `^${escapeRegExp(normalizedSearch)}`,
        $options: 'i',
      };
      filter.$or = [{ symbol: regex }, { name: regex }];
    }

    const [data, total] = await Promise.all([
      this.stockModel
        .find(filter)
        .sort({ symbol: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.stockModel.countDocuments(filter).exec(),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateStockPrice(symbol: string, price: number) {
    const upper = symbol.toUpperCase();
    const stock = await this.stockModel.findOne({ symbol: upper }).exec();

    if (!stock) {
      throw new NotFoundException(`Stock "${upper}" no encontrado.`);
    }

    const previousClose = stock.close;
    const dayChangePercentage =
      previousClose > 0
        ? new Decimal(price)
            .minus(previousClose)
            .dividedBy(previousClose)
            .times(100)
            .toDecimalPlaces(2)
            .toNumber()
        : 0;

    stock.close = price;
    stock.previousClose = previousClose;
    stock.dayChangePercentage = dayChangePercentage;
    await stock.save();

    await this.snapshotModel.create({
      symbol: upper,
      price,
      open: previousClose,
      high: Math.max(previousClose, price),
      low: Math.min(previousClose, price),
      close: price,
      source: 'admin',
    });

    const ttl = 86400 * 1000;
    await this.cacheService.set(
      `market:${upper}`,
      { symbol: upper, price, updatedAt: new Date().toISOString() },
      ttl,
    );
    await this.cacheService.set(`stock:${upper}:base_price`, price, ttl);
    await this.cacheService.set(`stock:${upper}:live_price`, price, ttl);

    const updated = await this.stockModel
      .findOne({ symbol: upper })
      .lean()
      .exec();
    this.eventEmitter.emit(PRICE_UPDATE_EVENT, [updated]);

    return updated;
  }

  async createStock(dto: {
    symbol: string;
    name: string;
    currency?: string;
    close: number;
    baseVolatility?: number;
    baseDrift?: number;
  }) {
    const upper = dto.symbol.toUpperCase();

    const exists = await this.stockModel.exists({ symbol: upper }).exec();
    if (exists) {
      throw new ConflictException(`El símbolo "${upper}" ya existe.`);
    }

    await this.stockModel.create([
      {
        symbol: upper,
        name: dto.name,
        currency: dto.currency ?? 'CLP',
        close: dto.close,
        previousClose: dto.close,
        dayChangePercentage: 0,
        source: 'admin',
        baseVolatility: dto.baseVolatility ?? 0.015,
        baseDrift: dto.baseDrift ?? 0,
      },
    ]);

    await this.snapshotModel.create({
      symbol: upper,
      price: dto.close,
      open: dto.close,
      high: dto.close,
      low: dto.close,
      close: dto.close,
      volume: 0,
      source: 'admin',
    });

    const ttl = 86400 * 1000;
    await this.cacheService.set(
      `market:${upper}`,
      { symbol: upper, price: dto.close, updatedAt: new Date().toISOString() },
      ttl,
    );
    await this.cacheService.set(`stock:${upper}:base_price`, dto.close, ttl);
    await this.cacheService.set(`stock:${upper}:live_price`, dto.close, ttl);

    const created = await this.stockModel
      .findOne({ symbol: upper })
      .lean()
      .exec();
    this.eventEmitter.emit(PRICE_UPDATE_EVENT, [created]);

    return created;
  }

  async deleteStock(symbol: string) {
    const upper = symbol.toUpperCase();
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const stock = await this.stockModel.findOneAndUpdate(
          { symbol: upper },
          { $currentDate: { updatedAt: true } },
          { returnDocument: 'after', session },
        );

        if (!stock) {
          throw new NotFoundException(`Stock "${upper}" no encontrado.`);
        }
        if (stock.source && stock.source !== 'admin') {
          throw new ForbiddenException(
            'No se puede eliminar un stock administrado por el proveedor.',
          );
        }

        const pendingOrder = await this.orderModel
          .exists({ symbol: upper, status: 'PENDING' })
          .session(session)
          .exec();
        const position = await this.positionModel
          .exists({ symbol: upper })
          .session(session)
          .exec();
        const trade = await this.tradeModel
          .exists({ symbol: upper })
          .session(session)
          .exec();
        const [tournamentOrder, tournamentPosition, tournamentTrade] =
          await Promise.all([
            this.tournamentOrderModel
              ?.exists({ symbol: upper })
              .session(session)
              .exec(),
            this.tournamentPositionModel
              ?.exists({ symbol: upper })
              .session(session)
              .exec(),
            this.tournamentTradeModel
              ?.exists({ symbol: upper })
              .session(session)
              .exec(),
          ]);

        if (
          pendingOrder ||
          position ||
          trade ||
          tournamentOrder ||
          tournamentPosition ||
          tournamentTrade
        ) {
          throw new ConflictException(
            `Stock "${upper}" posee referencias financieras y no puede eliminarse.`,
          );
        }

        await this.stockModel
          .deleteOne({ symbol: upper })
          .session(session)
          .exec();
      });
    } finally {
      await session.endSession();
    }
  }
}
