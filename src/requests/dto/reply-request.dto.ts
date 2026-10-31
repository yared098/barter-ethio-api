// src/requests/dto/reply-request.dto.ts
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class ReplyRequestDto {
  @IsString()
  @MinLength(1)
  message: string;

  @IsOptional() @IsString()
  productId?: string;

  @IsOptional() @Type(() => Number) @IsNumber()
  offeredPrice?: number;

  // ── Geo gate (required only when the request has coords) ──
  @IsOptional() @Type(() => Number) @IsNumber()
  viewerLat?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  viewerLng?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  maxDistanceKm?: number;

  // ── City-name fallback (when the request only has `location`) ──
  @IsOptional() @IsString()
  viewerLocation?: string;
}