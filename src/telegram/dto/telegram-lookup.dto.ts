import { IsString, MinLength } from 'class-validator';

export class TelegramLookupDto {
  @IsString()
  @MinLength(1)
  telegramId: string;
}