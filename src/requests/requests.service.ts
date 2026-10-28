// src/requests/requests.service.ts
import {
  BadRequestException, ForbiddenException, Injectable, Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  RequestStatus, RequestType, ResponseStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { ReplyRequestDto } from './dto/reply-request.dto';
import { ListRequestsQueryDto } from './dto/list-requests-query.dto';

@Injectable()
export class RequestsService {
  private readonly log = new Logger('RequestsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─────────────────────────────────────────────
  //  CREATE  "I need iPhone 12, 40GB, 6GB, Addis"
  // ─────────────────────────────────────────────
  // async create(authorId: string, dto: CreateRequestDto) {
  //   if (dto.budgetMin != null && dto.budgetMax != null &&
  //       dto.budgetMin > dto.budgetMax) {
  //     throw new BadRequestException('budgetMin cannot exceed budgetMax');
  //   }

  //   const request = await this.prisma.request.create({
  //     data: {
  //       authorId,
  //       title: dto.title,
  //       description: dto.description,
  //       categoryId: dto.categoryId,
  //       images: dto.images ?? [],
  //       specifications: dto.specifications ?? undefined,
  //       budgetMin: dto.budgetMin,
  //       budgetMax: dto.budgetMax,
  //       type: dto.type ?? RequestType.BUY,
  //       location: dto.location,
  //       latitude: dto.latitude,
  //       longitude: dto.longitude,
  //       expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
  //     },
  //     include: { author: true, category: true },
  //   });

  //   // Fan-out notifications to matching sellers
  //   this._notifyMatchingSellers(request).catch((e) =>
  //     this.log.warn(`notify failed: ${e}`),
  //   );

  //   return request;
  // }  

  async create(authorId: string, dto: CreateRequestDto) {
  if (dto.budgetMin != null && dto.budgetMax != null &&
      dto.budgetMin > dto.budgetMax) {
    throw new BadRequestException('budgetMin cannot exceed budgetMax');
  }

  // ─── FREE tier limit: 1 open request at a time ───
  const user = await this.prisma.user.findUnique({
    where: { id: authorId },
    select: { id: true, tier: true, proExpiresAt: true },
  });
  if (!user) throw new NotFoundException('User not found');

  const isPro = user.tier === 'PRO' &&
      (user.proExpiresAt == null ||
       new Date(user.proExpiresAt) > new Date());

  if (!isPro) {
    const openCount = await this.prisma.request.count({
      where: {
        authorId,
        status: RequestStatus.OPEN,
      },
    });
    if (openCount >= 1) {
      throw new BadRequestException(
        'FREE users can only have 1 open request at a time. ' +
        'Close or complete your existing request, or upgrade to PRO.',
      );
    }
  }

  // ─── existing create logic ───
  const request = await this.prisma.request.create({
    data: {
      authorId,
      title: dto.title,
      description: dto.description,
      categoryId: dto.categoryId,
      images: dto.images ?? [],
      specifications: dto.specifications ?? undefined,
      budgetMin: dto.budgetMin,
      budgetMax: dto.budgetMax,
      type: dto.type ?? RequestType.BUY,
      location: dto.location,
      latitude: dto.latitude,
      longitude: dto.longitude,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    },
    include: { author: true, category: true },
  });

  this._notifyMatchingSellers(request).catch((e) =>
    this.log.warn(`notify failed: ${e}`),
  );

  return request;
}

  // Matching sellers = users with AVAILABLE products in the same category
  // (future: add spec-keyword match + geo radius filter)
  private async _notifyMatchingSellers(request: any) {
    const candidates = await this.prisma.product.findMany({
      where: {
        categoryId: request.categoryId,
        status: 'AVAILABLE',
        ownerId: { not: request.authorId },
      },
      select: { ownerId: true },
      distinct: ['ownerId'],
      take: 50,
    });

    for (const c of candidates) {
      this.notifications
        .sendToUser(c.ownerId, {
          title: '📣 Someone is looking for ' + request.title,
          body: request.description.slice(0, 100),
          data: { type: 'request_new', requestId: request.id },
        })
        .catch(() => {});
    }
  }

  // ─────────────────────────────────────────────
  //  LIST  (public feed + mine + replies)
  // ─────────────────────────────────────────────
  async list(userId: string, q: ListRequestsQueryDto) {
    const where: any = {};

    if (q.scope === 'mine') where.authorId = userId;
    else if (q.scope === 'replies') {
      where.responses = { some: { responderId: userId } };
    } else {
      where.status = RequestStatus.OPEN;
    }

    if (q.status) where.status = q.status;
    if (q.type) where.type = q.type;
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.q) {
      where.OR = [
        { title: { contains: q.q, mode: 'insensitive' } },
        { description: { contains: q.q, mode: 'insensitive' } },
      ];
    }

    return this.prisma.request.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        author: true,
        category: true,
        _count: { select: { responses: true } },
      },
      take: 100,
    });
  }

  // ─────────────────────────────────────────────
  //  DETAIL
  // ─────────────────────────────────────────────
 async getDetail(id: string, viewerId?: string) {
  const r = await this.prisma.request.findUnique({
    where: { id },
    include: {
      author: true,
      category: true,
      responses: {
        include: { responder: true, product: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!r) throw new NotFoundException('Request not found');

  const isAuthor = !!viewerId && r.authorId === viewerId;

  // Author sees all responses. Non-author sees only their own.
  const responses = isAuthor
    ? r.responses
    : r.responses.filter((x) => x.responderId === viewerId);

  const canRespond =
    !isAuthor && r.status === 'OPEN' && responses.length === 0;
  const canAccept =
    isAuthor && r.status === 'OPEN' && r.responses.length > 0;

 
  return {
    ...r,
    responses,
    isAuthor,
    canRespond,
    canAccept,
  };
}
  // ─────────────────────────────────────────────
  //  UPDATE (author only)
  // ─────────────────────────────────────────────
  async update(authorId: string, id: string, dto: UpdateRequestDto) {
    await this._ensureAuthor(authorId, id);
    return this.prisma.request.update({
      where: { id },
      data: {
        ...dto,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
  }

  // ─────────────────────────────────────────────
  //  CANCEL (author only)
  // ─────────────────────────────────────────────
  async cancel(authorId: string, id: string) {
    await this._ensureAuthor(authorId, id);
    const responses = await this.prisma.requestResponse.findMany({
      where: { requestId: id, status: ResponseStatus.PENDING },
    });

    const r = await this.prisma.request.update({
      where: { id },
      data: { status: RequestStatus.CANCELLED, closedAt: new Date() },
      include: { author: true },
    });

    for (const resp of responses) {
      this.notifications
        .sendToUser(resp.responderId, {
          title: 'Request cancelled',
          body: `${r.author.name ?? 'The author'} closed "${r.title}".`,
          data: { type: 'request_cancelled', requestId: r.id },
        })
        .catch(() => {});
    }
    return r;
  }

  // ─────────────────────────────────────────────
  //  REPLY  — seller responds with their product
  // ─────────────────────────────────────────────
  async reply(responderId: string, requestId: string, dto: ReplyRequestDto) {
    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
      include: { author: true, category: true },
    });
    if (!request) throw new NotFoundException();
    if (request.authorId === responderId) {
      throw new BadRequestException('You cannot reply to your own request');
    }
    if (request.status !== RequestStatus.OPEN) {
      throw new BadRequestException('Request is no longer open');
    }

    // Optional product ownership check
    if (dto.productId) {
      const p = await this.prisma.product.findUnique({
        where: { id: dto.productId },
      });
      if (!p || p.ownerId !== responderId) {
        throw new ForbiddenException('You can only reply with your own product');
      }
    }

    const reply = await this.prisma.requestResponse.create({
      data: {
        requestId,
        responderId,
        productId: dto.productId,
        message: dto.message,
        offeredPrice: dto.offeredPrice,
      },
      include: { responder: true, product: true },
    });

    // Notify request author
    this.notifications
      .sendToUser(request.authorId, {
        title: '💬 New reply to your request',
        body: `${reply.responder.name ?? 'Someone'} replied: "${dto.message.slice(0, 80)}"`,
        data: {
          type: 'request_reply',
          requestId,
          responseId: reply.id,
        },
      })
      .catch((e) => this.log.warn(`${e}`));

    return reply;
  }

  // ─────────────────────────────────────────────
  //  ACCEPT a reply (author chooses winner)
  // ─────────────────────────────────────────────
 async acceptReply(authorId: string, requestId: string, replyId: string) {
  await this._ensureAuthor(authorId, requestId);

  const reply = await this.prisma.requestResponse.findUnique({
    where: { id: replyId },
    include: { responder: true, product: true },
  });
  if (!reply || reply.requestId !== requestId) {
    throw new NotFoundException('Reply not found');
  }

  await this.prisma.$transaction(async (tx) => {
    await tx.request.update({
      where: { id: requestId },
      data: { status: RequestStatus.CLOSED, closedAt: new Date() },
    });
    await tx.requestResponse.update({
      where: { id: replyId },
      data: { status: ResponseStatus.ACCEPTED },
    });
    await tx.requestResponse.updateMany({
      where: {
        requestId,
        id: { not: replyId },
        status: ResponseStatus.PENDING,
      },
      data: { status: ResponseStatus.REJECTED },
    });
  });

  // Create a chat session (BarterOffer) so both sides can talk immediately
  let offerId: string | null = null;
  if (reply.productId) {
    const offer = await this.prisma.barterOffer.create({
      data: {
        senderId: reply.responderId,
        receiverId: authorId,
        offeredProductId: reply.productId,
        requestedProductId: reply.productId, // placeholder — swap for real ref if you have one
        message: reply.message,
        status: 'PENDING',
      },
    });
    offerId = offer.id;
  }

  this.notifications
    .sendToUser(reply.responderId, {
      title: '🎉 Your reply was accepted',
      body: 'The requester picked you — open the chat to finalize.',
      data: { type: 'request_reply_accepted', requestId, responseId: replyId },
    })
    .catch(() => {});

  const others = await this.prisma.requestResponse.findMany({
    where: { requestId, status: ResponseStatus.REJECTED },
  });
  for (const o of others) {
    this.notifications
      .sendToUser(o.responderId, {
        title: 'Request closed',
        body: 'The requester picked another response this time.',
        data: { type: 'request_reply_rejected', requestId },
      })
      .catch(() => {});
  }

  return {
    requestId,
    replyId,
    offerId,         // ← frontend uses this to open the chat
    status: 'CLOSED',
  };
}
  // ─────────────────────────────────────────────
  //  WITHDRAW my reply
  // ─────────────────────────────────────────────
  async withdrawReply(responderId: string, requestId: string, replyId: string) {
    const reply = await this.prisma.requestResponse.findUnique({
      where: { id: replyId },
    });
    if (!reply) throw new NotFoundException();
    if (reply.responderId !== responderId) throw new ForbiddenException();
    if (reply.status !== ResponseStatus.PENDING) {
      throw new BadRequestException('Reply already finalized');
    }
    return this.prisma.requestResponse.update({
      where: { id: replyId },
      data: { status: ResponseStatus.WITHDRAWN },
    });
  }

  private async _ensureAuthor(userId: string, requestId: string) {
    const r = await this.prisma.request.findUnique({ where: { id: requestId } });
    if (!r) throw new NotFoundException();
    if (r.authorId !== userId) throw new ForbiddenException();
    return r;
  }
}