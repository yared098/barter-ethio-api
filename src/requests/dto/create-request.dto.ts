// src/requests/dto/create-request.dto.ts
import {
  IsArray, IsDateString, IsEnum, IsNumber, IsObject, IsOptional, IsString,
  MinLength,
} from 'class-validator';
import { RequestType } from '@prisma/client';

export class CreateRequestDto {
  @IsString() @MinLength(3) title: string;
  @IsString() description: string;

  @IsString() categoryId: string;

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