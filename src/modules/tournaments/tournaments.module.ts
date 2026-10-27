import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CurrencyModule } from '../currency/currency.module';
import { AuthModule } from '../auth/auth.module';
import {
  Stock,
  StockSchema,
} from '../market/infrastructure/schemas/stock.schema';
import { SystemModule } from '../system/system.module';
import { User, UserSchema } from '../users/infrastructure/schemas/user.schema';
import { TournamentTradingService } from './application/services/tournament-trading.service';
import { TournamentsService } from './application/services/tournaments.service';
import {
  Tournament,
  TournamentSchema,
} from './infrastructure/schemas/tournament.schema';
import {
  TournamentOrder,
  TournamentOrderSchema,
} from './infrastructure/schemas/tournament-order.schema';
import {
  TournamentParticipant,
  TournamentParticipantSchema,
} from './infrastructure/schemas/tournament-participant.schema';
import {
  TournamentPosition,
  TournamentPositionSchema,
} from './infrastructure/schemas/tournament-position.schema';
import {
  TournamentTrade,
  TournamentTradeSchema,
} from './infrastructure/schemas/tournament-trade.schema';
import { TournamentTradingController } from './presentation/controllers/tournament-trading.controller';
import { TournamentsController } from './presentation/controllers/tournaments.controller';

@Module({
  imports: [
    CurrencyModule,
    AuthModule,
    SystemModule,
    MongooseModule.forFeature([
      { name: Tournament.name, schema: TournamentSchema },
      { name: TournamentParticipant.name, schema: TournamentParticipantSchema },
      { name: TournamentPosition.name, schema: TournamentPositionSchema },
      { name: TournamentOrder.name, schema: TournamentOrderSchema },
      { name: TournamentTrade.name, schema: TournamentTradeSchema },
      { name: Stock.name, schema: StockSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [TournamentsController, TournamentTradingController],
  providers: [TournamentsService, TournamentTradingService],
  exports: [TournamentsService, TournamentTradingService],
})
export class TournamentsModule {}
