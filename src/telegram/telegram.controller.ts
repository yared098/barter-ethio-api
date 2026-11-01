import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  webhook(@Body() body: any) {
    return this.telegram.handleUpdate(body);
  }
}