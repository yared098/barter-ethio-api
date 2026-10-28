import {
  Body, Controller, Delete, Get, Param, Post, Query, UseGuards,
} from '@nestjs/common';
import { BiddingService } from './bidding.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { PlaceBidDto } from './dto/place-bid.dto';
import { ListListingsQueryDto } from './dto/list-listings-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('bidding')
export class BiddingController {
  constructor(private readonly bidding: BiddingService) {}

  // ── listings ──
  @Post('listings')
  create(@CurrentUser() u: any, @Body() dto: CreateListingDto) {
    return this.bidding.createListing(u.id, dto);
  }

  @Get('listings')
  list(@CurrentUser() u: any, @Query() q: ListListingsQueryDto) {
    return this.bidding.listListings(u.id, q);
  }

  @Get('listings/:id')
  detail(@CurrentUser() u: any, @Param('id') id: string) {
    return this.bidding.getListing(id, u.id);
  }

  @Delete('listings/:id')
  cancel(@CurrentUser() u: any, @Param('id') id: string) {
    return this.bidding.cancelListing(u.id, id);
  }

  // ── bids ──
  @Post('listings/:id/bids')
  bid(
    @CurrentUser() u: any,
    @Param('id') id: string,
    @Body() dto: PlaceBidDto,
  ) {
    return this.bidding.placeBid(u.id, id, dto);
  }

  @Post('listings/:id/bids/:bidId/accept')
  accept(
    @CurrentUser() u: any,
    @Param('id') id: string,
    @Param('bidId') bidId: string,
  ) {
    return this.bidding.acceptBid(u.id, id, bidId);
  }

  @Post('listings/:id/bids/:bidId/reject')
  reject(
    @CurrentUser() u: any,
    @Param('id') id: string,
    @Param('bidId') bidId: string,
  ) {
    return this.bidding.rejectBid(u.id, id, bidId);
  }

  @Delete('listings/:id/bids/:bidId')
  withdraw(
    @CurrentUser() u: any,
    @Param('id') id: string,
    @Param('bidId') bidId: string,
  ) {
    return this.bidding.withdrawBid(u.id, id, bidId);
  }
}
