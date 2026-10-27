export type TournamentStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'ACTIVE'
  | 'FINISHED'
  | 'CANCELLED';

export type TournamentVisibility = 'PUBLIC' | 'PRIVATE';

export type TournamentParticipantStatus =
  | 'ACTIVE'
  | 'DISQUALIFIED'
  | 'FINISHED';

export type TournamentRankingMetric =
  | 'RETURN_PERCENTAGE'
  | 'TOTAL_EQUITY'
  | 'TOTAL_SHARES'
  | 'TRADE_COUNT'
  | 'INVESTED_VALUE'
  | 'AVAILABLE_BALANCE';

export type TournamentOrderStatus = 'PENDING' | 'EXECUTED' | 'CANCELLED';
