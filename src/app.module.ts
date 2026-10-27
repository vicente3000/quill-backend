import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { resolveEnvFilePaths } from './config/env-file-paths';
import { normalizeMongoDbUri } from './config/normalize-mongodb-uri';
import { envValidationSchema } from './config/env.validation';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { ContestsModule } from './modules/contests/contests.module';
import { CurrencyModule } from './modules/currency/currency.module';
import { MarketModule } from './modules/market/market.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { SystemModule } from './modules/system/system.module';
import { TradesModule } from './modules/trades/trades.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveEnvFilePaths(),
      validationSchema: envValidationSchema,
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: normalizeMongoDbUri(
          configService.getOrThrow<string>('MONGODB_URI'),
        ),
        serverSelectionTimeoutMS: 5000,
        retryAttempts: 3,
        retryDelay: 1500,
      }),
    }),
    SystemModule,
    UsersModule,
    AdminModule,
    AuthModule,
    ContestsModule,
    CurrencyModule,
    MarketModule,
    PortfolioModule,
    RealtimeModule,
    TradesModule,
    OrdersModule,
  ],
  providers: [],
})
export class AppModule {}
