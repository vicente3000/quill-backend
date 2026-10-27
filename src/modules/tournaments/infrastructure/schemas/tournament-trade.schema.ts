import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TournamentTradeDocument = HydratedDocument<TournamentTrade>;

@Schema({ collection: 'tournament_trades', timestamps: false })
export class TournamentTrade {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tournamentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  orderId!: Types.ObjectId;

  @Prop({ required: true, uppercase: true })
  symbol!: string;

  @Prop({ required: true, enum: ['BUY', 'SELL'] })
  side!: 'BUY' | 'SELL';

  @Prop({ required: true, min: 1 })
  quantity!: number;

  @Prop({ required: true })
  executionPrice!: number;

  @Prop({ required: true })
  grossAmount!: number;

  @Prop({ required: true })
  commissionAmount!: number;

  @Prop({ required: true })
  netAmount!: number;

  @Prop({ required: true })
  grossAmountBase!: number;

  @Prop({ required: true })
  commissionAmountBase!: number;

  @Prop({ required: true })
  netAmountBase!: number;

  @Prop({ required: true })
  executedAt!: Date;
}

export const TournamentTradeSchema =
  SchemaFactory.createForClass(TournamentTrade);
TournamentTradeSchema.index({ tournamentId: 1, userId: 1, executedAt: -1 });
TournamentTradeSchema.index({ tournamentId: 1, executedAt: -1 });
