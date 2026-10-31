// src/requests/dto/list-requests-query.dto.ts
import {
  IsEnum, IsInt, IsNumberString, IsOptional, IsString, Max, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RequestStatus, RequestType } from '@prisma/client';

export class ListRequestsQueryDto {
  @IsOptional() @IsEnum(RequestStatus) status?: RequestStatus;
  @IsOptional() @IsEnum(RequestType)   type?: RequestType;

  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() location?: string;

  // ⭐ geo (query params are strings → service does parseFloat)
  @IsOptional() @IsNumberString() lat?: string;
  @IsOptional() @IsNumberString() lng?: string;
  @IsOptional() @IsNumberString() radiusKm?: string;

  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number) limit?: number;

  @IsOptional() @IsString() scope?: 'all' | 'mine' | 'replies';
}