import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { AccountType, UserRole } from '../../../../common/types/role.type';

export type UserDocument = HydratedDocument<User>;

@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  fullName!: string;

  @Prop({ required: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ required: true, default: 0 })
  availableBalance!: number;

  @Prop({ required: true, default: 0 })
  reservedBalance!: number;

  @Prop({ required: true, default: 'investor', type: String })
  role!: UserRole;

  @Prop({
    required: true,
    type: String,
    enum: ['ucn', 'external'],
    default: 'external',
  })
  accountType!: AccountType;

  @Prop({ required: true, default: 0 })
  tokenVersion!: number;

  @Prop({ lowercase: true, trim: true })
  username?: string;

  @Prop({ type: [String], default: [] })
  watchlist!: string[];
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ username: 1 }, { unique: true, sparse: true });
