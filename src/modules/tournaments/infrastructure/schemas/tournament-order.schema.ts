import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { TournamentOrderStatus } from '../../domain/tournament.types';

export type TournamentOrderDocument = HydratedDocument<TournamentOrder>;

@Schema({ collection: 'tournament_orders', timestamps: true })
export class TournamentOrder {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tournamentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, uppercase: true, trim: true })
  symbol!: string;

  @Prop({ required: true, enum: ['BUY', 'SELL'] })
  side!: 'BUY' | 'SELL';

  @Prop({ required: true, min: 1 })
  quantity!: number;

  @Prop({ required: true, enum: ['LIMIT', 'MARKET'] })
  type!: 'LIMIT' | 'MARKET';

  @Prop({ min: 0.01 })
  limitPrice?: number;

  @Prop({
    required: true,
    type: String,
    enum: ['PENDING', 'EXECUTED', 'CANCELLED'],
    default: 'PENDING',
    index: true,
  })
  status!: TournamentOrderStatus;

  @Prop({ required: true, default: 0, min: 0 })
  reservedAmount!: number;

  @Prop()
  executionPrice?: number;

  @Prop({ default: 0 })
  commissionAmount?: number;

  @Prop({ default: 0 })
  commissionAmountBase?: number;

  @Prop()
  executedAt?: Date;

  @Prop()
  cancelledAt?: Date;
}

export const TournamentOrderSchema =
  SchemaFactory.createForClass(TournamentOrder);
TournamentOrderSchema.index({ tournamentId: 1, userId: 1, createdAt: -1 });
TournamentOrderSchema.index({ status: 1, symbol: 1, tournamentId: 1 });
