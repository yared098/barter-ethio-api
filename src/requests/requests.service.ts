// src/requests/requests.service.ts
import {
  BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import {
  RequestStatus, RequestType, ResponseStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { reservePostingQuota } from '../common/helpers/posting-limits';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { ReplyRequestDto } from './dto/reply-request.dto';
import { ListRequestsQueryDto } from './dto/list-requests-query.dto';
import { haversineKm } from '../common/utils/geo.util';

@Injectable()
export class RequestsService {
  private readonly log = new Logger('RequestsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─────────────────────────────────────────────
  //  CREATE
  // ─────────────────────────────────────────────
  async create(
    authorId: string,
    dto: CreateRequestDto,
    uploadedImages: string[] = [],   // ← NEW: paths returned by the controller
  ) {
    this._validateCoordinatePair(dto.latitude, dto.longitude, 'Request');

    if (dto.budgetMin != null && dto.budgetMax != null &&
        dto.budgetMin > dto.budgetMax) {
      throw new BadRequestException('budgetMin cannot exceed budgetMax');
    }

    // merge URL strings (JSON) + uploaded file paths (multipart)
    const images = [...(dto.images ?? []), ...uploadedImages];

    const request = await this.prisma.$transaction(async (tx) => {
      const postingStatus = await reservePostingQuota(tx, authorId);
      if (postingStatus.mode === 'FREE') {
        const openCount = await tx.request.count({
          where: { authorId, status: RequestStatus.OPEN },
        });
        if (openCount >= 1) {
          throw new BadRequestException(
            'FREE users can only have 1 open request at a time. ' +
            'Close or complete your existing request, or upgrade to a paid plan.',
          );
        }
      }

      return tx.request.create({
        data: {
          authorId,
          title: dto.title,
          description: dto.description,
          categoryId: dto.categoryId,
          images,
          specifications: dto.specifications ?? undefined,
          budgetMin: dto.budgetMin,
          budgetMax: dto.budgetMax,
          type: dto.type ?? RequestType.BUY,
          location: dto.location,
          latitude: dto.latitude,
          longitude: dto.longitude,
          isLocationRestricted: dto.isLocationRestricted ?? false,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        },
        include: {
          author: { select: { id: true, name: true, image: true } },
          category: true,
        },
      });
    });

    this._notifyMatchingSellers(request).catch((e) =>
      this.log.warn(`notify failed: ${e}`),
    );

    return request;
  }

  // ─────────────────────────────────────────────
  //  matching sellers (unchanged)
  // ─────────────────────────────────────────────
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
  async list(userId: string | undefined, q: ListRequestsQueryDto) {
    const where: any = {};

    if (!userId && (q.scope === 'mine' || q.scope === 'replies')) {
      throw new UnauthorizedException('Sign in to view your requests or replies');
    }

    if (q.scope === 'mine') where.authorId = userId;
    else if (q.scope === 'replies') where.responses = { some: { responderId: userId } };
    else where.status = RequestStatus.OPEN;

    if (userId && q.status) where.status = q.status;
    if (q.type)       where.type       = q.type;
    if (q.categoryId) where.categoryId = q.categoryId;

    const searchOr = q.q
      ? [
          { title:       { contains: q.q, mode: 'insensitive' } },
          { description: { contains: q.q, mode: 'insensitive' } },
        ]
      : null;

    const viewerLat    = q.lat    != null ? parseFloat(q.lat)    : NaN;
    const viewerLng    = q.lng    != null ? parseFloat(q.lng)    : NaN;
    const radiusKm     = q.radiusKm != null ? parseFloat(q.radiusKm) : 50;
    const locationName = q.location?.trim();

    this._validateCoordinatePair(
      q.lat == null ? undefined : viewerLat,
      q.lng == null ? undefined : viewerLng,
      'Viewer',
    );
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 500) {
      throw new BadRequestException('radiusKm must be greater than 0 and at most 500');
    }

    const hasGeo = q.lat != null && q.lng != null;
    const publicFeed = q.scope !== 'mine' && q.scope !== 'replies';
    const geoOr: any[] = [];

    if (publicFeed && hasGeo) {
      const latDelta = radiusKm / 111.0;
      const minLat = Math.max(-90, viewerLat - latDelta);
      const maxLat = Math.min(90, viewerLat + latDelta);
      const lngDelta = radiusKm /
        (111.0 * Math.cos((viewerLat * Math.PI) / 180));
      const nearby: any = {
        latitude: { gte: minLat, lte: maxLat },
      };

      if (lngDelta < 180 && minLat > -90 && maxLat < 90) {
        const minLng = viewerLng - lngDelta;
        const maxLng = viewerLng + lngDelta;
        if (minLng < -180) {
          nearby.OR = [
            { longitude: { gte: minLng + 360 } },
            { longitude: { lte: maxLng } },
          ];
        } else if (maxLng > 180) {
          nearby.OR = [
            { longitude: { gte: minLng } },
            { longitude: { lte: maxLng - 360 } },
          ];
        } else {
          nearby.longitude = { gte: minLng, lte: maxLng };
        }
      }

      geoOr.push(nearby, { latitude: null, longitude: null });
    } else if (publicFeed) {
      geoOr.push({ latitude: null, longitude: null });
    }

    const and: any[] = [];
    if (searchOr) and.push({ OR: searchOr });
    if (geoOr.length) and.push({ OR: geoOr });
    if (locationName) {
      and.push({
        OR: [
          { location: { equals: locationName, mode: 'insensitive' } },
          { location: null },
        ],
      });
    }
    if (and.length) where.AND = and;

    const page  = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 20));
    const skip  = (page - 1) * limit;

    let items: any[];
    let total: number;
    if (publicFeed && hasGeo) {
      const candidates = await this.prisma.request.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        select: { id: true, latitude: true, longitude: true },
      });
      const matchingIds = candidates
        .filter((request) =>
          request.latitude == null || request.longitude == null ||
          haversineKm(
            viewerLat,
            viewerLng,
            request.latitude,
            request.longitude,
          ) <= radiusKm,
        )
        .map((request) => request.id);

      total = matchingIds.length;
      const pageIds = matchingIds.slice(skip, skip + limit);
      const pageItems = pageIds.length
        ? await this.prisma.request.findMany({
            where: { id: { in: pageIds } },
            orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
            include: {
              author: { select: { id: true, name: true, image: true } },
              category: true,
              _count: { select: { responses: true } },
            },
          })
        : [];
      const itemsById = new Map(pageItems.map((request) => [request.id, request]));
      items = pageIds.map((id) => itemsById.get(id)).filter(Boolean);
    } else {
      [items, total] = await Promise.all([
        this.prisma.request.findMany({
          where,
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          include: {
            author: { select: { id: true, name: true, image: true } },
            category: true,
            _count: { select: { responses: true } },
          },
          skip,
          take: limit,
        }),
        this.prisma.request.count({ where }),
      ]);
    }

    /*
     * The exact-distance pass above runs before pagination so results and
     * pagination totals both reflect the requested circular radius.
     */
    const responseItems = userId
      ? items
      : items.map((request) => ({
          ...request,
          latitude: null,
          longitude: null,
        }));

    return {
      items: responseItems,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + items.length < total,
      },
      filter: {
        mode: hasGeo ? 'radius' : locationName ? 'city' : 'none',
        lat: hasGeo ? viewerLat : null,
        lng: hasGeo ? viewerLng : null,
        radiusKm: hasGeo ? radiusKm : null,
        city: locationName ?? null,
      },
    };
  }

  // ─────────────────────────────────────────────
  //  DETAIL
  // ─────────────────────────────────────────────
  async getDetail(id: string, viewerId?: string) {
    const r = await this.prisma.request.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, image: true } },
        category: true,
        responses: {
          include: {
            responder: { select: { id: true, name: true, image: true } },
            product: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!r) throw new NotFoundException('Request not found');
    if (!viewerId && r.status !== RequestStatus.OPEN) {
      throw new NotFoundException('Request not found');
    }

    const isAuthor = !!viewerId && r.authorId === viewerId;

    const responses = isAuthor
      ? r.responses
      : r.responses.filter((x) => x.responderId === viewerId);

    const canRespond = !isAuthor && r.status === 'OPEN' && responses.length === 0;
    const canAccept  = isAuthor && r.status === 'OPEN' && r.responses.length > 0;

    let myOfferId: string | null = null;
    if (viewerId && !isAuthor) {
      const myAcceptedReply = responses.find(
        (x) => x.responderId === viewerId && x.status === 'ACCEPTED',
      );
      if (myAcceptedReply) {
        const offer = await this.prisma.barterOffer.findFirst({
          where: {
            sourceType: 'REQUEST',
            sourceId: myAcceptedReply.id,
          },
          select: { id: true },
        });
        myOfferId = offer?.id ?? null;
      }
    }

    return {
      ...r,
      ...(viewerId ? {} : { latitude: null, longitude: null }),
      responses,
      isAuthor,
      canRespond,
      canAccept,
      myOfferId,
    };
  }

  // ─────────────────────────────────────────────
  //  UPDATE
  // ─────────────────────────────────────────────
  async update(authorId: string, id: string, dto: UpdateRequestDto) {
    const existing = await this._ensureAuthor(authorId, id);
    this._validateCoordinatePair(
      dto.latitude ?? existing.latitude ?? undefined,
      dto.longitude ?? existing.longitude ?? undefined,
      'Request',
    );
    return this.prisma.request.update({
      where: { id },
      data: {
        ...dto,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
  }

  // ─────────────────────────────────────────────
  //  CANCEL
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
  //  REPLY
  // ─────────────────────────────────────────────
  async reply(responderId: string, requestId: string, dto: ReplyRequestDto) {
    this._validateCoordinatePair(dto.viewerLat, dto.viewerLng, 'Viewer');

    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
      include: { author: true, category: true },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.authorId === responderId) {
      throw new BadRequestException('You cannot reply to your own request');
    }
    if (request.status !== RequestStatus.OPEN) {
      throw new BadRequestException('Request is no longer open');
    }

    if (request.latitude != null && request.longitude != null) {
      if (dto.viewerLat == null || dto.viewerLng == null) {
        throw new BadRequestException(
          'This request is limited to a specific area. ' +
          'Please enable location access to reply.',
        );
      }
      const maxKm = Math.min(200, Math.max(1, dto.maxDistanceKm ?? 50));
      const distKm = haversineKm(
        request.latitude, request.longitude,
        dto.viewerLat,   dto.viewerLng,
      );
      if (distKm > maxKm) {
        throw new BadRequestException(
          `You are ${distKm.toFixed(1)} km away from this request. ` +
          `Replies are limited to ${maxKm} km.`,
        );
      }
      this.log.debug(`[reply] geo OK — ${distKm.toFixed(2)} km (limit ${maxKm} km)`);
    } else if (request.location && dto.viewerLocation) {
      const reqCity  = request.location.trim().toLowerCase();
      const viewCity = dto.viewerLocation.trim().toLowerCase();
      if (reqCity !== viewCity) {
        throw new BadRequestException(
          `This request is limited to ${request.location}. ` +
          `You can only reply if you're in that area.`,
        );
      }
    }

    if (dto.productId) {
      const p = await this.prisma.product.findUnique({
        where: { id: dto.productId },
        select: { id: true, ownerId: true, status: true },
      });
      if (!p) throw new NotFoundException('Product not found');
      if (p.ownerId !== responderId) {
        throw new ForbiddenException('You can only reply with your own product');
      }
      if (p.status !== 'AVAILABLE') {
        throw new BadRequestException(
          `Your product is "${p.status}" — only AVAILABLE products can be offered.`,
        );
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
      include: {
        responder: { select: { id: true, name: true, image: true } },
        product: true,
      },
    });

    this.notifications
      .sendToUser(request.authorId, {
        title: '💬 New reply to your request',
        body: `${reply.responder.name ?? 'Someone'} replied: "${dto.message.slice(0, 80)}"`,
        data: { type: 'request_reply', requestId, responseId: reply.id },
      })
      .catch((e) => this.log.warn(`notify failed: ${e}`));

    return reply;
  }

  // ─────────────────────────────────────────────
  //  ACCEPT a reply
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

    const offerId: string = await this.prisma.$transaction(async (tx) => {
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

      const offer = await tx.barterOffer.create({
        data: {
          senderId: reply.responderId,
          receiverId: authorId,
          offeredProductId: reply.productId ?? null,
          requestedProductId: null,
          sourceType: 'REQUEST',
          sourceId: replyId,
          message: reply.message,
          status: 'PENDING',
        },
      });
      return offer.id;
    });

    this.notifications
      .sendToUser(reply.responderId, {
        title: '🎉 Your reply was accepted',
        body: 'Open the chat to finalize the deal.',
        data: {
          type: 'request_reply_accepted',
          requestId, responseId: replyId, offerId,
        },
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

    return { requestId, replyId, offerId, status: 'CLOSED' };
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

  private _validateCoordinatePair(
    latitude: number | undefined,
    longitude: number | undefined,
    label: string,
  ) {
    if ((latitude == null) !== (longitude == null)) {
      throw new BadRequestException(`${label} latitude and longitude must be provided together`);
    }
    if (latitude == null || longitude == null) return;
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new BadRequestException(`${label} coordinates are outside valid latitude/longitude ranges`);
    }
  }
}