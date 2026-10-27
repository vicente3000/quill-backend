import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class JoinTournamentDto {
  @IsOptional()
  @IsString()
  @Length(8, 8)
  @Matches(/^[A-Z0-9]+$/i)
  joinCode?: string;
}
