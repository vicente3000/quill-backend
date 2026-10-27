import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import type { JwtPayload } from '../../../../common/interfaces/jwt-payload.interface';
import { ParseObjectIdPipe } from '../../../../common/pipes/parse-object-id.pipe';
import { TournamentTradingService } from '../../application/services/tournament-trading.service';
import { TournamentsService } from '../../application/services/tournaments.service';
import { CreateTournamentDto } from '../dto/create-tournament.dto';
import { JoinTournamentDto } from '../dto/join-tournament.dto';
import { TournamentListQueryDto } from '../dto/tournament-list-query.dto';
import { UpdateTournamentDto } from '../dto/update-tournament.dto';

@Controller('tournaments')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class TournamentsController {
  constructor(
    private readonly tournamentsService: TournamentsService,
    private readonly tradingService: TournamentTradingService,
  ) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(RolesGuard)
  @Roles('teacher', 'admin')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTournamentDto) {
    return this.tournamentsService.create(user.sub, dto);
  }

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: TournamentListQueryDto,
  ) {
    return this.tournamentsService.list(user, query);
  }

  @Get(':id')
  get(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.tournamentsService.getAccessible(id, user);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateTournamentDto,
  ) {
    return this.tournamentsService.update(id, user, dto);
  }

  @Post(':id/publish')
  publish(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.tournamentsService.publish(id, user);
  }

  @Post(':id/start')
  start(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.tournamentsService.start(id, user);
  }

  @Post(':id/finish')
  finish(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.tradingService.finishTournament(id, user);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.tradingService.cancelTournament(id, user);
  }

  @Post(':id/join')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  join(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: JoinTournamentDto,
  ) {
    return this.tournamentsService.join(id, user.sub, dto);
  }

  @Post(':id/join-code/rotate')
  rotateJoinCode(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.tournamentsService.rotateJoinCode(id, user);
  }

  @Get(':id/participants')
  participants(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.tournamentsService.listParticipants(id, user);
  }

  @Delete(':id/participants/:participantUserId')
  async removeParticipant(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('participantUserId', ParseObjectIdPipe) participantUserId: string,
  ) {
    await this.tournamentsService.removeParticipant(
      id,
      participantUserId,
      user,
    );
    return { message: 'Participante retirado correctamente.' };
  }
}
