import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ProductWantedDto {
  @IsString()
  categoryId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  keywords?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxValue?: number;
}

export class CreateProductDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  @Matches(/^(\/uploads\/|https?:\/\/)/, {
    each: true,
    message: 'images must be /uploads/... paths or http(s) URLs',
  })
  images?: string[];

  @IsEnum(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR'])
  condition!: 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR';

  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  estimatedValue!: number;

  @IsString()
  categoryId!: string;      // what I have

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ProductWantedDto)
  wants!: ProductWantedDto[];   // what I want
}