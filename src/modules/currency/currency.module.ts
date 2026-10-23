import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommonStrategiesModule } from '../common/common-strategies.module';
import { CurrencyAnchorService } from './application/services/currency-anchor.service';
import { CurrencyRateService } from './application/services/currency-rate.service';
import { CurrencyTickService } from './application/services/currency-tick.service';
import { CurrencyController } from './presentation/controllers/currency.controller';
import { ExchangeRateCurrencyDataProvider } from './infrastructure/providers/exchangeRate-currency-data.provider';
import { MockCurrencyDataProvider } from './infrastructure/providers/mock-currency-data.provider';
import { NoneCurrencyDataProvider } from './infrastructure/providers/none-currency-data.provider';
import { FallbackCurrencyDataProvider } from './infrastructure/providers/fallback-currency-data.provider';
import { CurrencyProviderFactory } from './infrastructure/providers/currency-provider.factory';
import { YahooFinanceCurrencyDataProvider } from './infrastructure/providers/yahoo-finance-currency-data.provider';
import { GBMMarketSimulationStrategy } from '../common/strategies/gbm-market-simulation.strategy';
import { FlatMarketSimulationStrategy } from '../common/strategies/flat-market-simulation.strategy';
import { NoiseWaveSimulationStrategy } from '../common/strategies/nw-simulation.strategy';
import { StrategyFactory } from '../common/strategies/strategy.factory';
import { StrategyType } from '../common/strategies/strategy.types';
import { AdminConfigService } from '../admin/application/services/admin-config.service';

@Module({
  imports: [CommonStrategiesModule],
  controllers: [CurrencyController],
  exports: [CurrencyRateService],
  providers: [
    CurrencyAnchorService,
    CurrencyRateService,
    CurrencyTickService,
    MockCurrencyDataProvider,
    ExchangeRateCurrencyDataProvider,
    YahooFinanceCurrencyDataProvider,
    NoneCurrencyDataProvider,
    {
      provide: 'CURRENCY_DATA_PROVIDER',
      inject: [
        MockCurrencyDataProvider,
        ExchangeRateCurrencyDataProvider,
        YahooFinanceCurrencyDataProvider,
        NoneCurrencyDataProvider,
        ConfigService,
        AdminConfigService,
      ],
      useFactory: async (
        mockProvider: MockCurrencyDataProvider,
        exchangeRateProvider: ExchangeRateCurrencyDataProvider,
        yahooProvider: YahooFinanceCurrencyDataProvider,
        noneProvider: NoneCurrencyDataProvider,
        configService: ConfigService,
        adminConfigService: AdminConfigService,
      ) => {
        const adminConfigProviderName =
          await adminConfigService.get<string>('CURRENCY_PROVIDER');
        const providerName = adminConfigProviderName
          ? adminConfigProviderName
          : configService.get<string>('CURRENCY_PROVIDER', 'mock');

        if (providerName === 'exchangeRate' || providerName === 'yahoo') {
          const primary =
            providerName === 'exchangeRate'
              ? exchangeRateProvider
              : yahooProvider;
          return new FallbackCurrencyDataProvider(primary, mockProvider);
        }

        return CurrencyProviderFactory.createProvider(
          providerName,
          mockProvider,
          exchangeRateProvider,
          yahooProvider,
          noneProvider,
        );
      },
    },
    {
      provide: 'CURRENCY_SIMULATION_STRATEGY',
      inject: [
        GBMMarketSimulationStrategy,
        FlatMarketSimulationStrategy,
        NoiseWaveSimulationStrategy,
        ConfigService,
        AdminConfigService,
      ],
      useFactory: async (
        gbm: GBMMarketSimulationStrategy,
        flat: FlatMarketSimulationStrategy,
        nw: NoiseWaveSimulationStrategy,
        configService: ConfigService,
        adminConfigService: AdminConfigService,
      ) => {
        const strategyConfigProviderName = await adminConfigService.get<string>(
          'CURRENCY_SIMULATION_STRATEGY',
        );
        const strategyName = strategyConfigProviderName
          ? strategyConfigProviderName
          : configService.get<string>('CURRENCY_SIMULATION_STRATEGY', 'flat');
        return StrategyFactory.createStrategy(
          strategyName as StrategyType,
          gbm,
          flat,
          nw,
        );
      },
    },
  ],
})
export class CurrencyModule {}
