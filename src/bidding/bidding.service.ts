import {
  BadRequestException, ForbiddenException, Injectable, Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Bid, BidListing, BidStatus, ListingStatus, Prisma, ProductStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { PlaceBidDto } from './dto/place-bid.dto';
import { ListListingsQueryDto } from './dto/list-listings-query.dto';
import { validateBarterBid, validateCashBid } from './helpers/bid-validator';

@Injectable()
export class BiddingService {
  private readonly log = new Logger('BiddingService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─────────────────────────────────────────────
  //  CREATE LISTING
  // ─────────────────────────────────────────────
  async createListing(ownerId: string, dto: CreateListingDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.ownerId !== ownerId) throw new ForbiddenException();

    if (new Date(dto.endsAt) <= new Date()) {
      throw new BadRequestException('endsAt must be in the future');
    }
    if (dto.type !== 'BARTER' && dto.startingBid == null) {
      throw new BadRequestException('startingBid required for CASH/EITHER');
    }

    return this.prisma.bidListing.create({
      data: {
        productId: dto.productId,
        ownerId,
        type: dto.type,
        startingBid: dto.startingBid,
        minIncrement: dto.minIncrement ?? 0,
        buyNowPrice: dto.buyNowPrice,
        reservePrice: dto.reservePrice,
        endsAt: new Date(dto.endsAt),
      },
      include: { product: true },
    });
  }

  // ─────────────────────────────────────────────
  //  LIST
  // ─────────────────────────────────────────────
  async listListings(userId: string, q: ListListingsQueryDto) {
    const where: Prisma.BidListingWhereInput = {};

    if (q.scope === 'mine') where.ownerId = userId;
    else if (q.scope === 'bidding') {
      where.bids = {
        some: { bidderId: userId, status: BidStatus.ACTIVE },
      };
    } else if (q.scope === 'won') {
      where.acceptedBid = { bidderId: userId };
    } else {
      where.status = ListingStatus.ACTIVE;
    }

    if (q.status) where.status = q.status;
    if (q.categoryId) where.product = { categoryId: q.categoryId };
    if (q.q) {
      where.product = {
        ...(where.product as object),
        OR: [
          { title: { contains: q.q, mode: 'insensitive' } },
          { description: { contains: q.q, mode: 'insensitive' } },
        ],
      };
    }

    return this.prisma.bidListing.findMany({
      where,
      orderBy: [{ status: 'asc' }, { endsAt: 'asc' }],
      include: {
        product: { include: { category: true, owner: true } },
        bids: {
          where: { status: BidStatus.ACTIVE, amount: { not: null } },
          orderBy: { amount: 'desc' },
          take: 1,
        },
        _count: { select: { bids: true } },
      },
      take: 100,
    });
  }

  // ─────────────────────────────────────────────
  //  DETAIL
  // ─────────────────────────────────────────────
  async getListing(id: string, viewerId?: string) {
    const listing = await this.prisma.bidListing.findUnique({
      where: { id },
      include: {
        product: { include: { category: true, owner: true } },
        owner: true,
        bids: {
          orderBy: [{ amount: 'desc' }, { createdAt: 'asc' }],
          include: { bidder: true, offeredProduct: true },
        },
      },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const isOwner = !!viewerId && listing.ownerId === viewerId;

    // Bidder → attach offerId if their bid was accepted
    let myOfferId: string | null = null;
    if (viewerId) {
      const myAcceptedBid = listing.bids.find(
        (b) => b.bidderId === viewerId && b.status === BidStatus.ACCEPTED,
      );
      if (myAcceptedBid) {
        const offer = await this.prisma.barterOffer.findFirst({
          where: {
            senderId: myAcceptedBid.bidderId,
            receiverId: listing.ownerId,
            requestedProductId: listing.productId,
          },
          select: { id: true },
          orderBy: { createdAt: 'desc' },
        });
        myOfferId = offer?.id ?? null;
      }
    }

    return {
      ...listing,
      isOwner,
      myOfferId,
    };
  }

  // ─────────────────────────────────────────────
  //  PLACE BID
  // ─────────────────────────────────────────────
  async placeBid(bidderId: string, listingId: string, dto: PlaceBidDto) {
    const listing = await this.prisma.bidListing.findUnique({
      where: { id: listingId },
      include: {
        product: true,
        bids: {
          where: { status: BidStatus.ACTIVE, amount: { not: null } },
          orderBy: { amount: 'desc' },
          take: 1,
        },
      },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status !== ListingStatus.ACTIVE) {
      throw new BadRequestException('Listing is no longer active');
    }
    if (listing.ownerId === bidderId) {
      throw new BadRequestException('You cannot bid on your own listing');
    }

    if (listing.type === 'BARTER' || dto.offeredProductId) {
      validateBarterBid(listing, dto.offeredProductId);
      if (dto.offeredProductId) {
        const p = await this.prisma.product.findUnique({
          where: { id: dto.offeredProductId },
        });
        if (!p || p.ownerId !== bidderId) {
          throw new BadRequestException(
            'You can only bid with your own product',
          );
        }
      }
    } else {
      validateCashBid(listing, listing.bids[0] ?? null, dto.amount!);
    }

    const previousHigh = listing.bids[0];
    let offerId: string | null = null;

    const result = await this.prisma.$transaction(async (tx) => {
      const bid = await tx.bid.create({
        data: {
          listingId,
          bidderId,
          amount: dto.amount,
          offeredProductId: dto.offeredProductId,
          message: dto.message,
        },
        include: { bidder: true, offeredProduct: true },
      });

      if (previousHigh && previousHigh.bidderId !== bidderId) {
        await tx.bid.update({
          where: { id: previousHigh.id },
          data: { status: BidStatus.OUTBID },
        });
      }

      // Buy-now auto-accept
      if (
        listing.buyNowPrice != null &&
        dto.amount != null &&
        dto.amount >= listing.buyNowPrice
      ) {
        await tx.bidListing.update({
          where: { id: listingId },
          data: { status: ListingStatus.ACCEPTED, acceptedBidId: bid.id },
        });
        await tx.bid.update({
          where: { id: bid.id },
          data: { status: BidStatus.ACCEPTED },
        });
        await tx.product.update({
          where: { id: listing.productId },
          data: { status: ProductStatus.PENDING },
        });

        // Create chat
        const offer = await tx.barterOffer.create({
          data: {
            senderId: bidderId,
            receiverId: listing.ownerId,
            offeredProductId: dto.offeredProductId ?? null,
            requestedProductId: listing.productId,
            message: dto.message,
            status: 'PENDING',
          },
        });
        offerId = offer.id;
      }

      return bid;
    });

    this._notifyNewBid(listing, result, previousHigh, offerId);

    return { ...result, offerId };
  }

  // ─────────────────────────────────────────────
  //  ACCEPT BID
  // ─────────────────────────────────────────────
  async acceptBid(ownerId: string, listingId: string, bidId: string) {
    const listing = await this.prisma.bidListing.findUnique({
      where: { id: listingId },
      include: { bids: true, product: true },
    });
    if (!listing) throw new NotFoundException();
    if (listing.ownerId !== ownerId) throw new ForbiddenException();
    if (listing.status !== ListingStatus.ACTIVE) {
      throw new BadRequestException('Listing already closed');
    }

    const winner = listing.bids.find((b) => b.id === bidId);
    if (!winner) throw new NotFoundException('Bid not found');

    if (
      listing.reservePrice != null &&
      winner.amount != null &&
      winner.amount < listing.reservePrice
    ) {
      throw new BadRequestException('Bid is below reserve price');
    }

    let offerId: string | null = null;

    await this.prisma.$transaction(async (tx) => {
      await tx.bidListing.update({
        where: { id: listingId },
        data: { status: ListingStatus.ACCEPTED, acceptedBidId: bidId },
      });
      await tx.bid.update({
        where: { id: bidId },
        data: { status: BidStatus.ACCEPTED },
      });
      await tx.bid.updateMany({
        where: {
          listingId,
          id: { not: bidId },
          status: BidStatus.ACTIVE,
        },
        data: { status: BidStatus.REJECTED },
      });
      await tx.product.update({
        where: { id: listing.productId },
        data: { status: ProductStatus.PENDING },
      });

      const offer = await tx.barterOffer.create({
        data: {
          senderId: winner.bidderId,
          receiverId: ownerId,
          offeredProductId: winner.offeredProductId ?? null,
          requestedProductId: listing.productId,
          message: winner.amount != null
            ? `[CASH:${winner.amount}] ${winner.message ?? ''}`.trim()
            : winner.message,
          status: 'PENDING',
        },
      });
      offerId = offer.id;
    });

    this._notifyAccepted(listing, winner, listing.bids, offerId!);
    return { listingId, bidId, offerId, status: 'ACCEPTED' };
  }

  // ─────────────────────────────────────────────
  //  REJECT BID
  // ─────────────────────────────────────────────
  async rejectBid(ownerId: string, listingId: string, bidId: string) {
    const listing = await this.prisma.bidListing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundException();
    if (listing.ownerId !== ownerId) throw new ForbiddenException();

    const bid = await this.prisma.bid.update({
      where: { id: bidId },
      data: { status: BidStatus.REJECTED },
    });

    this.notifications
      .sendToUser(bid.bidderId, {
        title: 'Bid rejected',
        body: 'Your bid was not accepted.',
        data: { type: 'bid_lost', listingId },
      })
      .catch(() => {});

    return bid;
  }

  // ─────────────────────────────────────────────
  //  WITHDRAW BID
  // ─────────────────────────────────────────────
  async withdrawBid(bidderId: string, listingId: string, bidId: string) {
    const bid = await this.prisma.bid.findUnique({ where: { id: bidId } });
    if (!bid) throw new NotFoundException();
    if (bid.bidderId !== bidderId) throw new ForbiddenException();
    if (bid.status !== BidStatus.ACTIVE) {
      throw new BadRequestException('Bid already finalized');
    }
    return this.prisma.bid.update({
      where: { id: bidId },
      data: { status: BidStatus.WITHDRAWN },
    });
  }

  // ─────────────────────────────────────────────
  //  CANCEL LISTING
  // ─────────────────────────────────────────────
  async cancelListing(ownerId: string, listingId: string) {
    const listing = await this.prisma.bidListing.findUnique({
      where: { id: listingId },
      include: { bids: { where: { status: BidStatus.ACTIVE } } },
    });
    if (!listing) throw new NotFoundException();
    if (listing.ownerId !== ownerId) throw new ForbiddenException();
    if (listing.status !== ListingStatus.ACTIVE) {
      throw new BadRequestException('Listing already closed');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bidListing.update({
        where: { id: listingId },
        data: { status: ListingStatus.CANCELLED },
      });
      await tx.bid.updateMany({
        where: { listingId, status: BidStatus.ACTIVE },
        data: { status: BidStatus.REJECTED },
      });
    });

    for (const b of listing.bids) {
      this.notifications
        .sendToUser(b.bidderId, {
          title: 'Listing cancelled',
          body: 'The auction was cancelled by the owner.',
          data: { type: 'bid_lost', listingId },
        })
        .catch(() => {});
    }
  }

  // ─────────────────────────────────────────────
  //  NOTIFICATION HELPERS
  // ─────────────────────────────────────────────
  private _notifyNewBid(
    listing: any,
    bid: any,
    prev?: Bid | null,
    offerId?: string | null,
  ) {
    const title = listing.product?.title ?? 'your product';
    const amountText =
      bid.amount != null ? `ETB ${bid.amount}` : 'a barter offer';

    this.notifications
      .sendToUser(listing.ownerId, {
        title: '🔔 New bid received',
        body: `${bid.bidder?.name ?? 'Someone'} bid ${amountText} on ${title}`,
        data: {
          type: 'bid_new',
          listingId: listing.id,
          bidId: bid.id,
        },
      })
      .catch((e) => this.log.warn(`${e}`));

    if (prev && prev.bidderId !== bid.bidderId) {
      this.notifications
        .sendToUser(prev.bidderId, {
          title: '⚠️ You were outbid',
          body: `Your bid on ${title} was beaten by ${amountText}`,
          data: { type: 'bid_outbid', listingId: listing.id },
        })
        .catch((e) => this.log.warn(`${e}`));
    }

    if (offerId && bid.amount != null) {
      // Buy-now hit → notify winner with offerId
      this.notifications
        .sendToUser(bid.bidderId, {
          title: '🎉 You won the auction!',
          body: `Your buy-now on ${title} was accepted. Chat with the owner.`,
          data: {
            type: 'bid_accepted',
            listingId: listing.id,
            bidId: bid.id,
            offerId,
          },
        })
        .catch(() => {});
    }
  }

  private _notifyAccepted(
    listing: any,
    winner: Bid,
    allBids: Bid[],
    offerId: string,
  ) {
    const title = listing.product?.title ?? 'product';

    this.notifications
      .sendToUser(winner.bidderId, {
        title: '🎉 Bid accepted!',
        body: `Your bid on ${title} was accepted. Chat with the owner.`,
        data: {
          type: 'bid_accepted',
          listingId: listing.id,
          bidId: winner.id,
          offerId,
        },
      })
      .catch((e) => this.log.warn(`${e}`));

    const losers = allBids.filter(
      (b) => b.id !== winner.id && b.status === BidStatus.ACTIVE,
    );
    for (const b of losers) {
      this.notifications
        .sendToUser(b.bidderId, {
          title: 'Bid ended',
          body: `The listing for ${title} went to another bidder.`,
          data: { type: 'bid_lost', listingId: listing.id },
        })
        .catch(() => {});
    }

    this.notifications
      .sendToUser(listing.ownerId, {
        title: '✅ Bid accepted',
        body: `You accepted a bid on ${title}. Chat is ready.`,
        data: {
          type: 'bid_owner_confirmed',
          listingId: listing.id,
          offerId,
        },
      })
      .catch(() => {});
  }
}
