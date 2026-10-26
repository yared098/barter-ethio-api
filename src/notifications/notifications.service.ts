import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>; // deep-link data: { offerId, productId, screen }
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sends a push notification to all of the user's devices.
   * Currently logs only — Firebase wiring is one function below.
   */
  async sendToUser(userId: string, payload: NotificationPayload): Promise<void> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true, platform: true },
    });

    if (!tokens.length) {
      this.logger.log(`[SKIP] user=${userId} has no device tokens`);
      return;
    }

    // 🔥 FIREBASE WIRING GOES HERE — replace the loop below with:
    //   await this.firebase.messaging().sendEachForMulticast({
    //     tokens: tokens.map(t => t.token),
    //     notification: { title: payload.title, body: payload.body },
    //     data: payload.data,
    //   });
    for (const t of tokens) {
      this.logger.log(
        `[PUSH→${t.platform}] user=${userId} | ${payload.title} | ${payload.body} | data=${JSON.stringify(payload.data ?? {})}`,
      );
    }
  }

  // ─── Typed helpers (call these from business logic) ───

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

  async offerCompleted(
    otherUserId: string,
    offerId: string,
    message: string,
  ) {
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