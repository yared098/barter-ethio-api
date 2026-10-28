import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { SendMessageDto } from './dto/send-message.dto';

const INCLUDE = {
  offeredProduct: {
    include: {
      category: true,
      owner: { select: { id: true, name: true, image: true } },
    },
  },
  requestedProduct: {
    include: {
      category: true,
      owner: { select: { id: true, name: true, image: true } },
    },
  },
  sender: { select: { id: true, name: true, image: true } },
  receiver: { select: { id: true, name: true, image: true } },
} as const;

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(userId: string, box: 'incoming' | 'outgoing') {
    return this.prisma.barterOffer.findMany({
      where: box === 'incoming' ? { receiverId: userId } : { senderId: userId },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const offer = await this.prisma.barterOffer.findUnique({
      where: { id },
      include: { ...INCLUDE, messages: { include: { sender: { select: { id: true, name: true, image: true } } }, orderBy: { createdAt: 'asc' } } },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.senderId !== userId && offer.receiverId !== userId) {
      throw new ForbiddenException('Not your offer');
    }
    return offer;
  }

  async create(senderId: string, dto: CreateOfferDto) {
    if (dto.offeredProductId === dto.requestedProductId) {
      throw new ForbiddenException('Cannot offer a product for itself');
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: [dto.offeredProductId, dto.requestedProductId] } },
    });
    const offered = products.find(p => p.id === dto.offeredProductId);
    const requested = products.find(p => p.id === dto.requestedProductId);

    if (!offered || !requested) throw new NotFoundException('Product not found');
    if (offered.ownerId !== senderId) throw new ForbiddenException('You don\'t own the offered product');
    if (offered.status !== 'AVAILABLE' || requested.status !== 'AVAILABLE') {
      throw new ForbiddenException('Both products must be AVAILABLE');
    }

    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { name: true, email: true },
    });

    const [offer] = await this.prisma.$transaction([
      this.prisma.barterOffer.create({
        data: {
          senderId,
          receiverId: requested.ownerId,
          offeredProductId: dto.offeredProductId,
          requestedProductId: dto.requestedProductId,
          message: dto.message,
        },
        include: INCLUDE,
      }),
      this.prisma.product.update({
        where: { id: dto.offeredProductId },
        data: { status: 'PENDING' },
      }),
      this.prisma.product.update({
        where: { id: dto.requestedProductId },
        data: { status: 'PENDING' },
      }),
    ]);

    // 🔔 Notify receiver
    await this.notifications.offerReceived(
      requested.ownerId,
      sender?.name ?? sender?.email ?? 'Someone',
      requested.title,
      offer.id,
    );

    return offer;
  }

 async accept(offerId: string, receiverId: string) {
  const offer = await this.prisma.barterOffer.findUnique({
    where: { id: offerId },
    include: INCLUDE,
  });
  if (!offer) throw new NotFoundException('Offer not found');
  if (offer.receiverId !== receiverId) {
    throw new ForbiddenException('Only the receiver can accept');
  }
  if (offer.status !== 'PENDING') {
    throw new ForbiddenException(`Cannot accept offer in status ${offer.status}`);
  }

  const receiver = await this.prisma.user.findUnique({
    where: { id: receiverId },
    select: { name: true },
  });

  const ops: any[] = [
    this.prisma.barterOffer.update({
      where: { id: offerId },
      data: { status: 'ACCEPTED' },
    }),
  ];

  // Requested product (author's) — optional, null in request chats
  if (offer.requestedProductId) {
    ops.push(
      this.prisma.product.update({
        where: { id: offer.requestedProductId },
        data: { ownerId: offer.senderId, status: 'SWAPPED' },
      }),
    );
  }

  // Offered product (responder's) — optional, null in cash bids
  if (offer.offeredProductId) {
    ops.push(
      this.prisma.product.update({
        where: { id: offer.offeredProductId },
        data: { ownerId: offer.receiverId, status: 'SWAPPED' },
      }),
    );
  }

  await this.prisma.$transaction(ops);

  await this.notifications.offerAccepted(
    offer.senderId,
    receiver?.name ?? 'Someone',
    offer.id,
  );

  return { ok: true, status: 'ACCEPTED' };
}

async decline(offerId: string, receiverId: string) {
  const offer = await this.prisma.barterOffer.findUnique({
    where: { id: offerId },
    include: INCLUDE,
  });
  if (!offer) throw new NotFoundException('Offer not found');
  if (offer.receiverId !== receiverId) {
    throw new ForbiddenException('Only the receiver can decline');
  }
  if (offer.status !== 'PENDING') {
    throw new ForbiddenException(`Cannot decline in status ${offer.status}`);
  }

  const receiver = await this.prisma.user.findUnique({
    where: { id: receiverId },
    select: { name: true },
  });

  const ops: any[] = [
    this.prisma.barterOffer.update({
      where: { id: offerId },
      data: { status: 'DECLINED' },
    }),
  ];

  if (offer.requestedProductId) {
    ops.push(
      this.prisma.product.update({
        where: { id: offer.requestedProductId },
        data: { status: 'AVAILABLE' },
      }),
    );
  }

  if (offer.offeredProductId) {
    ops.push(
      this.prisma.product.update({
        where: { id: offer.offeredProductId },
        data: { status: 'AVAILABLE' },
      }),
    );
  }

  await this.prisma.$transaction(ops);

  await this.notifications.offerDeclined(
    offer.senderId,
    receiver?.name ?? 'Someone',
    offer.id,
  );

  return { ok: true, status: 'DECLINED' };
}
 async cancel(offerId: string, senderId: string) {
  const offer = await this.prisma.barterOffer.findUnique({
    where: { id: offerId },
    include: INCLUDE,
  });
  if (!offer) throw new NotFoundException('Offer not found');
  if (offer.senderId !== senderId) {
    throw new ForbiddenException('Only the sender can cancel');
  }
  if (offer.status !== 'PENDING') {
    throw new ForbiddenException(`Cannot cancel in status ${offer.status}`);
  }

  const sender = await this.prisma.user.findUnique({
    where: { id: senderId },
    select: { name: true },
  });

  const ops: any[] = [
    this.prisma.barterOffer.update({
      where: { id: offerId },
      data: { status: 'CANCELLED' },
    }),
  ];

  if (offer.requestedProductId) {
    ops.push(
      this.prisma.product.update({
        where: { id: offer.requestedProductId },
        data: { status: 'AVAILABLE' },
      }),
    );
  }

  if (offer.offeredProductId) {
    ops.push(
      this.prisma.product.update({
        where: { id: offer.offeredProductId },
        data: { status: 'AVAILABLE' },
      }),
    );
  }

  await this.prisma.$transaction(ops);

  await this.notifications.offerCancelled(
    offer.receiverId,
    sender?.name ?? 'Someone',
    offer.id,
  );

  return { ok: true, status: 'CANCELLED' };
}

  async complete(offerId: string, userId: string) {
    const offer = await this.prisma.barterOffer.findUnique({ where: { id: offerId }, include: INCLUDE });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.senderId !== userId && offer.receiverId !== userId) {
      throw new ForbiddenException('Not your offer');
    }
    if (offer.status !== 'ACCEPTED') throw new ForbiddenException('Offer must be ACCEPTED first');

    await this.prisma.barterOffer.update({
      where: { id: offerId },
      data: { status: 'COMPLETED' },
    });

    const otherUserId = offer.senderId === userId ? offer.receiverId : offer.senderId;
    await this.notifications.offerCompleted(
      otherUserId,
      offer.id,
      'Both sides confirmed the swap is complete',
    );

    return { ok: true, status: 'COMPLETED' };
  }

  // ─── Messages (the "make contact" step) ───

  async sendMessage(offerId: string, senderId: string, dto: SendMessageDto) {
    const offer = await this.prisma.barterOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.senderId !== senderId && offer.receiverId !== senderId) {
      throw new ForbiddenException('Not your offer');
    }
    if (['COMPLETED', 'CANCELLED', 'DECLINED'].includes(offer.status)) {
      throw new ForbiddenException(`Cannot message on a ${offer.status} offer`);
    }

    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { name: true },
    });

    const message = await this.prisma.message.create({
      data: { offerId, senderId, content: dto.content },
      include: { sender: { select: { id: true, name: true, image: true } } },
    });

    const recipientId = offer.senderId === senderId ? offer.receiverId : offer.senderId;
    await this.notifications.newMessage(recipientId, sender?.name ?? 'Someone', offerId);

    return message;
  }

  async listMessages(offerId: string, userId: string) {
    const offer = await this.prisma.barterOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.senderId !== userId && offer.receiverId !== userId) {
      throw new ForbiddenException('Not your offer');
    }

    return this.prisma.message.findMany({
      where: { offerId },
      include: { sender: { select: { id: true, name: true, image: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}