import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type {
  TournamentStatus,
  TournamentVisibility,
} from '../../domain/tournament.types';

export type TournamentDocument = HydratedDocument<Tournament>;

@Schema({ collection: 'tournaments', timestamps: true })
export class Tournament {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  ownerId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 120 })
  name!: string;

  @Prop({ trim: true, maxlength: 1000, default: '' })
  description!: string;

  @Prop({ required: true })
  startAt!: Date;

  @Prop({ required: true })
  endAt!: Date;

  @Prop({
    required: true,
    type: String,
    enum: ['DRAFT', 'OPEN', 'ACTIVE', 'FINISHED', 'CANCELLED'],
    default: 'DRAFT',
    index: true,
  })
  status!: TournamentStatus;

  @Prop({
    required: true,
    type: String,
    enum: ['PUBLIC', 'PRIVATE'],
    default: 'PRIVATE',
  })
  visibility!: TournamentVisibility;

  @Prop({ required: true, min: 1 })
  initialBalance!: number;

  @Prop({ required: true, min: 0, max: 1, default: 0 })
  commissionRate!: number;

  @Prop({ required: true, default: 'CLP', uppercase: true })
  baseCurrency!: string;

  @Prop({ min: 2, max: 10000 })
  maxParticipants?: number;

  @Prop({ required: true, min: 0, default: 0 })
  participantCount!: number;

  @Prop({ select: false })
  joinCodeHash?: string;

  @Prop()
  finishedAt?: Date;
}

export const TournamentSchema = SchemaFactory.createForClass(Tournament);
TournamentSchema.index({ ownerId: 1, createdAt: -1 });
TournamentSchema.index({ status: 1, startAt: 1, endAt: 1 });
TournamentSchema.index({ visibility: 1, status: 1, startAt: 1 });
