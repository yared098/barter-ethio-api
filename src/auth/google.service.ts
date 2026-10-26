import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name?: string;
  image?: string;
}

@Injectable()
export class GoogleService {
  private readonly client: OAuth2Client;
  private readonly audience: string;

  constructor(config: ConfigService) {
    this.audience = config.get<string>('GOOGLE_CLIENT_ID') ?? '';
    this.client = new OAuth2Client(this.audience);
  }

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
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }
  }
}