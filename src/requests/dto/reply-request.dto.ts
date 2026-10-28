// src/requests/dto/reply-request.dto.ts
import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class ReplyRequestDto {
  @IsString() @MinLength(1) message: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsNumber() offeredPrice?: number;
}