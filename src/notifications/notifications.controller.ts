import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

class RegisterTokenDto {
  @IsString()
  @MinLength(20)
  token!: string;

  @IsOptional()
  @IsIn(['ios', 'android', 'web'])
  platform?: 'ios' | 'android' | 'web';
}

class TestPushDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Post('register')
  register(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterTokenDto,
  ) {
    return this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      update: {
        userId,
        platform: dto.platform ?? 'android',
        lastUsedAt: new Date(),
      },
      create: {
        userId,
        token: dto.token,
        platform: dto.platform ?? 'android',
      },
    });
  }

  @Delete('unregister')
  async unregister(@Body() dto: { token: string }) {
    await this.prisma.deviceToken.deleteMany({ where: { token: dto.token } });
    return { ok: true };
  }

  /** Send test push to yourself — verifies FCM works end-to-end. */
  @Post('test')
  async test(
    @CurrentUser('id') userId: string,
    @Body() dto: TestPushDto,
  ) {
    await this.notifications.sendToUser(userId, {
      title: dto.title ?? '🚀 Test notification',
      body: dto.body ?? 'If you see this, FCM works!',
      data: { type: 'test' },
    });
    return { ok: true };
  }

  /** List all registered devices for the current user. */
  @Get('devices')
  async devices(@CurrentUser('id') userId: string) {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: {
        id: true,
        platform: true,
        token: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
    return {
      count: tokens.length,
      devices: tokens.map((t) => ({
        ...t,
        token: `${t.token.slice(0, 20)}...${t.token.slice(-10)}`,
      })),
    };
  }
}
