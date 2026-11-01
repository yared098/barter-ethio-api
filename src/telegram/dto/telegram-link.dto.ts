import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class TelegramLinkDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @MinLength(1)
  telegramId: string;

  @IsOptional()
  @IsString()
  telegramUsername?: string;
}