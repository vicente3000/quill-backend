import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type ContestParticipantDocument = HydratedDocument<ContestParticipant>;

@Schema({ collection: 'contest_participants', timestamps: true })
export class ContestParticipant {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Contest', required: true })
  contestId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  createdAt?: Date;

  updatedAt?: Date;
}

export const ContestParticipantSchema =
  SchemaFactory.createForClass(ContestParticipant);

ContestParticipantSchema.index({ contestId: 1, userId: 1 }, { unique: true });
