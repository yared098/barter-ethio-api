import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getEffectiveTier } from '../common/helpers/tier';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateTierDto } from './dto/update-tier.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

const PUBLIC_SELECT = {
  id: true,
  name: true,
  image: true,
  createdAt: true,
  _count: { select: { products: true } },
} as const;

const PRIVATE_SELECT = {
  id: true,
  email: true,
  name: true,
  image: true,
  role: true,
  tier: true,
  proExpiresAt: true,
  isActive: true,
  googleId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { products: true, sentOffers: true, receivedOffers: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Self ───

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PRIVATE_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');

    const effectiveTier = await getEffectiveTier(this.prisma, userId);

    return {
      ...user,
      effectiveTier,
      isExpired:
        user.tier === 'PRO' &&
        !!user.proExpiresAt &&
        user.proExpiresAt < new Date(),
    };
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: PRIVATE_SELECT,
    });
  }

  async deactivateMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'ADMIN') {
      throw new ForbiddenException('Admins cannot self-deactivate — ask another admin');
    }

    // Soft-delete: keep data, mark inactive, revoke all refresh tokens
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { isActive: false },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    // Unlock any PENDING products so they don't get stuck
    await this.prisma.product.updateMany({
      where: { ownerId: userId, status: 'PENDING' },
      data: { status: 'AVAILABLE' },
    });

    return { ok: true };
  }

  // ─── Public profile ───

  async getPublicProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...PUBLIC_SELECT, isActive: true },
    });
    if (!user || !user.isActive) throw new NotFoundException('User not found');

    const { isActive: _, ...safe } = user;
    return safe;
  }

  async getUserProducts(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new NotFoundException('User not found');

    return this.prisma.product.findMany({
      where: { ownerId: userId, status: 'AVAILABLE' },
      include: {
        category: true,
        wants: { include: { category: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ─── Admin ───

  async listUsers(query: ListUsersQueryDto) {
    const where: any = {};

    if (query.role) where.role = query.role;
    if (query.tier) where.tier = query.tier;
    if (query.q) {
      where.OR = [
        { email: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const page = query.page ?? 0;
    const limit = query.limit ?? 20;

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: PRIVATE_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: page * limit,
        take: limit,
      }),
    ]);

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateTier(userId: string, dto: UpdateTierDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.tier === 'FREE') {
      return this.prisma.user.update({
        where: { id: userId },
        data: { tier: 'FREE', proExpiresAt: null },
        select: PRIVATE_SELECT,
      });
    }

    const proExpiresAt = dto.durationDays
      ? new Date(Date.now() + dto.durationDays * 24 * 60 * 60 * 1000)
      : null;

    return this.prisma.user.update({
      where: { id: userId },
      data: { tier: 'PRO', proExpiresAt },
      select: PRIVATE_SELECT,
    });
  }

  async updateRole(userId: string, dto: UpdateRoleDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id: userId },
      data: { role: dto.role },
      select: PRIVATE_SELECT,
    });
  }

  async updateStatus(userId: string, dto: UpdateStatusDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: dto.isActive },
      select: PRIVATE_SELECT,
    });

    // If deactivating, revoke refresh tokens immediately
    if (!dto.isActive) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return updated;
  }
}