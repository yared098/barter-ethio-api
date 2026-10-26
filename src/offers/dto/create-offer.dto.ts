import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOfferDto {
  @IsString()
  offeredProductId!: string;

  @IsString()
  requestedProductId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}