import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class TournamentListQueryDto {
  @IsOptional()
  @IsEnum(['available', 'joined', 'current', 'history', 'owned', 'all'])
  scope?: 'available' | 'joined' | 'current' | 'history' | 'owned' | 'all';

  @IsOptional()
  @IsEnum(['DRAFT', 'OPEN', 'ACTIVE', 'FINISHED', 'CANCELLED'])
  status?: 'DRAFT' | 'OPEN' | 'ACTIVE' | 'FINISHED' | 'CANCELLED';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
