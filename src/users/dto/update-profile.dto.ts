import { IsOptional, IsString, MaxLength, MinLength, Matches } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^(\/uploads\/|https?:\/\/)/, {
    message: 'image must be /uploads/... or http(s) URL',
  })
  image?: string;
}