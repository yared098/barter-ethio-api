import { BadRequestException } from '@nestjs/common';
import { Bid, BidListing } from '@prisma/client';

export function validateCashBid(
  listing: BidListing,
  highest: Bid | null,
  amount: number,
) {
  if (listing.type === 'BARTER') {
    throw new BadRequestException('This listing only accepts barter bids');
  }
  if (new Date(listing.endsAt) <= new Date()) {
    throw new BadRequestException('Listing has ended');
  }
  if (listing.startingBid != null && amount < listing.startingBid) {
    throw new BadRequestException(
      `Bid must be at least ${listing.startingBid}`,
    );
  }
  if (highest?.amount != null) {
    const minimum = highest.amount + (listing.minIncrement ?? 0);
    if (amount <= highest.amount) {
      throw new BadRequestException(
        `Bid must be greater than current highest (${highest.amount})`,
      );
    }
    if (listing.minIncrement > 0 && amount < minimum) {
      throw new BadRequestException(`Minimum next bid is ${minimum}`);
    }
  }
}

export function validateBarterBid(
  listing: BidListing,
  offeredProductId: string | undefined,
) {
  if (listing.type === 'CASH') {
    throw new BadRequestException('This listing only accepts cash bids');
  }
  if (!offeredProductId) {
    throw new BadRequestException(
      'offeredProductId required for barter bid',
    );
  }
  if (new Date(listing.endsAt) <= new Date()) {
    throw new BadRequestException('Listing has ended');
  }
}
