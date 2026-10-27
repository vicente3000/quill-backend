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

export class LeaderboardQueryDto {
  @IsOptional()
  @IsEnum(['ucn', 'external'])
  accountType?: 'ucn' | 'external';

  @IsOptional()
  @IsEnum([
    'RETURN_PERCENTAGE',
    'TOTAL_EQUITY',
    'TOTAL_SHARES',
    'TRADE_COUNT',
    'INVESTED_VALUE',
    'AVAILABLE_BALANCE',
  ])
  sortBy:
    | 'RETURN_PERCENTAGE'
    | 'TOTAL_EQUITY'
    | 'TOTAL_SHARES'
    | 'TRADE_COUNT'
    | 'INVESTED_VALUE'
    | 'AVAILABLE_BALANCE' = 'RETURN_PERCENTAGE';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  direction: 'asc' | 'desc' = 'desc';

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
  limit = 50;
}
