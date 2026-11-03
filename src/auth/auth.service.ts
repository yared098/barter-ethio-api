import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from './google.service';
import { TokenService } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // GOOGLE
  // ═══════════════════════════════════════════════════════════
  async googleLogin(idToken: string) {
    const profile = await this.google.verifyIdToken(idToken);

    let user = await this.prisma.user.findFirst({
      where: {
        OR: [{ googleId: profile.googleId }, { email: profile.email }],
      },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          image: profile.image,
          googleId: profile.googleId,
        },
      });
    } else if (!user.googleId) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: profile.googleId,
          image: user.image ?? profile.image,
        },
      });
    }

    if (!user.isActive) throw new UnauthorizedException('Account is disabled');

    const tokens = await this.tokens.issue(user.id, user.role);
    return { user: this.sanitize(user), ...tokens };
  }

  async googleCodeLogin(code: string, redirectUri: string) {
    const { idToken } = await this.google.exchangeCode(code, redirectUri);
    return this.googleLogin(idToken);
  }

  // ═══════════════════════════════════════════════════════════
  // EMAIL / PASSWORD
  // ═══════════════════════════════════════════════════════════
  async passwordLogin(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('Account is disabled');

    const tokens = await this.tokens.issue(user.id, user.role);
    return { user: this.sanitize(user), ...tokens };
  }

  async register(dto: { email: string; password: string; name?: string }) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: dto.name?.trim() || email.split('@')[0],
      },
    });

    const tokens = await this.tokens.issue(user.id, user.role);
    return { user: this.sanitize(user), ...tokens };
  }

  // ═══════════════════════════════════════════════════════════
  // TELEGRAM — passwordless, auto-create or auto-login
  // ═══════════════════════════════════════════════════════════
  async telegramAuth(dto: {
    telegramId: string;
    telegramUsername?: string;
    telegramName?: string;
  }) {
    const telegramId = dto.telegramId.trim();
    const telegramUsername = dto.telegramUsername?.trim() || null;
    const telegramName = dto.telegramName?.trim() || null;

    // 1. existing user by telegram link
    let user = await this.prisma.user.findUnique({
      where: { telegramChatId: telegramId },
    });

    // 2. new user — auto-create with synthetic email + random password
    if (!user) {
      const syntheticEmail = `tg_${telegramId}@telegram.barterethio.com`;

      // edge case: synthetic email already exists (previous attempt / orphan)
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email: syntheticEmail },
      });

      if (existingByEmail) {
        user = await this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            telegramChatId: telegramId,
            telegramUsername,
            telegramLinkedAt: new Date(),
          },
        });
      } else {
        const randomPassword = crypto.randomBytes(32).toString('hex');
        const passwordHash = await bcrypt.hash(randomPassword, 10);

        user = await this.prisma.user.create({
          data: {
            email: syntheticEmail,
            passwordHash,
            name:
              telegramName ||
              (telegramUsername ? `@${telegramUsername}` : `Telegram User`),
            telegramChatId: telegramId,
            telegramUsername,
            telegramLinkedAt: new Date(),
          },
        });
      }
    } else {
      // 3. existing — refresh username if changed on Telegram side
      if (telegramUsername && telegramUsername !== user.telegramUsername) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { telegramUsername },
        });
      }
    }

    if (!user.isActive) throw new UnauthorizedException('Account is disabled');

    const tokens = await this.tokens.issue(user.id, user.role);
    return { user: this.sanitize(user), ...tokens };
  }

  async telegramWebAppLogin(initData: string) {
    const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim();
    if (!botToken) {
      throw new UnauthorizedException('Telegram Web App login is unavailable');
    }

    const params = new URLSearchParams(initData);
    const receivedHash = params.get('hash');
    if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
      throw new UnauthorizedException('Invalid Telegram Web App data');
    }

    const dataCheckString = [...params.entries()]
      .filter(([key]) => key !== 'hash')
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest();
    const suppliedHash = Buffer.from(receivedHash, 'hex');

    if (
      suppliedHash.length !== expectedHash.length ||
      !crypto.timingSafeEqual(suppliedHash, expectedHash)
    ) {
      throw new UnauthorizedException('Invalid Telegram Web App signature');
    }

    const authDate = Number(params.get('auth_date'));
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      !Number.isSafeInteger(authDate) ||
      authDate > nowSeconds + 60 ||
      nowSeconds - authDate > 60 * 60
    ) {
      throw new UnauthorizedException('Telegram Web App data has expired');
    }

    let telegramUser: { id?: number | string };
    try {
      telegramUser = JSON.parse(params.get('user') ?? '');
    } catch {
      throw new UnauthorizedException('Invalid Telegram user data');
    }
    if (
      (typeof telegramUser.id !== 'number' &&
        typeof telegramUser.id !== 'string') ||
      !/^\d+$/.test(String(telegramUser.id))
    ) {
      throw new UnauthorizedException('Invalid Telegram user data');
    }

    const user = await this.prisma.user.findUnique({
      where: { telegramChatId: String(telegramUser.id) },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'Link your Telegram account to Barter Ethio before opening chats',
      );
    }

    const tokens = await this.tokens.issue(user.id, user.role);
    return { user: this.sanitize(user), ...tokens };
  }

  // ═══════════════════════════════════════════════════════════
  // SESSION
  // ═══════════════════════════════════════════════════════════
  refresh(refreshToken: string) {
    return this.tokens.rotate(refreshToken);
  }

  async logout(userId: string) {
    await this.tokens.revokeAll(userId);
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    return this.sanitize(user);
  }

  private sanitize<T extends { passwordHash?: string | null }>(user: T) {
    const { passwordHash: _omit, ...safe } = user;
    return safe;
  }
    // ⭐ lookup only — used on every /start and every message
  async telegramLookup(telegramId: string) {
    const user = await this.prisma.user.findUnique({
      where: { telegramChatId: telegramId },
    });
    if (!user) {
      throw new UnauthorizedException('Telegram not linked');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    const accessToken = await this.tokens.issueAccessToken(user.id, user.role);
    return { user: this.sanitize(user), accessToken };
  }

  // ⭐ first-time only — validates password, links telegram to that user
  async telegramLink(dto: {
    email: string;
    password: string;
    telegramId: string;
    telegramUsername?: string;
  }) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    // if this user is already linked to a DIFFERENT telegram id → reject
    if (
      user.telegramChatId &&
      user.telegramChatId !== dto.telegramId
    ) {
      throw new ConflictException(
        'This account is linked to another Telegram user. Log out from that one first.',
      );
    }

    // if another user is already linked to this telegram id → reject
    const clash = await this.prisma.user.findUnique({
      where: { telegramChatId: dto.telegramId },
    });
    if (clash && clash.id !== user.id) {
      throw new ConflictException(
        'This Telegram account is already linked to another Barter user.',
      );
    }

    // link
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        telegramChatId: dto.telegramId,
        telegramUsername: dto.telegramUsername ?? null,
        telegramLinkedAt: new Date(),
      },
    });

    const accessToken = await this.tokens.issueAccessToken(updated.id, updated.role);
    return { user: this.sanitize(updated), accessToken };
  }
}