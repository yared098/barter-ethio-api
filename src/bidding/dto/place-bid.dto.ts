import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class PlaceBidDto {
  @IsOptional() @IsNumber() @Min(1) amount?: number;
  @IsOptional() @IsString() offeredProductId?: string;
  @IsOptional() @IsString() message?: string;
}
