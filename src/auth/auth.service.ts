import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from './google.service';
import { TokenService } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleService,
    private readonly tokens: TokenService,
  ) {}

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

}