// src/requests/dto/update-request.dto.ts
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { RequestType } from '@prisma/client';

export class UpdateRequestDto {
  @IsOptional() @IsString() @MinLength(3) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() categoryId?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) images?: string[];

  @IsOptional() @IsObject() specifications?: Record<string, string | number>;

  @IsOptional() @IsNumber() budgetMin?: number;
  @IsOptional() @IsNumber() budgetMax?: number;

  @IsOptional() @IsEnum(RequestType) type?: RequestType;

  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;

  @IsOptional() @IsDateString() expiresAt?: string;
}