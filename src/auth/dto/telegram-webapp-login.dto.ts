import { IsString, MaxLength, MinLength } from 'class-validator';

export class TelegramWebAppLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8192)
  initData!: string;
}
