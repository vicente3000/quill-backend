import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import type { JwtPayload } from '../../../../common/interfaces/jwt-payload.interface';
import { ParseObjectIdPipe } from '../../../../common/pipes/parse-object-id.pipe';
import { ContestsService } from '../../application/services/contests.service';
import { CreateContestDto } from '../dto/create-contest.dto';

@Controller('admin/contests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminContestsController {
  constructor(private readonly contestsService: ContestsService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateContestDto) {
    return this.contestsService.create(user.sub, dto);
  }

  @Get()
  findAll() {
    return this.contestsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.contestsService.findOne(id);
  }
}
