import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { IsIn, IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

class RegisterTokenDto {
  @IsString()
  @MinLength(20)
  token!: string;

  @IsIn(['ios', 'android', 'web'])
  platform!: 'ios' | 'android' | 'web';
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('register')
  register(@CurrentUser('id') userId: string, @Body() dto: RegisterTokenDto) {
    return this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      update: { userId, platform: dto.platform, lastUsedAt: new Date() },
      create: { userId, token: dto.token, platform: dto.platform },
    });
  }

  @Delete('unregister')
  async unregister(@Body() dto: { token: string }) {
    await this.prisma.deviceToken.deleteMany({ where: { token: dto.token } });
    return { ok: true };
  }
}