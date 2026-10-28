// src/requests/dto/list-requests-query.dto.ts
import { IsEnum, IsOptional, IsString, IsNumberString } from 'class-validator';
import { RequestStatus, RequestType } from '@prisma/client';

export class ListRequestsQueryDto {
  @IsOptional() @IsEnum(RequestStatus) status?: RequestStatus;
  @IsOptional() @IsEnum(RequestType) type?: RequestType;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsNumberString() lat?: string;
  @IsOptional() @IsNumberString() lng?: string;
  @IsOptional() @IsNumberString() radiusKm?: string;
  @IsOptional() @IsString() scope?: 'all' | 'mine' | 'replies';
}