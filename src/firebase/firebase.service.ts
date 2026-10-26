import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp, App } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app: App | null = null;
  private _messaging: Messaging | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKeyRaw = this.config.get<string>('FIREBASE_PRIVATE_KEY');

    if (!projectId || !clientEmail || !privateKeyRaw) {
      this.logger.warn(
        '⚠️  Firebase env vars missing — push notifications disabled (logging only)',
      );
      return;
    }

    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

    try {
      if (getApps().length > 0) {
        this.app = getApps()[0];
      } else {
        this.app = initializeApp({
          credential: cert({ projectId, clientEmail, privateKey }),
        });
      }
      this._messaging = getMessaging(this.app);
      this.logger.log(`✅ Firebase Admin initialized for ${projectId}`);
    } catch (err) {
      this.logger.error(
        `❌ Firebase init failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  get isReady(): boolean {
    return this._messaging !== null;
  }

  get messaging(): Messaging | null {
    return this._messaging;
  }
}
