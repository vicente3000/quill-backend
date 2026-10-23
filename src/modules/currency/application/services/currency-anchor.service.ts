import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { CacheService } from '../../../system/application/services/cache/cache.service';
import type { CurrencyDataProvider } from '../../domain/interfaces/currency-data-provider.interface';

const BASE_PRICE_KEY = (symbol: string) => `forex:${symbol}:base_price`;
const LIVE_PRICE_KEY = (symbol: string) => `forex:${symbol}:live_price`;
const LIVE_PRICE_CACHE_TTL_MS = 60_000;

@Injectable()
export class CurrencyAnchorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CurrencyAnchorService.name);
  private readonly jobName = 'currency-anchor';

  constructor(
    @Inject('CURRENCY_DATA_PROVIDER')
    private readonly provider: CurrencyDataProvider,
    private readonly cacheService: CacheService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    const symbols = this.provider.getSymbols();

    if (!symbols.length) {
      this.logger.warn(
        `Provider "${this.provider.getName()}" has no symbols. Skipping anchor init.`,
      );
      return;
    }

    this.logger.log(
      `Seeding initial anchor prices for [${symbols.join(', ')}]`,
    );
    await this.fetchAndStoreAnchors(symbols);

    const schedule = this.provider.getRefreshSchedule?.();
    if (!schedule) {
      this.logger.log(
        `Provider "${this.provider.getName()}" does not declare a refresh schedule. No anchor cron registered.`,
      );
      return;
    }

    const job = new CronJob(
      schedule.cronExpression,
      () => void this.handleAnchorCron(),
    );

    this.schedulerRegistry.addCronJob(this.jobName, job);
    job.start();
    this.logger.log(
      `Anchor cron scheduled with provider "${this.provider.getName()}" (${schedule.cronExpression}).`,
    );
  }

  onModuleDestroy(): void {
    if (this.schedulerRegistry.doesExist('cron', this.jobName)) {
      this.schedulerRegistry.deleteCronJob(this.jobName);
    }
  }

  private async handleAnchorCron(): Promise<void> {
    const symbols = this.provider.getSymbols();
    if (!symbols.length) return;
    this.logger.log('Running scheduled anchor fetch...');
    await this.fetchAndStoreAnchors(symbols);
  }

  private async fetchAndStoreAnchors(symbols: string[]): Promise<void> {
    for (const symbol of symbols) {
      try {
        const quote = await this.provider.getQuote(symbol);
        const anchorPrice = quote.close ?? quote.price;

        await Promise.all([
          this.cacheService.set(BASE_PRICE_KEY(symbol), anchorPrice),
          this.cacheService.set(
            LIVE_PRICE_KEY(symbol),
            anchorPrice,
            LIVE_PRICE_CACHE_TTL_MS,
          ),
        ]);

        this.logger.debug(`Anchor updated for ${symbol}: ${anchorPrice}`);
      } catch (error) {
        this.logger.error(
          `Failed to fetch anchor for ${symbol}: ${describeError(error)}`,
        );
      }
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
