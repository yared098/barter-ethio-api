import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BidStatus, ListingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class BiddingCron {
  private readonly log = new Logger('BiddingCron');

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expireListings() {
    const now = new Date();
    const expiring = await this.prisma.bidListing.findMany({
      where: { status: ListingStatus.ACTIVE, endsAt: { lte: now } },
      include: {
        product: true,
        bids: {
          where: { status: BidStatus.ACTIVE },
          orderBy: { amount: 'desc' },
        },
      },
    });

    if (expiring.length === 0) return;
    this.log.log(`Expiring ${expiring.length} listings`);

    for (const listing of expiring) {
      await this.prisma.bidListing.update({
        where: { id: listing.id },
        data: { status: ListingStatus.EXPIRED },
      });

      const topBid = listing.bids[0];
      const reserveMet =
        topBid &&
        (listing.reservePrice == null ||
          (topBid.amount ?? 0) >= listing.reservePrice);

      this.notifications
        .sendToUser(listing.ownerId, {
          title: reserveMet
            ? 'Auction ended — bids waiting'
            : 'Auction ended',
          body: reserveMet
            ? `Top bid: ETB ${topBid.amount}. Open to accept.`
            : 'Nobody met your reserve.',
          data: { type: 'bid_ended', listingId: listing.id },
        })
        .catch(() => {});

      for (const b of listing.bids) {
        this.notifications
          .sendToUser(b.bidderId, {
            title: 'Auction ended',
            body: `${listing.product?.title ?? 'Listing'} has ended.`,
            data: { type: 'bid_ended', listingId: listing.id },
          })
          .catch(() => {});
      }
    }
  }
}
