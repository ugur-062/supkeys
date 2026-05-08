import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { EmailRecipient, EmailTemplateData } from "@supkeys/email";
import type { Queue } from "bullmq";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  EMAIL_JOB_NAME,
  EMAIL_QUEUE_NAME,
  type EmailJobPayload,
} from "./dto/email-job.dto";

/**
 * Outbox pattern — DB ↔ BullMQ atomik koordinasyonu için.
 *
 * Senaryolar:
 *   1. EmailQueue.enqueue() DB INSERT yaptı, sonra BullMQ.add() failed
 *      (Redis disconnect, network hiccup vb.) → satır QUEUED kalır
 *   2. API restart sırasında "active" job kaybedildi → satır SENDING'de takılı
 *   3. Worker crash'inde job retry'a girdi ama EmailLog güncellenemedi
 *
 * Bu cron her dakika DB'yi tarar:
 *   - QUEUED + queuedAt < now-30s + attemptCount<3  → re-enqueue
 *   - SENDING + queuedAt < now-5m + attemptCount<3  → reset to QUEUED + re-enqueue
 *
 * Idempotency: jobId = emailLogId. BullMQ aynı ID ile add() çağrısını
 * sessizce skip eder, bu yüzden burada race koşulu yok.
 */
@Injectable()
export class EmailOutboxService {
  private readonly logger = new Logger(EmailOutboxService.name);
  private static readonly STALE_QUEUED_MS = 30 * 1000;
  private static readonly STALE_SENDING_MS = 5 * 60 * 1000;
  private static readonly MAX_ATTEMPTS = 3;
  private static readonly BATCH_SIZE = 50;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(EMAIL_QUEUE_NAME) private readonly queue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processOutbox(): Promise<void> {
    await Promise.allSettled([
      this.recoverStaleQueued(),
      this.recoverStaleSending(),
    ]);
  }

  /** QUEUED ama BullMQ'da işlenmemiş satırları yeniden bas. */
  private async recoverStaleQueued(): Promise<void> {
    const threshold = new Date(Date.now() - EmailOutboxService.STALE_QUEUED_MS);
    const stale = await this.prisma.emailLog.findMany({
      where: {
        status: "QUEUED",
        queuedAt: { lt: threshold },
        attemptCount: { lt: EmailOutboxService.MAX_ATTEMPTS },
      },
      orderBy: { queuedAt: "asc" },
      take: EmailOutboxService.BATCH_SIZE,
    });

    if (stale.length === 0) return;

    this.logger.warn(`Outbox: re-enqueueing ${stale.length} stale QUEUED row(s)`);

    for (const log of stale) {
      await this.tryEnqueue(log);
    }
  }

  /** SENDING'de takılı (worker crash sonrası) satırları reset + re-enqueue. */
  private async recoverStaleSending(): Promise<void> {
    const threshold = new Date(
      Date.now() - EmailOutboxService.STALE_SENDING_MS,
    );
    const stuck = await this.prisma.emailLog.findMany({
      where: {
        status: "SENDING",
        queuedAt: { lt: threshold },
        attemptCount: { lt: EmailOutboxService.MAX_ATTEMPTS },
      },
      orderBy: { queuedAt: "asc" },
      take: EmailOutboxService.BATCH_SIZE,
    });

    if (stuck.length === 0) return;

    this.logger.warn(
      `Outbox: resetting ${stuck.length} SENDING row(s) stuck > ${
        EmailOutboxService.STALE_SENDING_MS / 1000
      }s`,
    );

    for (const log of stuck) {
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: "QUEUED" },
      });
      await this.tryEnqueue(log);
    }
  }

  private async tryEnqueue(log: {
    id: string;
    template: string;
    toEmail: string;
    toName: string | null;
    payload: unknown;
    contextType: string | null;
    contextId: string | null;
  }): Promise<void> {
    if (!log.payload || typeof log.payload !== "object") {
      this.logger.error(
        `Outbox: skipping ${log.id} — payload missing or invalid`,
      );
      return;
    }

    const recipient: EmailRecipient = {
      email: log.toEmail,
      name: log.toName ?? undefined,
    };
    const templateData = {
      template: log.template,
      data: log.payload,
    } as unknown as EmailTemplateData;

    const jobPayload: EmailJobPayload = {
      to: recipient,
      templateData,
      emailLogId: log.id,
      context:
        log.contextType && log.contextId
          ? { type: log.contextType, id: log.contextId }
          : undefined,
    };

    try {
      await this.queue.add(EMAIL_JOB_NAME, jobPayload, { jobId: log.id });
      this.logger.log(`Outbox: re-enqueued ${log.id} (${log.template})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Outbox: failed to re-enqueue ${log.id}: ${msg}`,
      );
    }
  }
}
