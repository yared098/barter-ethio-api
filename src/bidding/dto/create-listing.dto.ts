import {
  IsEnum, IsNumber, IsOptional, IsString, IsDateString, Min,
} from 'class-validator';
import { BidType } from '@prisma/client';

export class CreateListingDto {
  @IsString() productId!: string;

  @IsEnum(BidType) type!: BidType;

  @IsOptional() @IsNumber() @Min(0) startingBid?: number;
  @IsOptional() @IsNumber() @Min(0) minIncrement?: number;
  @IsOptional() @IsNumber() @Min(0) buyNowPrice?: number;
  @IsOptional() @IsNumber() @Min(0) reservePrice?: number;

  @IsDateString() endsAt!: string;
}
