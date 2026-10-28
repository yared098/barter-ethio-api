// src/requests/requests.controller.ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { ReplyRequestDto } from './dto/reply-request.dto';
import { ListRequestsQueryDto } from './dto/list-requests-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  // ── requests ──
  @Post()
  create(@CurrentUser() u, @Body() dto: CreateRequestDto) {
    return this.requests.create(u.id, dto);
  }

  @Get()
  list(@CurrentUser() u, @Query() q: ListRequestsQueryDto) {
    return this.requests.list(u.id, q);
  }

  @Get(':id')
  detail(@CurrentUser() u, @Param('id') id: string) {
    return this.requests.getDetail(id, u.id);
  }

  @Patch(':id')
  update(@CurrentUser() u, @Param('id') id: string, @Body() dto: UpdateRequestDto) {
    return this.requests.update(u.id, id, dto);
  }

  @Delete(':id')
  cancel(@CurrentUser() u, @Param('id') id: string) {
    return this.requests.cancel(u.id, id);
  }

  // ── replies ──
  @Post(':id/replies')
  reply(@CurrentUser() u, @Param('id') id: string, @Body() dto: ReplyRequestDto) {
    return this.requests.reply(u.id, id, dto);
  }

  @Post(':id/replies/:replyId/accept')
  accept(
    @CurrentUser() u,
    @Param('id') id: string,
    @Param('replyId') replyId: string,
  ) {
    return this.requests.acceptReply(u.id, id, replyId);
  }

  @Delete(':id/replies/:replyId')
  withdraw(
    @CurrentUser() u,
    @Param('id') id: string,
    @Param('replyId') replyId: string,
  ) {
    return this.requests.withdrawReply(u.id, id, replyId);
  }
}