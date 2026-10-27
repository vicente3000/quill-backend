import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TournamentPositionDocument = HydratedDocument<TournamentPosition>;

@Schema({ collection: 'tournament_positions', timestamps: true })
export class TournamentPosition {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tournamentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, uppercase: true, trim: true })
  symbol!: string;

  @Prop({ required: true, min: 0 })
  quantity!: number;

  @Prop({ required: true, min: 0, default: 0 })
  reservedQuantity!: number;

  @Prop({ required: true, min: 0 })
  averageCost!: number;
}

export const TournamentPositionSchema =
  SchemaFactory.createForClass(TournamentPosition);
TournamentPositionSchema.index(
  { tournamentId: 1, userId: 1, symbol: 1 },
  { unique: true },
);
