import { IsOptional, IsString, MinLength } from 'class-validator';

export class TelegramAuthDto {
  @IsString()
  @MinLength(1)
  telegramId: string;

  @IsOptional()
  @IsString()
  telegramUsername?: string;

  @IsOptional()
  @IsString()
  telegramName?: string;
}