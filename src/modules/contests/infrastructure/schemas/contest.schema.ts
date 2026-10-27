import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import {
  CONTEST_ACCOUNT_TYPES,
  CONTEST_MODES,
} from '../../domain/entities/contest.entity';
import type {
  ContestAccountType,
  ContestMode,
} from '../../domain/entities/contest.entity';

export type ContestDocument = HydratedDocument<Contest>;

@Schema({ collection: 'contests', timestamps: true })
export class Contest {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: Date, required: true })
  startDate!: Date;

  @Prop({ type: Date, required: true })
  endDate!: Date;

  @Prop({ required: true })
  initialBalance!: number;

  @Prop({ type: String, required: true, enum: CONTEST_MODES })
  mode!: ContestMode;

  @Prop({ type: [String], required: true, enum: CONTEST_ACCOUNT_TYPES })
  allowedAccountTypes!: ContestAccountType[];

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  createdAt?: Date;

  updatedAt?: Date;
}

export const ContestSchema = SchemaFactory.createForClass(Contest);

ContestSchema.index({ startDate: -1 });
