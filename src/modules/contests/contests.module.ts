import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContestsService } from './application/services/contests.service';
import {
  Contest,
  ContestSchema,
} from './infrastructure/schemas/contest.schema';
import { AdminContestsController } from './presentation/controllers/admin-contests.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Contest.name, schema: ContestSchema }]),
  ],
  controllers: [AdminContestsController],
  providers: [ContestsService],
  exports: [ContestsService],
})
export class ContestsModule {}
