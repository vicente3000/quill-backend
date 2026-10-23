import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheKey, CacheTTL } from '@nestjs/cache-manager';
import { MarketService } from '../../application/services/market.service';
import { AdminConfigService } from '../../../admin/application/services/admin-config.service';
import {
  isMarketOpen,
  formatTime,
} from '../../../../common/utils/market-hours';
import { ParseLimitPipe } from '../../../../common/pipes/parse-limit.pipe';

@Controller('market')
export class MarketController {
  constructor(
    private readonly marketService: MarketService,
    private readonly adminConfigService: AdminConfigService,
  ) {}

  /**
   * EJEMPLO DE CACHE HIBRIDO:
   * 1. @UseInterceptors(CacheInterceptor) activa el cache para este endpoint.
   * 2. @CacheKey('market_quotes') define una clave personalizada (opcional, por defecto usa la URL).
   * 3. @CacheTTL(10000) define el tiempo de vida en milisegundos (10 seg).
   *
   * Esto usara Redis si esta disponible, o el Fallback en memoria si no.
   */
  @Get('status')
  async getStatus() {
    const [openTime, closeTime, closedDays] = await Promise.all([
      this.adminConfigService.get<string>('MARKET_HOURS_OPEN'),
      this.adminConfigService.get<string>('MARKET_HOURS_CLOSED'),
      this.adminConfigService.get<string>('MARKET_CLOSED_DAYS'),
    ]);

    const effectiveOpenTime = openTime ?? '09:30';
    const effectiveCloseTime = closeTime ?? '16:00';
    const days = closedDays
      ? closedDays
          .split(',')
          .map(Number)
          .filter((d) => d >= 1 && d <= 7)
      : [6, 7];
    const open = isMarketOpen(effectiveOpenTime, effectiveCloseTime, days);

    return {
      open,
      openTime: effectiveOpenTime,
      closeTime: effectiveCloseTime,
      closedDays: days,
      currentTime: formatTime(new Date()),
      timezone: 'America/Santiago',
    };
  }

  @UseInterceptors(CacheInterceptor)
  @CacheKey('market_quotes')
  @CacheTTL(10000)
  @Get('stocks')
  getStocks() {
    return this.marketService.listQuotes();
  }

  @Get('stocks/:symbol/history')
  getHistory(
    @Param('symbol') symbol: string,
    @Query('limit', new ParseLimitPipe(96, 1000)) limit: number,
  ) {
    return this.marketService.getPriceHistory(symbol, limit);
  }

  @Get('top-movers')
  getTopMovers() {
    return this.marketService.getTopMovers();
  }
}
