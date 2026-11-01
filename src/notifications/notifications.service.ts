import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';
import { TelegramNotifyService } from '../telegram/telegram-notify.service';

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
    @Optional()
    @Inject(TelegramNotifyService)
    private readonly telegram?: TelegramNotifyService,
  ) {}

  async sendToUser(userId: string, payload: NotificationPayload): Promise<void> {
    // ⭐ FIRE-AND-FORGET Telegram push — fires regardless of FCM tokens
    void this.telegram
      ?.sendToUser(userId, {
        title: payload.title,
        body: payload.body,
        actionUrl: payload.data?.actionUrl,
        actionLabel: payload.data?.actionLabel,
      })
      .catch((e) =>
        this.logger.warn(
          `[TELEGRAM-PUSH-FAIL] user=${userId}: ${(e as Error).message}`,
        ),
      );

    // ── existing FCM flow (unchanged) ────────────────────────────
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

  // ═══════════════════════════════════════════════════════════════
  // ⭐ UPDATED — chat / offer notifications now carry exact content
  // ═══════════════════════════════════════════════════════════════

  async aiMatchFound(
    userId: string,
    data: {
      productTitle: string;
      productId: string;
      ownerName: string;
      score: number;
      reason: string;
    },
  ) {
    const emoji = data.score >= 90 ? '🎯' : data.score >= 75 ? '⭐' : '🔔';
    await this.sendToUser(userId, {
      title: `${emoji} ${data.score}% match for you`,
      body: `${data.ownerName} posted "${data.productTitle}" — ${data.reason}`,
      data: {
        type: 'match.found',
        productId: data.productId,
        screen: 'product-detail',
      },
    });
  }

  // ⭐ NEW — full message text in the notification
  async offerReceived(
    receiverId: string,
    senderName: string,
    productTitle: string,
    offerId: string,
    offerMessage?: string,
  ) {
    // trim to keep Telegram readable; long messages get cut with …
    const snippet = offerMessage
      ? offerMessage.length > 200
        ? `${offerMessage.slice(0, 200)}…`
        : offerMessage
      : null;

    const body = snippet
      ? `"${snippet}"\n\n— ${senderName} wants to trade for your "${productTitle}"`
      : `${senderName} wants to trade for your "${productTitle}"`;

    await this.sendToUser(receiverId, {
      title: 'New barter offer',
      body,
      data: {
        type: 'offer.received',
        offerId,
        screen: 'offer-detail',
        // ⭐ optional deep link — only works if your app registers the scheme
        actionUrl: `barterethio://offer/${offerId}`,
        actionLabel: '💬 Open offer',
      },
    });
  }

  async offerAccepted(senderId: string, receiverName: string, offerId: string) {
    await this.sendToUser(senderId, {
      title: 'Offer accepted 🎉',
      body: `${receiverName} accepted your barter offer — time to chat and finalize the swap.`,
      data: {
        type: 'offer.accepted',
        offerId,
        screen: 'offer-detail',
        actionUrl: `barterethio://offer/${offerId}`,
        actionLabel: '💬 Open chat',
      },
    });
  }

  async offerDeclined(senderId: string, receiverName: string, offerId: string) {
    await this.sendToUser(senderId, {
      title: 'Offer declined',
      body: `${receiverName} declined your offer. You can try another item or send a new offer.`,
      data: { type: 'offer.declined', offerId, screen: 'offer-detail' },
    });
  }

  async offerCancelled(receiverId: string, senderName: string, offerId: string) {
    await this.sendToUser(receiverId, {
      title: 'Offer cancelled',
      body: `${senderName} cancelled their offer.`,
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

  // ⭐⭐ THE MAIN FIX — chat notification now shows the exact message
    async newMessage(
    recipientId: string,
    senderName: string,
    offerId: string,
    messageContent: string,
  ) {
    const trimmed =
      messageContent.length > 300
        ? `${messageContent.slice(0, 300)}…`
        : messageContent;

    await this.sendToUser(recipientId, {
      title: `💬 ${senderName}`,
      body: `"${trimmed}"`,
      data: {
        type: 'offer.message',
        offerId,
        screen: 'offer-chat',
        // for mobile app (ignored by Telegram)
        actionUrl: `barterethio://offer/${offerId}`,
        // for Telegram — falls back to a web link if app scheme exists
        webUrl: `https://api.smrestaurant.com/api/v1/offers/${offerId}`,
        actionLabel: '💬 Open offer',
      },
    });
  }
}