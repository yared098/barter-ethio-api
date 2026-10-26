import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
  ) {}

  async sendToUser(userId: string, payload: NotificationPayload): Promise<void> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true, platform: true },
    });

    if (!tokens.length) {
      this.logger.debug(`[SKIP] user=${userId} has no device tokens`);
      return;
    }

    const tokenStrings = tokens.map((t) => t.token);

    if (!this.firebase.isReady || !this.firebase.messaging) {
      this.logger.log(
        `[DRY-RUN] user=${userId} tokens=${tokens.length} | "${payload.title}" — ${payload.body}`,
      );
      return;
    }

    try {
      const response = await this.firebase.messaging.sendEachForMulticast({
        tokens: tokenStrings,
        notification: { title: payload.title, body: payload.body },
        data: payload.data,
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default' } } },
      });

      this.logger.log(
        `[PUSH] user=${userId} success=${response.successCount}/${tokenStrings.length} | "${payload.title}"`,
      );

      if (response.failureCount > 0) {
        const deadTokens: string[] = [];
        response.responses.forEach((r, i) => {
          if (!r.success) {
            const code = r.error?.code;
            if (
              code === 'messaging/invalid-registration-token' ||
              code === 'messaging/registration-token-not-registered'
            ) {
              deadTokens.push(tokenStrings[i]);
            } else {
              this.logger.warn(
                `[PUSH-FAIL] token=${tokenStrings[i].slice(0, 12)}... code=${code}`,
              );
            }
          }
        });

        if (deadTokens.length > 0) {
          await this.prisma.deviceToken.deleteMany({
            where: { token: { in: deadTokens } },
          });
          this.logger.log(
            `[CLEANUP] removed ${deadTokens.length} dead token(s) for user=${userId}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `[PUSH-ERROR] user=${userId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  async offerReceived(
    receiverId: string,
    senderName: string,
    productTitle: string,
    offerId: string,
  ) {
    await this.sendToUser(receiverId, {
      title: 'New barter offer',
      body: `${senderName} wants to trade for your "${productTitle}"`,
      data: { type: 'offer.received', offerId, screen: 'offer-detail' },
    });
  }

  async offerAccepted(senderId: string, receiverName: string, offerId: string) {
    await this.sendToUser(senderId, {
      title: 'Offer accepted 🎉',
      body: `${receiverName} accepted your barter offer`,
      data: { type: 'offer.accepted', offerId, screen: 'offer-detail' },
    });
  }

  async offerDeclined(senderId: string, receiverName: string, offerId: string) {
    await this.sendToUser(senderId, {
      title: 'Offer declined',
      body: `${receiverName} declined your offer`,
      data: { type: 'offer.declined', offerId, screen: 'offer-detail' },
    });
  }

  async offerCancelled(receiverId: string, senderName: string, offerId: string) {
    await this.sendToUser(receiverId, {
      title: 'Offer cancelled',
      body: `${senderName} cancelled their offer`,
      data: { type: 'offer.cancelled', offerId, screen: 'offer-detail' },
    });
  }

  async offerCompleted(otherUserId: string, offerId: string, message: string) {
    await this.sendToUser(otherUserId, {
      title: 'Swap complete ✅',
      body: message,
      data: { type: 'offer.completed', offerId, screen: 'offer-detail' },
    });
  }

  async newMessage(recipientId: string, senderName: string, offerId: string) {
    await this.sendToUser(recipientId, {
      title: `New message from ${senderName}`,
      body: 'Tap to open the conversation',
      data: { type: 'offer.message', offerId, screen: 'offer-chat' },
    });
  }
}
