import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name?: string;
  image?: string;
}

export interface GoogleCodeTokens {
  idToken: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);
  private readonly client: OAuth2Client;
  private readonly audience: string;
  private readonly config: ConfigService;   // ← the missing field

  constructor(config: ConfigService) {
    this.config = config;
    this.audience = config.get<string>('GOOGLE_CLIENT_ID') ?? '';
    this.client = new OAuth2Client(this.audience);

    if (!this.audience) {
      this.logger.warn(
        '⚠️  GOOGLE_CLIENT_ID not set — Google login will fail',
      );
    }
  }

  // ═══════════════════════════════════════════════
  //  MOBILE FLOW — verify ID token from google_sign_in
  // ═══════════════════════════════════════════════

  async verifyIdToken(idToken: string): Promise<GoogleProfile> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.audience,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email) {
        throw new UnauthorizedException('Invalid Google token payload');
      }
      return {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        image: payload.picture,
      };
    } catch (err) {
      this.logger.warn(
        `Google token verify failed: ${(err as Error).message}`,
      );
      throw new UnauthorizedException('Invalid Google token');
    }
  }

  // ═══════════════════════════════════════════════
  //  WEB FLOW — exchange OAuth code for tokens
  //  (only used if you add /auth/google-code endpoint)
  // ═══════════════════════════════════════════════

  async exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<GoogleCodeTokens> {
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    if (!clientSecret) {
      throw new UnauthorizedException(
        'GOOGLE_CLIENT_SECRET not configured — code exchange unavailable',
      );
    }

    try {
      const codeClient = new OAuth2Client({
        clientId: this.audience,
        clientSecret,
        redirectUri,
      });

      const { tokens } = await codeClient.getToken(code);

      if (!tokens.id_token) {
        throw new UnauthorizedException(
          'Google did not return an ID token',
        );
      }

      return {
        idToken: tokens.id_token,
        accessToken: tokens.access_token ?? undefined,
        refreshToken: tokens.refresh_token ?? undefined,
        expiresIn: tokens.expiry_date
          ? Math.round((tokens.expiry_date - Date.now()) / 1000)
          : undefined,
      };
    } catch (err) {
      this.logger.warn(
        `Google code exchange failed: ${(err as Error).message}`,
      );
      throw new UnauthorizedException('Invalid authorization code');
    }
  }

  // ═══════════════════════════════════════════════
  //  Utility — get the audience (Web Client ID)
  // ═══════════════════════════════════════════════

  getAudience(): string {
    return this.audience;
  }

  isConfigured(): boolean {
    return !!this.audience;
  }
}