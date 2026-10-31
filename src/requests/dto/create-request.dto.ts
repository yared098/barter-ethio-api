// src/requests/dto/create-request.dto.ts
import {
  IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsObject,
  IsOptional, IsString, MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { RequestType } from '@prisma/client';

export class CreateRequestDto {
  @IsString() @MinLength(3) title: string;
  @IsString() description: string;
  @IsString() categoryId: string;

  // URL‑based images (JSON body). File uploads use the multipart
  // field `images` → handled by FilesInterceptor, merged server‑side.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  // form‑data sends JSON string → parse it
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return undefined; }
    }
    return value;
  })
  @IsObject()
  specifications?: Record<string, string | number>;

  @IsOptional() @Type(() => Number) @IsNumber() budgetMin?: number;
  @IsOptional() @Type(() => Number) @IsNumber() budgetMax?: number;

  @IsOptional() @IsEnum(RequestType) type?: RequestType;

  @IsOptional() @IsString() location?: string;
  @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;

  // ⭐ NEW — poster opts in to location‑gated replies
  // optional + tolerant of form‑data string "true" / "false"
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === true  || value === 'true')  return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isLocationRestricted?: boolean;

  @IsOptional() @IsDateString() expiresAt?: string;
}