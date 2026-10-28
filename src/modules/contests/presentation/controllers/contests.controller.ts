import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../../../common/interfaces/jwt-payload.interface';
import { ParseObjectIdPipe } from '../../../../common/pipes/parse-object-id.pipe';
import { ContestEnrollmentsService } from '../../application/services/contest-enrollments.service';

@Controller('contests')
@UseGuards(JwtAuthGuard)
export class ContestsController {
  constructor(private readonly enrollmentsService: ContestEnrollmentsService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.enrollmentsService.findAllForUser(user.sub);
  }

  @Post(':id/enrollments')
  enroll(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.enrollmentsService.enroll(id, user.sub);
  }
}
