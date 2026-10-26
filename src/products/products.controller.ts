import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  // ─── Public: single product detail ───
  // Declared BEFORE @Get() and @Get(':id') routes below
  // so /products/:id always matches correctly.

  // ─── List (auth required, supports ?mine=true) ───
  @Get()
  findAll(
    @Query() query: ListProductsQueryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.products.findAll(query, userId);
  }

  // ─── Public: product detail ───
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.products.findOne(id);
  }

  // ─── Create (tier limit enforced in service) ───
  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateProductDto) {
    return this.products.create(userId, dto);
  }

  // ─── Update (owner only) ───
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(id, userId, dto);
  }

  // ─── Delete (owner only, AVAILABLE only) ───
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.products.remove(id, userId);
  }
}
