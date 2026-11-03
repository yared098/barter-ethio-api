import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class TelegramLinkCompleteDto {
  @IsString()
  @Matches(/^[A-F0-9]{16}$/)
  code!: string;

  @IsString()
  @Matches(/^\d{1,20}$/)
  telegramId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  telegramUsername?: string;
}
