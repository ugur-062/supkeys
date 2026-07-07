import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@rothern/db";
import type { EmailEventType, EmailStatus } from "@rothern/db";
import { PrismaService } from "../../../common/prisma/prisma.service";

/**
 * Resend webhook payload shape.
 * https://resend.com/docs/dashboard/webhooks/event-types
 */
export interface ResendWebhookEvent {
  type: string; // "email.delivered" | "email.opened" | ...
  created_at: string;
  data: {
    email_id: string;
    from?: string;
    to?: string[] | string;
    subject?: string;
    bounce?: {
      type?: "hard" | "soft" | "undetermined";
      reason?: string | null;
      message?: string | null;
    };
    click?: {
      ipAddress?: string;
      link?: string;
      timestamp?: string;
      userAgent?: string;
    };
  };
}

export type HandleEventResult =
  | { status: "skipped"; reason: "duplicate_event" | "email_log_not_found" | "unknown_type"; eventId?: string }
  | { status: "processed"; emailLogId: string; eventType: EmailEventType };

/**
 * V2-1 — Resend webhook event işleyici.
 *
 * Idempotency: aynı `eventId` (svix-id) iki kez gelirse skip.
 * Status precedence: `canTransitionTo` ile EmailLog status'u sadece
 * "ileri" yönde güncellenir. BOUNCED → DELIVERED'a geri düşmez.
 */
@Injectable()
export class ResendEventService {
  private readonly logger = new Logger(ResendEventService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleEvent(
    event: ResendWebhookEvent,
    eventId: string,
  ): Promise<HandleEventResult> {
    // 1) Idempotency
    const existing = await this.prisma.emailEvent.findUnique({
      where: { eventId },
    });
    if (existing) {
      this.logger.log(`Event ${eventId} zaten işlenmiş, atlandı`);
      return { status: "skipped", reason: "duplicate_event", eventId };
    }

    // 2) EmailLog lookup
    const providerMessageId = event.data.email_id;
    const emailLog = await this.prisma.emailLog.findUnique({
      where: { providerMessageId },
    });
    if (!emailLog) {
      this.logger.warn(
        `EmailLog bulunamadı providerMessageId=${providerMessageId} (event ${eventId})`,
      );
      return {
        status: "skipped",
        reason: "email_log_not_found",
        eventId,
      };
    }

    // 3) Event type → enum
    const eventType = this.mapEventType(event.type);
    if (!eventType) {
      this.logger.warn(`Bilinmeyen event type: ${event.type}`);
      return { status: "skipped", reason: "unknown_type", eventId };
    }

    // 4) Atomic — EmailEvent + EmailLog update
    return this.prisma.$transaction(async (tx) => {
      await tx.emailEvent.create({
        data: {
          eventId,
          emailLogId: emailLog.id,
          eventType,
          occurredAt: new Date(event.created_at),
          payload: event as unknown as Prisma.InputJsonValue,
          clickedUrl: event.data.click?.link ?? null,
          bounceType: event.data.bounce?.type ?? null,
          bounceReason:
            event.data.bounce?.reason ?? event.data.bounce?.message ?? null,
        },
      });

      const updates = this.computeEmailLogUpdates(
        emailLog.status,
        eventType,
        new Date(event.created_at),
        event,
        emailLog,
      );

      if (Object.keys(updates).length > 0) {
        await tx.emailLog.update({
          where: { id: emailLog.id },
          data: updates,
        });
      }

      this.logger.log(
        `Event ${eventType} işlendi → EmailLog ${emailLog.id} (provider ${providerMessageId})`,
      );
      return {
        status: "processed",
        emailLogId: emailLog.id,
        eventType,
      };
    });
  }

  private mapEventType(resendType: string): EmailEventType | null {
    const map: Record<string, EmailEventType> = {
      "email.sent": "SENT",
      "email.delivered": "DELIVERED",
      "email.delivery_delayed": "DELIVERY_DELAYED",
      "email.bounced": "BOUNCED",
      "email.complained": "COMPLAINED",
      "email.opened": "OPENED",
      "email.clicked": "CLICKED",
      "email.failed": "FAILED",
    };
    return map[resendType] ?? null;
  }

  /**
   * Status precedence (yüksek → düşük):
   *   COMPLAINED > BOUNCED > FAILED > CLICKED > OPENED > DELIVERED > SENT > SENDING > QUEUED
   *
   * Yeni event'in status'u mevcut status'tan "ilerideyse" ilerleriz.
   * BOUNCED veya COMPLAINED'a düşmüş olan status DELIVERED gelse düşmez.
   */
  private canTransitionTo(
    current: EmailStatus,
    next: EmailStatus,
  ): boolean {
    const order: EmailStatus[] = [
      "QUEUED",
      "SENDING",
      "SENT",
      "DELIVERED",
      "OPENED",
      "CLICKED",
      "FAILED",
      "BOUNCED",
      "COMPLAINED",
    ];
    return order.indexOf(next) > order.indexOf(current);
  }

  private computeEmailLogUpdates(
    currentStatus: EmailStatus,
    eventType: EmailEventType,
    occurredAt: Date,
    event: ResendWebhookEvent,
    emailLog: { openedAt: Date | null; clickedAt: Date | null },
  ): Prisma.EmailLogUpdateInput {
    const updates: Prisma.EmailLogUpdateInput = {};

    switch (eventType) {
      case "SENT":
        if (this.canTransitionTo(currentStatus, "SENT")) updates.status = "SENT";
        break;
      case "DELIVERED":
        if (this.canTransitionTo(currentStatus, "DELIVERED"))
          updates.status = "DELIVERED";
        updates.deliveredAt = occurredAt;
        break;
      case "OPENED":
        if (this.canTransitionTo(currentStatus, "OPENED"))
          updates.status = "OPENED";
        // İlk açılma zamanı sadece bir kez kaydedilir
        if (!emailLog.openedAt) updates.openedAt = occurredAt;
        break;
      case "CLICKED":
        if (this.canTransitionTo(currentStatus, "CLICKED"))
          updates.status = "CLICKED";
        if (!emailLog.clickedAt) updates.clickedAt = occurredAt;
        break;
      case "BOUNCED":
        // Bounce daha "ağır" — her zaman geçer
        updates.status = "BOUNCED";
        updates.bouncedAt = occurredAt;
        if (event.data.bounce?.type) updates.bounceType = event.data.bounce.type;
        if (event.data.bounce?.reason || event.data.bounce?.message)
          updates.bounceReason =
            event.data.bounce.reason ?? event.data.bounce.message ?? null;
        break;
      case "COMPLAINED":
        updates.status = "COMPLAINED";
        updates.complainedAt = occurredAt;
        break;
      case "FAILED":
        // BOUNCED/COMPLAINED'i FAILED'a geri çekme
        if (
          currentStatus !== "BOUNCED" &&
          currentStatus !== "COMPLAINED"
        ) {
          updates.status = "FAILED";
          updates.failedAt = occurredAt;
        }
        break;
      case "DELIVERY_DELAYED":
        // Status'a yansıtma — sadece event timeline'a kaydedilir
        break;
    }

    return updates;
  }
}
