import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { TournamentParticipantStatus } from '../../domain/tournament.types';

export type TournamentParticipantDocument =
  HydratedDocument<TournamentParticipant>;

@Schema({ collection: 'tournament_participants', timestamps: true })
export class TournamentParticipant {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tournamentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  availableBalance!: number;

  @Prop({ required: true, min: 0, default: 0 })
  reservedBalance!: number;

  @Prop({ required: true, min: 1 })
  initialBalance!: number;

  @Prop({
    required: true,
    type: String,
    enum: ['ACTIVE', 'DISQUALIFIED', 'FINISHED'],
    default: 'ACTIVE',
  })
  status!: TournamentParticipantStatus;

  @Prop({ required: true, default: Date.now })
  joinedAt!: Date;

  @Prop()
  finalEquity?: number;

  @Prop()
  finalReturnPercentage?: number;

  @Prop()
  finalRank?: number;

  @Prop()
  finalizedAt?: Date;
}

export const TournamentParticipantSchema = SchemaFactory.createForClass(
  TournamentParticipant,
);
TournamentParticipantSchema.index(
  { tournamentId: 1, userId: 1 },
  { unique: true },
);
TournamentParticipantSchema.index({ tournamentId: 1, finalRank: 1 });
