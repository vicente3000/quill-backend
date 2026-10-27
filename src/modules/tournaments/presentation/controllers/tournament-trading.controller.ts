import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../../../common/interfaces/jwt-payload.interface';
import { ParseLimitPipe } from '../../../../common/pipes/parse-limit.pipe';
import { ParseObjectIdPipe } from '../../../../common/pipes/parse-object-id.pipe';
import { TournamentTradingService } from '../../application/services/tournament-trading.service';
import { CreateTournamentOrderDto } from '../dto/create-tournament-order.dto';
import { LeaderboardQueryDto } from '../dto/leaderboard-query.dto';

function parseOrderStatus(value?: string) {
  if (!value) return undefined;
  const normalized = value.toUpperCase();
  if (!['PENDING', 'EXECUTED', 'CANCELLED'].includes(normalized)) {
    throw new BadRequestException('El estado de orden no es valido.');
  }
  return normalized;
}

@Controller('tournaments/:tournamentId')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class TournamentTradingController {
  constructor(private readonly tradingService: TournamentTradingService) {}

  @Get('portfolio')
  portfolio(
    @CurrentUser() user: JwtPayload,
    @Param('tournamentId', ParseObjectIdPipe) tournamentId: string,
  ) {
    return this.tradingService.getPortfolio(tournamentId, user.sub);
  }

  @Post('orders')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  createOrder(
    @CurrentUser() user: JwtPayload,
    @Param('tournamentId', ParseObjectIdPipe) tournamentId: string,
    @Body() dto: CreateTournamentOrderDto,
  ) {
    return this.tradingService.createOrder(tournamentId, user.sub, dto);
  }

  @Get('orders')
  orders(
    @CurrentUser() user: JwtPayload,
    @Param('tournamentId', ParseObjectIdPipe) tournamentId: string,
    @Query('status') status?: string,
  ) {
    return this.tradingService.listOrders(
      tournamentId,
      user.sub,
      parseOrderStatus(status),
    );
  }

  @Patch('orders/:orderId/cancel')
  cancelOrder(
    @CurrentUser() user: JwtPayload,
    @Param('tournamentId', ParseObjectIdPipe) tournamentId: string,
    @Param('orderId', ParseObjectIdPipe) orderId: string,
  ) {
    return this.tradingService.cancelOrder(tournamentId, user.sub, orderId);
  }

  @Get('trades')
  trades(
    @CurrentUser() user: JwtPayload,
    @Param('tournamentId', ParseObjectIdPipe) tournamentId: string,
    @Query('limit', new ParseLimitPipe(50, 100)) limit: number,
  ) {
    return this.tradingService.listTrades(tournamentId, user.sub, limit);
  }

  @Get('leaderboard')
  leaderboard(
    @CurrentUser() user: JwtPayload,
    @Param('tournamentId', ParseObjectIdPipe) tournamentId: string,
    @Query() query: LeaderboardQueryDto,
  ) {
    return this.tradingService.getLeaderboard(tournamentId, user, query);
  }

  @Get('participants/:participantUserId/portfolio')
  managedPortfolio(
    @CurrentUser() user: JwtPayload,
    @Param('tournamentId', ParseObjectIdPipe) tournamentId: string,
    @Param('participantUserId', ParseObjectIdPipe) participantUserId: string,
  ) {
    return this.tradingService.getManagedPortfolio(
      tournamentId,
      participantUserId,
      user,
    );
  }

  @Get('participants/:participantUserId/orders')
  managedOrders(
    @CurrentUser() user: JwtPayload,
    @Param('tournamentId', ParseObjectIdPipe) tournamentId: string,
    @Param('participantUserId', ParseObjectIdPipe) participantUserId: string,
    @Query('status') status?: string,
  ) {
    return this.tradingService.listManagedOrders(
      tournamentId,
      participantUserId,
      user,
      parseOrderStatus(status),
    );
  }

  @Get('participants/:participantUserId/trades')
  managedTrades(
    @CurrentUser() user: JwtPayload,
    @Param('tournamentId', ParseObjectIdPipe) tournamentId: string,
    @Param('participantUserId', ParseObjectIdPipe) participantUserId: string,
    @Query('limit', new ParseLimitPipe(50, 100)) limit: number,
  ) {
    return this.tradingService.listManagedTrades(
      tournamentId,
      participantUserId,
      user,
      limit,
    );
  }
}
