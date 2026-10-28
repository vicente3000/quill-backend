export const CONTEST_MODES = ['INDIVIDUAL', 'TEAM'] as const;
export const CONTEST_ACCOUNT_TYPES = ['UNIVERSITY', 'EXTERNAL'] as const;

export type ContestMode = (typeof CONTEST_MODES)[number];
export type ContestAccountType = (typeof CONTEST_ACCOUNT_TYPES)[number];
export type ContestStatus = 'UPCOMING' | 'ACTIVE' | 'FINISHED';

export interface ContestEntity {
  id: string;
  name: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  initialBalance: number;
  mode: ContestMode;
  allowedAccountTypes: ContestAccountType[];
  status: ContestStatus;
  participantsCount: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ContestSummaryEntity = Omit<
  ContestEntity,
  'createdBy' | 'createdAt' | 'updatedAt'
> & { isEnrolled: boolean };

export interface ContestEnrollmentEntity {
  contestId: string;
  userId: string;
  joinedAt: Date;
}

export function deriveContestStatus(
  startDate: Date,
  endDate: Date,
  now: Date = new Date(),
): ContestStatus {
  if (now < startDate) {
    return 'UPCOMING';
  }

  return now > endDate ? 'FINISHED' : 'ACTIVE';
}
