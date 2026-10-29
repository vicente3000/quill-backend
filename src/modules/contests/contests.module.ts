import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContestEnrollmentsService } from './application/services/contest-enrollments.service';
import { ContestsService } from './application/services/contests.service';
import {
  ContestParticipant,
  ContestParticipantSchema,
} from './infrastructure/schemas/contest-participant.schema';
import {
  Contest,
  ContestSchema,
} from './infrastructure/schemas/contest.schema';
import { AdminContestsController } from './presentation/controllers/admin-contests.controller';
import { ContestsController } from './presentation/controllers/contests.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Contest.name, schema: ContestSchema },
      { name: ContestParticipant.name, schema: ContestParticipantSchema },
    ]),
  ],
  controllers: [AdminContestsController, ContestsController],
  providers: [ContestsService, ContestEnrollmentsService],
  exports: [ContestsService],
})
export class ContestsModule {}
