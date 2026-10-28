import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ListingStatus } from '@prisma/client';

export class ListListingsQueryDto {
  @IsOptional() @IsEnum(ListingStatus) status?: ListingStatus;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() scope?: 'all' | 'mine' | 'bidding' | 'won';
}
