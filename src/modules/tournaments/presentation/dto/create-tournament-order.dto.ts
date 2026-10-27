import {
  IsDefined,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateTournamentOrderDto {
  @IsString()
  @Length(1, 20)
  symbol!: string;

  @IsEnum(['BUY', 'SELL'])
  side!: 'BUY' | 'SELL';

  @IsInt()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsEnum(['LIMIT', 'MARKET'])
  type?: 'LIMIT' | 'MARKET';

  @ValidateIf((order: CreateTournamentOrderDto) => order.type !== 'MARKET')
  @IsDefined()
  @IsNumber()
  @IsPositive()
  @Min(0.01)
  limitPrice?: number;
}
