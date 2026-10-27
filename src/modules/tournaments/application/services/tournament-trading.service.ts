import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import Decimal from 'decimal.js';
import { randomUUID } from 'crypto';
import type { JwtPayload } from '../../../../common/interfaces/jwt-payload.interface';
import { isMarketOpen } from '../../../../common/utils/market-hours';
import { AdminConfigService } from '../../../admin/application/services/admin-config.service';
import { CurrencyRateService } from '../../../currency/application/services/currency-rate.service';
import {
  Stock,
  StockDocument,
} from '../../../market/infrastructure/schemas/stock.schema';
import { CacheService } from '../../../system/application/services/cache/cache.service';
import {
  User,
  UserDocument,
} from '../../../users/infrastructure/schemas/user.schema';
import type { TournamentRankingMetric } from '../../domain/tournament.types';
import {
  Tournament,
  TournamentDocument,
} from '../../infrastructure/schemas/tournament.schema';
import {
  TournamentOrder,
  TournamentOrderDocument,
} from '../../infrastructure/schemas/tournament-order.schema';
import {
  TournamentParticipant,
  TournamentParticipantDocument,
} from '../../infrastructure/schemas/tournament-participant.schema';
import {
  TournamentPosition,
  TournamentPositionDocument,
} from '../../infrastructure/schemas/tournament-position.schema';
import {
  TournamentTrade,
  TournamentTradeDocument,
} from '../../infrastructure/schemas/tournament-trade.schema';
import { CreateTournamentOrderDto } from '../../presentation/dto/create-tournament-order.dto';
import { LeaderboardQueryDto } from '../../presentation/dto/leaderboard-query.dto';
import { TournamentsService } from './tournaments.service';

const TOURNAMENT_EXECUTION_LOCK = 'lock:tournaments:order-execution';
const TOURNAMENT_LIFECYCLE_LOCK = 'lock:tournaments:lifecycle';
const LOCK_TTL_MS = 55_000;

interface MoneyValues {
  grossNative: number;
  grossBase: number;
  commissionNative: number;
  commissionBase: number;
  netNative: number;
  netBase: number;
}

export interface RankingRow {
  participantId: string;
  userId: string;
  fullName: string;
  username: string | null;
  accountType: string;
  availableBalance: number;
  reservedBalance: number;
  investedValue: number;
  totalEquity: number;
  returnPercentage: number;
  unrealizedProfitLoss: number;
  totalShares: number;
  positionCount: number;
  tradeCount: number;
  rank: number;
  officialRank: number | null;
  status: string;
}

@Injectable()
export class TournamentTradingService {
  private readonly logger = new Logger(TournamentTradingService.name);
  private ordersRunning = false;
  private lifecycleRunning = false;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Tournament.name)
    private readonly tournamentModel: Model<TournamentDocument>,
    @InjectModel(TournamentParticipant.name)
    private readonly participantModel: Model<TournamentParticipantDocument>,
    @InjectModel(TournamentPosition.name)
    private readonly positionModel: Model<TournamentPositionDocument>,
    @InjectModel(TournamentOrder.name)
    private readonly orderModel: Model<TournamentOrderDocument>,
    @InjectModel(TournamentTrade.name)
    private readonly tradeModel: Model<TournamentTradeDocument>,
    @InjectModel(Stock.name)
    private readonly stockModel: Model<StockDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly tournamentsService: TournamentsService,
    private readonly currencyRateService: CurrencyRateService,
    private readonly adminConfigService: AdminConfigService,
    private readonly cacheService: CacheService,
  ) {}

  async createOrder(
    tournamentId: string,
    userId: string,
    dto: CreateTournamentOrderDto,
  ) {
    const symbol = dto.symbol.trim().toUpperCase();
    const type = dto.type ?? 'LIMIT';

    if (type === 'MARKET') {
      return this.executeMarketOrder(
        tournamentId,
        userId,
        symbol,
        dto.side,
        dto.quantity,
      );
    }

    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(async () => {
        const { tournament, participant } = await this.getTradingContext(
          tournamentId,
          userId,
          session,
        );
        const stock = await this.stockModel
          .findOne({ symbol })
          .session(session)
          .exec();
        if (!stock) throw new NotFoundException('La accion no existe.');

        const limitPrice = dto.limitPrice!;
        const baseLimitPrice = await this.toBaseAmount(
          limitPrice,
          stock.currency ?? 'CLP',
        );
        let reservedAmount = 0;

        if (dto.side === 'BUY') {
          const grossBase = new Decimal(dto.quantity)
            .times(baseLimitPrice)
            .toDecimalPlaces(2)
            .toNumber();
          const commissionBase = this.calculateCommission(
            grossBase,
            tournament.commissionRate,
          );
          reservedAmount = new Decimal(grossBase)
            .plus(commissionBase)
            .toDecimalPlaces(2)
            .toNumber();
          if (
            new Decimal(participant.availableBalance).lessThan(reservedAmount)
          ) {
            throw new BadRequestException(
              'Saldo insuficiente para reservar la orden.',
            );
          }
          participant.availableBalance = new Decimal(
            participant.availableBalance,
          )
            .minus(reservedAmount)
            .toDecimalPlaces(2)
            .toNumber();
          participant.reservedBalance = new Decimal(participant.reservedBalance)
            .plus(reservedAmount)
            .toDecimalPlaces(2)
            .toNumber();
          await participant.save({ session });
        } else {
          const position = await this.positionModel
            .findOne({
              tournamentId: tournament._id,
              userId: new Types.ObjectId(userId),
              symbol,
            })
            .session(session)
            .exec();
          if (
            !position ||
            position.quantity - position.reservedQuantity < dto.quantity
          ) {
            throw new BadRequestException(
              'No tienes suficientes acciones disponibles para vender.',
            );
          }
          position.reservedQuantity += dto.quantity;
          await position.save({ session });
        }

        const [order] = await this.orderModel.create(
          [
            {
              tournamentId: tournament._id,
              userId: new Types.ObjectId(userId),
              symbol,
              side: dto.side,
              quantity: dto.quantity,
              type: 'LIMIT',
              limitPrice,
              status: 'PENDING',
              reservedAmount,
            },
          ],
          { session },
        );
        return order;
      });
    } finally {
      await session.endSession();
    }
  }

  async listOrders(tournamentId: string, userId: string, status?: string) {
    await this.assertParticipant(tournamentId, userId);
    const filter: Record<string, unknown> = {
      tournamentId: new Types.ObjectId(tournamentId),
      userId: new Types.ObjectId(userId),
    };
    if (status) filter.status = status.toUpperCase();
    return this.orderModel.find(filter).sort({ createdAt: -1 }).lean().exec();
  }

  async cancelOrder(tournamentId: string, userId: string, orderId: string) {
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(async () => {
        const order = await this.orderModel
          .findOne({
            _id: new Types.ObjectId(orderId),
            tournamentId: new Types.ObjectId(tournamentId),
            userId: new Types.ObjectId(userId),
          })
          .session(session)
          .exec();
        if (!order) throw new NotFoundException('Orden no encontrada.');
        if (order.status === 'CANCELLED') return order;
        if (order.status !== 'PENDING') {
          throw new ConflictException(
            'Solo se pueden cancelar ordenes pendientes.',
          );
        }
        await this.releaseReservation(order, session);
        order.status = 'CANCELLED';
        order.cancelledAt = new Date();
        await order.save({ session });
        return order;
      });
    } finally {
      await session.endSession();
    }
  }

  async listTrades(tournamentId: string, userId: string, limit = 50) {
    await this.assertParticipant(tournamentId, userId);
    return this.tradeModel
      .find({
        tournamentId: new Types.ObjectId(tournamentId),
        userId: new Types.ObjectId(userId),
      })
      .sort({ executedAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 100))
      .lean()
      .exec();
  }

  async getManagedPortfolio(
    tournamentId: string,
    participantUserId: string,
    manager: JwtPayload,
  ) {
    await this.tournamentsService.assertOwnerOrAdmin(tournamentId, manager);
    return this.getPortfolio(tournamentId, participantUserId);
  }

  async listManagedOrders(
    tournamentId: string,
    participantUserId: string,
    manager: JwtPayload,
    status?: string,
  ) {
    await this.tournamentsService.assertOwnerOrAdmin(tournamentId, manager);
    return this.listOrders(tournamentId, participantUserId, status);
  }

  async listManagedTrades(
    tournamentId: string,
    participantUserId: string,
    manager: JwtPayload,
    limit = 50,
  ) {
    await this.tournamentsService.assertOwnerOrAdmin(tournamentId, manager);
    return this.listTrades(tournamentId, participantUserId, limit);
  }

  async getPortfolio(tournamentId: string, userId: string) {
    const participant = await this.assertParticipant(tournamentId, userId);
    const positions = await this.positionModel
      .find({
        tournamentId: new Types.ObjectId(tournamentId),
        userId: new Types.ObjectId(userId),
        quantity: { $gt: 0 },
      })
      .lean()
      .exec();
    const enriched = await this.enrichPositions(positions);
    const investedValue = enriched.reduce(
      (total, position) => total + position.marketValueBase,
      0,
    );
    const unrealizedProfitLoss = enriched.reduce(
      (total, position) => total + position.unrealizedProfitLossBase,
      0,
    );
    const calculatedEquity = new Decimal(participant.availableBalance)
      .plus(participant.reservedBalance)
      .plus(investedValue)
      .toDecimalPlaces(2)
      .toNumber();
    const totalEquity = participant.finalEquity ?? calculatedEquity;

    return {
      tournamentId,
      baseCurrency: 'CLP',
      availableBalance: participant.availableBalance,
      reservedBalance: participant.reservedBalance,
      investedValue: new Decimal(investedValue).toDecimalPlaces(2).toNumber(),
      totalEquity,
      unrealizedProfitLoss: new Decimal(unrealizedProfitLoss)
        .toDecimalPlaces(2)
        .toNumber(),
      returnPercentage:
        participant.finalReturnPercentage ??
        new Decimal(totalEquity)
          .minus(participant.initialBalance)
          .dividedBy(participant.initialBalance)
          .times(100)
          .toDecimalPlaces(4)
          .toNumber(),
      finalizedAt: participant.finalizedAt ?? null,
      positions: enriched,
    };
  }

  async getLeaderboard(
    tournamentId: string,
    user: JwtPayload,
    query: LeaderboardQueryDto,
  ) {
    await this.tournamentsService.getAccessible(tournamentId, user);
    let rows = await this.buildRankingRows(tournamentId);
    const search = query.search?.trim().toLowerCase();
    if (search) {
      rows = rows.filter(
        (row) =>
          row.fullName.toLowerCase().includes(search) ||
          row.username?.toLowerCase().includes(search),
      );
    }
    if (query.accountType) {
      rows = rows.filter((row) => row.accountType === query.accountType);
    }

    const keyMap: Record<TournamentRankingMetric, keyof RankingRow> = {
      RETURN_PERCENTAGE: 'returnPercentage',
      TOTAL_EQUITY: 'totalEquity',
      TOTAL_SHARES: 'totalShares',
      TRADE_COUNT: 'tradeCount',
      INVESTED_VALUE: 'investedValue',
      AVAILABLE_BALANCE: 'availableBalance',
    };
    const key = keyMap[query.sortBy ?? 'RETURN_PERCENTAGE'];
    const direction = query.direction === 'asc' ? 1 : -1;
    rows.sort((left, right) => {
      const difference = (Number(left[key]) - Number(right[key])) * direction;
      return difference || left.fullName.localeCompare(right.fullName);
    });
    rows = rows.map((row, index) => ({ ...row, rank: index + 1 }));

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const total = rows.length;
    return {
      data: rows.slice((page - 1) * limit, page * limit),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async finishTournament(tournamentId: string, user: JwtPayload) {
    await this.tournamentsService.assertOwnerOrAdmin(tournamentId, user);
    return this.finishTournamentInternal(tournamentId);
  }

  async cancelTournament(tournamentId: string, user: JwtPayload) {
    const tournament = await this.tournamentsService.assertOwnerOrAdmin(
      tournamentId,
      user,
    );
    if (tournament.status === 'FINISHED') {
      throw new ConflictException('Un torneo finalizado no puede cancelarse.');
    }
    if (tournament.status !== 'CANCELLED') {
      tournament.status = 'CANCELLED';
      tournament.finishedAt = new Date();
      await tournament.save();
    }
    await this.cancelPendingOrders(tournamentId);
    return tournament;
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async executePendingOrders(): Promise<void> {
    if (this.ordersRunning) return;
    this.ordersRunning = true;
    const owner = randomUUID();
    let locked = false;
    try {
      locked = await this.cacheService.acquireLock(
        TOURNAMENT_EXECUTION_LOCK,
        owner,
        LOCK_TTL_MS,
      );
      if (!locked || !(await this.isMarketCurrentlyOpen())) return;

      const orders = await this.orderModel
        .find({ status: 'PENDING' })
        .limit(1000)
        .exec();
      for (const order of orders) {
        try {
          const tournament = await this.tournamentModel
            .findById(order.tournamentId)
            .lean()
            .exec();
          if (!tournament || tournament.status !== 'ACTIVE') continue;
          if (tournament.endAt.getTime() <= Date.now()) continue;

          const stock = await this.stockModel
            .findOne({ symbol: order.symbol })
            .lean()
            .exec();
          if (!stock) continue;
          const price = await this.getExecutionPrice(order.symbol, stock.close);
          if (
            order.limitPrice === undefined ||
            (order.side === 'BUY'
              ? price > order.limitPrice
              : price < order.limitPrice)
          ) {
            continue;
          }
          await this.executePendingOrder(
            order.id,
            price,
            stock.currency ?? 'CLP',
          );
        } catch (error) {
          this.logger.error(
            `No se pudo ejecutar la orden de torneo ${order.id}.`,
            error,
          );
        }
      }
    } catch (error) {
      this.logger.error('Fallo el ciclo de ordenes de torneos.', error);
    } finally {
      if (locked) await this.safeReleaseLock(TOURNAMENT_EXECUTION_LOCK, owner);
      this.ordersRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async updateTournamentLifecycle(): Promise<void> {
    if (this.lifecycleRunning) return;
    this.lifecycleRunning = true;
    const owner = randomUUID();
    let locked = false;
    try {
      locked = await this.cacheService.acquireLock(
        TOURNAMENT_LIFECYCLE_LOCK,
        owner,
        LOCK_TTL_MS,
      );
      if (!locked) return;
      const now = new Date();
      await this.tournamentModel.updateMany(
        { status: 'OPEN', startAt: { $lte: now }, endAt: { $gt: now } },
        { $set: { status: 'ACTIVE' } },
      );
      const expired = await this.tournamentModel
        .find({ status: 'ACTIVE', endAt: { $lte: now } }, { _id: 1 })
        .lean()
        .exec();
      for (const tournament of expired) {
        try {
          await this.finishTournamentInternal(tournament._id.toString());
        } catch (error) {
          this.logger.error(
            `No se pudo cerrar automaticamente el torneo ${tournament._id.toString()}.`,
            error,
          );
        }
      }
    } finally {
      if (locked) await this.safeReleaseLock(TOURNAMENT_LIFECYCLE_LOCK, owner);
      this.lifecycleRunning = false;
    }
  }

  private async executeMarketOrder(
    tournamentId: string,
    userId: string,
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
  ) {
    if (!(await this.isMarketCurrentlyOpen())) {
      throw new ConflictException('El mercado esta cerrado.');
    }
    const stock = await this.stockModel.findOne({ symbol }).lean().exec();
    if (!stock) throw new NotFoundException('La accion no existe.');
    const price = await this.getExecutionPrice(symbol, stock.close);

    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(async () => {
        const { tournament, participant } = await this.getTradingContext(
          tournamentId,
          userId,
          session,
        );
        const money = await this.getMoneyValues(
          price,
          quantity,
          stock.currency ?? 'CLP',
          tournament.commissionRate,
          side,
        );
        await this.applyImmediateExecution(
          tournament,
          participant,
          symbol,
          side,
          quantity,
          price,
          money,
          session,
        );
        const executedAt = new Date();
        const [order] = await this.orderModel.create(
          [
            {
              tournamentId: tournament._id,
              userId: participant.userId,
              symbol,
              side,
              quantity,
              type: 'MARKET',
              status: 'EXECUTED',
              reservedAmount: 0,
              executionPrice: price,
              commissionAmount: money.commissionNative,
              commissionAmountBase: money.commissionBase,
              executedAt,
            },
          ],
          { session },
        );
        await this.createTrade(order, money, price, executedAt, session);
        return order;
      });
    } finally {
      await session.endSession();
    }
  }

  private async executePendingOrder(
    orderId: string,
    price: number,
    currency: string,
  ): Promise<void> {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const order = await this.orderModel
          .findOneAndUpdate(
            { _id: new Types.ObjectId(orderId), status: 'PENDING' },
            { $currentDate: { updatedAt: true } },
            { returnDocument: 'after', session },
          )
          .exec();
        if (!order) return;
        const tournament = await this.tournamentModel
          .findOne({ _id: order.tournamentId, status: 'ACTIVE' })
          .session(session)
          .exec();
        const participant = await this.participantModel
          .findOne({
            tournamentId: order.tournamentId,
            userId: order.userId,
            status: 'ACTIVE',
          })
          .session(session)
          .exec();
        if (!tournament || !participant) return;

        const money = await this.getMoneyValues(
          price,
          order.quantity,
          currency,
          tournament.commissionRate,
          order.side,
        );

        if (order.side === 'BUY') {
          const required = new Decimal(money.grossBase)
            .plus(money.commissionBase)
            .toDecimalPlaces(2)
            .toNumber();
          if (
            participant.reservedBalance < order.reservedAmount ||
            new Decimal(participant.availableBalance)
              .plus(order.reservedAmount)
              .lessThan(required)
          ) {
            await this.releaseReservation(order, session, participant);
            order.status = 'CANCELLED';
            order.cancelledAt = new Date();
            await order.save({ session });
            return;
          }
          participant.reservedBalance = new Decimal(participant.reservedBalance)
            .minus(order.reservedAmount)
            .toDecimalPlaces(2)
            .toNumber();
          participant.availableBalance = new Decimal(
            participant.availableBalance,
          )
            .plus(order.reservedAmount)
            .minus(required)
            .toDecimalPlaces(2)
            .toNumber();
          await this.addToPosition(
            tournament._id,
            participant.userId,
            order.symbol,
            order.quantity,
            price,
            session,
          );
        } else {
          const position = await this.positionModel
            .findOne({
              tournamentId: tournament._id,
              userId: participant.userId,
              symbol: order.symbol,
            })
            .session(session)
            .exec();
          if (
            !position ||
            position.quantity < order.quantity ||
            position.reservedQuantity < order.quantity
          ) {
            await this.releaseReservation(order, session, participant);
            order.status = 'CANCELLED';
            order.cancelledAt = new Date();
            await order.save({ session });
            return;
          }
          position.quantity -= order.quantity;
          position.reservedQuantity -= order.quantity;
          participant.availableBalance = new Decimal(
            participant.availableBalance,
          )
            .plus(money.netBase)
            .toDecimalPlaces(2)
            .toNumber();
          if (position.quantity === 0) {
            await position.deleteOne({ session });
          } else {
            await position.save({ session });
          }
        }

        await participant.save({ session });
        const executedAt = new Date();
        order.status = 'EXECUTED';
        order.executionPrice = price;
        order.commissionAmount = money.commissionNative;
        order.commissionAmountBase = money.commissionBase;
        order.executedAt = executedAt;
        await order.save({ session });
        await this.createTrade(order, money, price, executedAt, session);
      });
    } finally {
      await session.endSession();
    }
  }

  private async applyImmediateExecution(
    tournament: TournamentDocument,
    participant: TournamentParticipantDocument,
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    price: number,
    money: MoneyValues,
    session: ClientSession,
  ): Promise<void> {
    if (side === 'BUY') {
      const total = new Decimal(money.grossBase)
        .plus(money.commissionBase)
        .toDecimalPlaces(2)
        .toNumber();
      if (new Decimal(participant.availableBalance).lessThan(total)) {
        throw new BadRequestException('Saldo insuficiente para comprar.');
      }
      participant.availableBalance = new Decimal(participant.availableBalance)
        .minus(total)
        .toDecimalPlaces(2)
        .toNumber();
      await this.addToPosition(
        tournament._id,
        participant.userId,
        symbol,
        quantity,
        price,
        session,
      );
    } else {
      const position = await this.positionModel
        .findOne({
          tournamentId: tournament._id,
          userId: participant.userId,
          symbol,
        })
        .session(session)
        .exec();
      if (
        !position ||
        position.quantity - position.reservedQuantity < quantity
      ) {
        throw new BadRequestException(
          'No tienes suficientes acciones disponibles para vender.',
        );
      }
      position.quantity -= quantity;
      participant.availableBalance = new Decimal(participant.availableBalance)
        .plus(money.netBase)
        .toDecimalPlaces(2)
        .toNumber();
      if (position.quantity === 0) {
        await position.deleteOne({ session });
      } else {
        await position.save({ session });
      }
    }
    await participant.save({ session });
  }

  private async addToPosition(
    tournamentId: Types.ObjectId,
    userId: Types.ObjectId,
    symbol: string,
    quantity: number,
    price: number,
    session: ClientSession,
  ): Promise<void> {
    const position = await this.positionModel
      .findOne({ tournamentId, userId, symbol })
      .session(session)
      .exec();
    if (!position) {
      await this.positionModel.create(
        [
          {
            tournamentId,
            userId,
            symbol,
            quantity,
            reservedQuantity: 0,
            averageCost: price,
          },
        ],
        { session },
      );
      return;
    }
    const totalCost = new Decimal(position.quantity)
      .times(position.averageCost)
      .plus(new Decimal(quantity).times(price));
    position.quantity += quantity;
    position.averageCost = totalCost
      .dividedBy(position.quantity)
      .toDecimalPlaces(4)
      .toNumber();
    await position.save({ session });
  }

  private async createTrade(
    order: TournamentOrderDocument,
    money: MoneyValues,
    price: number,
    executedAt: Date,
    session: ClientSession,
  ): Promise<void> {
    await this.tradeModel.create(
      [
        {
          tournamentId: order.tournamentId,
          userId: order.userId,
          orderId: order._id,
          symbol: order.symbol,
          side: order.side,
          quantity: order.quantity,
          executionPrice: price,
          grossAmount: money.grossNative,
          commissionAmount: money.commissionNative,
          netAmount: money.netNative,
          grossAmountBase: money.grossBase,
          commissionAmountBase: money.commissionBase,
          netAmountBase: money.netBase,
          executedAt,
        },
      ],
      { session },
    );
  }

  private async getTradingContext(
    tournamentId: string,
    userId: string,
    session: ClientSession,
  ) {
    const tournament = await this.tournamentModel
      .findById(tournamentId)
      .session(session)
      .exec();
    if (!tournament) throw new NotFoundException('Torneo no encontrado.');
    const now = Date.now();
    if (
      tournament.status !== 'ACTIVE' ||
      tournament.startAt.getTime() > now ||
      tournament.endAt.getTime() <= now
    ) {
      throw new ConflictException('El torneo no esta activo.');
    }
    const participant = await this.participantModel
      .findOne({
        tournamentId: tournament._id,
        userId: new Types.ObjectId(userId),
        status: 'ACTIVE',
      })
      .session(session)
      .exec();
    if (!participant) {
      throw new ForbiddenException('No eres participante activo del torneo.');
    }
    return { tournament, participant };
  }

  private async assertParticipant(tournamentId: string, userId: string) {
    const participant = await this.participantModel
      .findOne({
        tournamentId: new Types.ObjectId(tournamentId),
        userId: new Types.ObjectId(userId),
      })
      .exec();
    if (!participant) {
      throw new ForbiddenException('No participas en este torneo.');
    }
    return participant;
  }

  private calculateCommission(gross: number, rate: number): number {
    return new Decimal(gross).times(rate).toDecimalPlaces(2).toNumber();
  }

  private async getMoneyValues(
    price: number,
    quantity: number,
    currency: string,
    commissionRate: number,
    side: 'BUY' | 'SELL',
  ): Promise<MoneyValues> {
    const grossNative = new Decimal(price)
      .times(quantity)
      .toDecimalPlaces(2)
      .toNumber();
    const grossBase = await this.toBaseAmount(grossNative, currency);
    const commissionBase = this.calculateCommission(grossBase, commissionRate);
    const rate = grossNative > 0 ? grossBase / grossNative : 1;
    const commissionNative = new Decimal(commissionBase)
      .dividedBy(rate)
      .toDecimalPlaces(2)
      .toNumber();
    const multiplier = side === 'BUY' ? 1 : -1;
    const netNative = new Decimal(grossNative)
      .plus(new Decimal(commissionNative).times(multiplier))
      .toDecimalPlaces(2)
      .toNumber();
    const netBase = new Decimal(grossBase)
      .plus(new Decimal(commissionBase).times(multiplier))
      .toDecimalPlaces(2)
      .toNumber();
    return {
      grossNative,
      grossBase,
      commissionNative,
      commissionBase,
      netNative,
      netBase,
    };
  }

  private async toBaseAmount(
    amount: number,
    currency: string,
  ): Promise<number> {
    if (currency.toUpperCase() === 'CLP') return amount;
    const entry = await this.currencyRateService.getRate(
      `${currency.toUpperCase()}CLP`,
    );
    if (!entry || !Number.isFinite(entry.rate) || entry.rate <= 0) {
      throw new ServiceUnavailableException(
        `No hay tipo de cambio disponible para ${currency}.`,
      );
    }
    return new Decimal(amount).times(entry.rate).toDecimalPlaces(2).toNumber();
  }

  private async getExecutionPrice(
    symbol: string,
    persistedPrice: number,
  ): Promise<number> {
    const livePrice = await this.cacheService.get<number>(
      `stock:${symbol}:live_price`,
    );
    const price = livePrice ?? persistedPrice;
    if (!Number.isFinite(price) || price <= 0) {
      throw new ServiceUnavailableException(
        `No hay un precio valido para ${symbol}.`,
      );
    }
    return price;
  }

  private async isMarketCurrentlyOpen(): Promise<boolean> {
    const [openTime, closeTime, closedDays] = await Promise.all([
      this.adminConfigService.get<string>('MARKET_HOURS_OPEN'),
      this.adminConfigService.get<string>('MARKET_HOURS_CLOSED'),
      this.adminConfigService.get<string>('MARKET_CLOSED_DAYS'),
    ]);
    if (!openTime || !closeTime) return true;
    const days = closedDays
      ? closedDays
          .split(',')
          .map(Number)
          .filter((day) => day >= 1 && day <= 7)
      : [6, 7];
    return isMarketOpen(openTime, closeTime, days);
  }

  private async releaseReservation(
    order: TournamentOrderDocument,
    session: ClientSession,
    existingParticipant?: TournamentParticipantDocument,
  ): Promise<void> {
    const participant =
      existingParticipant ??
      (await this.participantModel
        .findOne({
          tournamentId: order.tournamentId,
          userId: order.userId,
        })
        .session(session)
        .exec());
    if (!participant) return;

    if (order.side === 'BUY') {
      const releasable = Decimal.min(
        participant.reservedBalance,
        order.reservedAmount,
      ).toDecimalPlaces(2);
      participant.reservedBalance = new Decimal(participant.reservedBalance)
        .minus(releasable)
        .toDecimalPlaces(2)
        .toNumber();
      participant.availableBalance = new Decimal(participant.availableBalance)
        .plus(releasable)
        .toDecimalPlaces(2)
        .toNumber();
      await participant.save({ session });
      return;
    }

    const position = await this.positionModel
      .findOne({
        tournamentId: order.tournamentId,
        userId: order.userId,
        symbol: order.symbol,
      })
      .session(session)
      .exec();
    if (position) {
      position.reservedQuantity = Math.max(
        0,
        position.reservedQuantity - order.quantity,
      );
      await position.save({ session });
    }
  }

  private async cancelPendingOrders(tournamentId: string): Promise<void> {
    const orders = await this.orderModel
      .find({
        tournamentId: new Types.ObjectId(tournamentId),
        status: 'PENDING',
      })
      .select('_id')
      .lean()
      .exec();
    for (const entry of orders) {
      const session = await this.connection.startSession();
      try {
        await session.withTransaction(async () => {
          const order = await this.orderModel
            .findOne({ _id: entry._id, status: 'PENDING' })
            .session(session)
            .exec();
          if (!order) return;
          await this.releaseReservation(order, session);
          order.status = 'CANCELLED';
          order.cancelledAt = new Date();
          await order.save({ session });
        });
      } finally {
        await session.endSession();
      }
    }
  }

  private async finishTournamentInternal(tournamentId: string) {
    const tournament = await this.tournamentModel.findById(tournamentId).exec();
    if (!tournament) throw new NotFoundException('Torneo no encontrado.');
    if (tournament.status === 'CANCELLED') {
      throw new ConflictException('Un torneo cancelado no puede finalizarse.');
    }

    if (tournament.status !== 'FINISHED') {
      tournament.status = 'FINISHED';
      tournament.finishedAt = new Date();
      await tournament.save();
    }
    await this.cancelPendingOrders(tournamentId);

    const rows = await this.buildRankingRows(tournamentId);
    rows.sort(
      (left, right) =>
        right.returnPercentage - left.returnPercentage ||
        right.totalEquity - left.totalEquity ||
        left.fullName.localeCompare(right.fullName),
    );
    const finalizedAt = new Date();
    await Promise.all(
      rows.map((row, index) =>
        this.participantModel.updateOne(
          { _id: new Types.ObjectId(row.participantId) },
          {
            $set: {
              status: 'FINISHED',
              finalEquity: row.totalEquity,
              finalReturnPercentage: row.returnPercentage,
              finalRank: index + 1,
              finalizedAt,
            },
          },
        ),
      ),
    );
    return tournament;
  }

  private async buildRankingRows(tournamentId: string): Promise<RankingRow[]> {
    const objectId = new Types.ObjectId(tournamentId);
    const [participants, positions, tradeCounts] = await Promise.all([
      this.participantModel.find({ tournamentId: objectId }).lean().exec(),
      this.positionModel
        .find({ tournamentId: objectId, quantity: { $gt: 0 } })
        .lean()
        .exec(),
      this.tradeModel
        .aggregate<{
          _id: Types.ObjectId;
          count: number;
        }>([
          { $match: { tournamentId: objectId } },
          { $group: { _id: '$userId', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);
    const users = await this.userModel
      .find(
        { _id: { $in: participants.map((entry) => entry.userId) } },
        { fullName: 1, username: 1, accountType: 1 },
      )
      .lean()
      .exec();
    const enrichedPositions = await this.enrichPositions(positions);
    const userMap = new Map(
      users.map((entry) => [entry._id.toString(), entry]),
    );
    const tradeMap = new Map(
      tradeCounts.map((entry) => [entry._id.toString(), entry.count]),
    );

    return participants.map((participant) => {
      const userId = participant.userId.toString();
      const userPositions = enrichedPositions.filter(
        (position) => position.userId.toString() === userId,
      );
      const investedValue = userPositions.reduce(
        (total, position) => total + position.marketValueBase,
        0,
      );
      const unrealizedProfitLoss = userPositions.reduce(
        (total, position) => total + position.unrealizedProfitLossBase,
        0,
      );
      const calculatedEquity = new Decimal(participant.availableBalance)
        .plus(participant.reservedBalance)
        .plus(investedValue)
        .toDecimalPlaces(2)
        .toNumber();
      const totalEquity = participant.finalEquity ?? calculatedEquity;
      const returnPercentage =
        participant.finalReturnPercentage ??
        new Decimal(totalEquity)
          .minus(participant.initialBalance)
          .dividedBy(participant.initialBalance)
          .times(100)
          .toDecimalPlaces(4)
          .toNumber();
      const user = userMap.get(userId);
      return {
        participantId: participant._id.toString(),
        userId,
        fullName: user?.fullName ?? 'Usuario',
        username: user?.username ?? null,
        accountType: user?.accountType ?? 'external',
        availableBalance: participant.availableBalance,
        reservedBalance: participant.reservedBalance,
        investedValue: new Decimal(investedValue).toDecimalPlaces(2).toNumber(),
        totalEquity,
        returnPercentage,
        unrealizedProfitLoss: new Decimal(unrealizedProfitLoss)
          .toDecimalPlaces(2)
          .toNumber(),
        totalShares: userPositions.reduce(
          (total, position) => total + position.quantity,
          0,
        ),
        positionCount: userPositions.length,
        tradeCount: tradeMap.get(userId) ?? 0,
        rank: participant.finalRank ?? 0,
        officialRank: participant.finalRank ?? null,
        status: participant.status,
      };
    });
  }

  private async enrichPositions<
    T extends {
      symbol: string;
      quantity: number;
      averageCost: number;
      userId: Types.ObjectId;
      reservedQuantity: number;
    },
  >(positions: T[]) {
    const symbols = [...new Set(positions.map((position) => position.symbol))];
    const stocks = await this.stockModel
      .find({ symbol: { $in: symbols } }, { symbol: 1, close: 1, currency: 1 })
      .lean()
      .exec();
    const stockMap = new Map(stocks.map((stock) => [stock.symbol, stock]));
    return Promise.all(
      positions.map(async (position) => {
        const stock = stockMap.get(position.symbol);
        const marketPrice = stock?.close ?? 0;
        const currency = stock?.currency ?? 'CLP';
        const marketValue = new Decimal(position.quantity)
          .times(marketPrice)
          .toDecimalPlaces(2)
          .toNumber();
        const cost = new Decimal(position.quantity)
          .times(position.averageCost)
          .toDecimalPlaces(2)
          .toNumber();
        const marketValueBase = await this.toBaseAmount(marketValue, currency);
        const costBase = await this.toBaseAmount(cost, currency);
        return {
          ...position,
          currency,
          marketPrice,
          marketValue,
          marketValueBase,
          unrealizedProfitLoss: new Decimal(marketValue)
            .minus(cost)
            .toDecimalPlaces(2)
            .toNumber(),
          unrealizedProfitLossBase: new Decimal(marketValueBase)
            .minus(costBase)
            .toDecimalPlaces(2)
            .toNumber(),
        };
      }),
    );
  }

  private async safeReleaseLock(key: string, owner: string): Promise<void> {
    try {
      await this.cacheService.releaseLock(key, owner);
    } catch (error) {
      this.logger.error(`No se pudo liberar el lock ${key}.`, error);
    }
  }
}
