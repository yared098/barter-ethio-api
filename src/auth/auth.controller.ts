import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GoogleLoginDto } from './dto/google-login.dto';
import { PasswordLoginDto } from './dto/password-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { TelegramLookupDto } from 'src/telegram/dto/telegram-lookup.dto';
import { TelegramLinkDto } from 'src/telegram/dto/telegram-link.dto';
import { TelegramWebAppLoginDto } from './dto/telegram-webapp-login.dto';
import { TelegramLinkCompleteDto } from './dto/telegram-link-complete.dto';
// import { TelegramLinkDto } from './dto/telegram-link.dto';
// import { TelegramLookupDto } from './dto/telegram-lookup.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  // ── email / password ──
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: PasswordLoginDto) {
    return this.auth.passwordLogin(dto.email, dto.password);
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  // ── google ──
  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  google(@Body() dto: GoogleLoginDto) {
    return this.auth.googleLogin(dto.idToken);
  }

  @Public()
  @Post('google-code')
  @HttpCode(HttpStatus.OK)
  googleCode(@Body() dto: { code: string; redirectUri: string }) {
    return this.auth.googleCodeLogin(dto.code, dto.redirectUri);
  }

  @Public()
  @Post('telegram/webapp')
  @HttpCode(HttpStatus.OK)
  telegramWebApp(@Body() dto: TelegramWebAppLoginDto) {
    return this.auth.telegramWebAppLogin(dto.initData);
  }

  @Post('telegram/link-code')
  createTelegramLinkCode(@CurrentUser('id') userId: string) {
    return this.auth.createTelegramLinkCode(userId);
  }

  // ⭐ passwordless telegram — guarded by shared secret
  // ⭐ bot lookup — silent auto-login by telegram ID only
  @Public()
  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  telegramLookup(
    @Body() dto: TelegramLookupDto,
    @Headers('x-bot-secret') botSecret: string,
  ) {
    const expected = this.config.get<string>('TELEGRAM_INTERNAL_SECRET');
    if (!expected || botSecret !== expected) {
      throw new UnauthorizedException('Invalid bot secret');
    }
    return this.auth.telegramLookup(dto.telegramId);
  }

  @Public()
  @Post('telegram/logout')
  @HttpCode(HttpStatus.OK)
  telegramLogout(
    @Body() dto: TelegramLookupDto,
    @Headers('x-bot-secret') botSecret: string,
  ) {
    const expected = this.config.get<string>('TELEGRAM_INTERNAL_SECRET');
    if (!expected || botSecret !== expected) {
      throw new UnauthorizedException('Invalid bot secret');
    }
    return this.auth.telegramLogout(dto.telegramId);
  }

  // ⭐ bot link — first-time only, requires email + password
  @Public()
  @Post('telegram/link')
  @HttpCode(HttpStatus.OK)
  telegramLink(
    @Body() dto: TelegramLinkDto,
    @Headers('x-bot-secret') botSecret: string,
  ) {
    const expected = this.config.get<string>('TELEGRAM_INTERNAL_SECRET');
    if (!expected || botSecret !== expected) {
      throw new UnauthorizedException('Invalid bot secret');
    }
    return this.auth.telegramLink(dto);
  }

  @Public()
  @Post('telegram/complete-link')
  @HttpCode(HttpStatus.OK)
  completeTelegramLink(
    @Body() dto: TelegramLinkCompleteDto,
    @Headers('x-bot-secret') botSecret: string,
  ) {
    const expected = this.config.get<string>('TELEGRAM_INTERNAL_SECRET');
    if (!expected || botSecret !== expected) {
      throw new UnauthorizedException('Invalid bot secret');
    }
    return this.auth.completeTelegramLink(dto);
  }
  // ── session ──
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser() user: any) {
    return this.auth.logout(user.id ?? user.userId ?? user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: any) {
    return this.auth.me(user.id ?? user.userId ?? user.sub);
  }
}