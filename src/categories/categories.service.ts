import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { products: true, wanted: true } },
      },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: { select: { products: true, wanted: true } },
      },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async create(dto: CreateCategoryDto) {
    const exists = await this.prisma.category.findUnique({
      where: { slug: dto.slug },
    });
    if (exists) {
      throw new ConflictException(`Category with slug "${dto.slug}" already exists`);
    }
    return this.prisma.category.create({ data: dto });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);
    if (dto.slug) {
      const clash = await this.prisma.category.findFirst({
        where: { slug: dto.slug, NOT: { id } },
      });
      if (clash) {
        throw new ConflictException(`Category with slug "${dto.slug}" already exists`);
      }
    }
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    const counts = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true, wanted: true } } },
    });
    if (counts && (counts._count.products > 0 || counts._count.wanted > 0)) {
      throw new ConflictException(
        'Cannot delete category that still has products or product wants',
      );
    }
    await this.prisma.category.delete({ where: { id } });
    return { ok: true };
  }
}
