import { IsBooleanString, IsIn, IsOptional, IsString } from 'class-validator';

export class ListProductsQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  wanted?: string;

  @IsOptional()
  @IsBooleanString()
  mine?: string;

  @IsOptional()
  @IsIn(['AVAILABLE', 'PENDING', 'SWAPPED'])
  status?: 'AVAILABLE' | 'PENDING' | 'SWAPPED';

  @IsOptional()
  @IsString()
  q?: string;
}
