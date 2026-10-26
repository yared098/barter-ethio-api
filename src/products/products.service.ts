import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getEffectiveTier, tierLimits } from '../common/helpers/tier';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';

const INCLUDE = {
  category: true,
  owner: { select: { id: true, name: true, image: true } },
  wants: { include: { category: true } },
} as const;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListProductsQueryDto, currentUserId: string) {
    const where: any = { status: query.status ?? 'AVAILABLE' };

    if (query.mine === 'true') {
      where.ownerId = currentUserId;
      delete where.status;
    }
    if (query.category) where.category = { slug: query.category };
    if (query.wanted) where.wants = { some: { category: { slug: query.wanted } } };
    if (query.q) where.title = { contains: query.q, mode: 'insensitive' };

    return this.prisma.product.findMany({
      where,
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(ownerId: string, dto: CreateProductDto) {
    // 1. Tier gate
    const tier = await getEffectiveTier(this.prisma, ownerId);
    const limits = tierLimits(tier);
    const activeCount = await this.prisma.product.count({
      where: { ownerId, status: 'AVAILABLE' },
    });
    if (activeCount >= limits.maxActiveProducts) {
      throw new ForbiddenException({
        code: 'FREE_TIER_POST_LIMIT',
        message: `Free users can list up to ${limits.maxActiveProducts} active product(s). Upgrade to PRO for unlimited.`,
        tier,
        upgradeUrl: '/billing/upgrade',
      });
    }

    // 2. Validate categories exist
    const allCatIds = [dto.categoryId, ...dto.wants.map(w => w.categoryId)];
    const found = await this.prisma.category.findMany({
      where: { id: { in: allCatIds } },
      select: { id: true },
    });
    if (found.length !== new Set(allCatIds).size) {
      throw new NotFoundException('One or more categories do not exist');
    }

    // 3. Create product + wants in one transaction
    return this.prisma.product.create({
      data: {
        title: dto.title,
        description: dto.description,
        images: dto.images ?? [],
        condition: dto.condition,
        estimatedValue: dto.estimatedValue,
        categoryId: dto.categoryId,
        ownerId,
        wants: {
          create: dto.wants.map(w => ({
            categoryId: w.categoryId,
            keywords: w.keywords,
            minValue: w.minValue,
            maxValue: w.maxValue,
          })),
        },
      },
      include: INCLUDE,
    });
  }

  async update(id: string, userId: string, dto: UpdateProductDto) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');
    if (existing.ownerId !== userId) throw new ForbiddenException('Not your product');
    if (existing.status !== 'AVAILABLE') {
      throw new ForbiddenException(`Cannot edit product in status ${existing.status}`);
    }

    const { wants, ...scalarFields } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (wants) {
        await tx.productWanted.deleteMany({ where: { productId: id } });
      }
      return tx.product.update({
        where: { id },
        data: {
          ...scalarFields,
          ...(wants
            ? {
                wants: {
                  create: wants.map(w => ({
                    categoryId: w.categoryId,
                    keywords: w.keywords,
                    minValue: w.minValue,
                    maxValue: w.maxValue,
                  })),
                },
              }
            : {}),
        },
        include: INCLUDE,
      });
    });
  }

  async remove(id: string, userId: string) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');
    if (existing.ownerId !== userId) throw new ForbiddenException('Not your product');
    if (existing.status !== 'AVAILABLE') {
      throw new ForbiddenException('Cannot delete a product in a pending offer');
    }
    await this.prisma.product.delete({ where: { id } });
    return { ok: true };
  }
}