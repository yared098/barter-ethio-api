import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OffersService } from './offers.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { OfferActionDto } from './dto/offer-action.dto';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('offers')
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Get()
  list(@CurrentUser('id') userId: string, @Query('box') box?: string) {
    return this.offers.list(userId, box === 'outgoing' ? 'outgoing' : 'incoming');
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.offers.findOne(id, userId);
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateOfferDto) {
    return this.offers.create(userId, dto);
  }

  @Patch(':id')
  action(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: OfferActionDto,
  ) {
    switch (dto.action) {
      case 'accept':   return this.offers.accept(id, userId);
      case 'decline':  return this.offers.decline(id, userId);
      case 'cancel':   return this.offers.cancel(id, userId);
      case 'complete': return this.offers.complete(id, userId);
    }
  }

  @Post(':id/messages')
  sendMessage(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.offers.sendMessage(id, userId, dto);
  }

  @Get(':id/messages')
  listMessages(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.offers.listMessages(id, userId);
  }
}