import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { EmailService } from "../../email/email.service";

const REMINDER_THRESHOLD_DAYS = 3;
const RE_REMINDER_INTERVAL_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * V1.5 Oturum 2 — Onay reminder cron.
 *
 * Her gün 09:00 İstanbul (Europe/Istanbul) çalışır. PENDING kalan
 * ApprovalRequest'lerden 3+ gündür bekleyen ve son 3 günde reminder
 * gönderilmemiş olanları tespit eder; her birinin ilk PENDING adımının
 * approver'ına `approval_reminder` e-postası gönderir, `lastReminderAt`'i
 * günceller.
 *
 * Approver pasif ise reminder atlanır — fallback cron (her dakika) ilgilenir.
 */
@Injectable()
export class ApprovalReminderService {
  private readonly logger = new Logger(ApprovalReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  @Cron("0 9 * * *", {
    name: "approval_reminder",
    timeZone: "Europe/Istanbul",
  })
  async runDaily(): Promise<void> {
    await this.sendReminders();
  }

  /**
   * Test/manuel tetikleme. Cron path'i ile aynı işi yapar.
   */
  async sendReminders(): Promise<{ sent: number; skipped: number }> {
    this.logger.log("Running approval reminder scan");

    const now = Date.now();
    const thresholdDate = new Date(now - REMINDER_THRESHOLD_DAYS * DAY_MS);
    const reReminderThreshold = new Date(
      now - RE_REMINDER_INTERVAL_DAYS * DAY_MS,
    );

    const stale = await this.prisma.approvalRequest.findMany({
      where: {
        status: "PENDING",
        startedAt: { lt: thresholdDate },
        OR: [
          { lastReminderAt: null },
          { lastReminderAt: { lt: reReminderThreshold } },
        ],
      },
      include: {
        tender: { select: { tenderNumber: true, title: true } },
        flow: { select: { name: true } },
        initiatedBy: { select: { firstName: true, lastName: true } },
        steps: {
          where: { status: "PENDING" },
          include: {
            approver: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                isActive: true,
              },
            },
          },
          orderBy: { orderIndex: "asc" },
          take: 1,
        },
      },
      take: 50,
    });

    if (stale.length === 0) {
      this.logger.log("No stale pending approvals");
      return { sent: 0, skipped: 0 };
    }

    this.logger.log(`Found ${stale.length} stale pending approvals`);

    let sent = 0;
    let skipped = 0;

    const tasks = stale.map(async (request) => {
      const pendingStep = request.steps[0];
      if (!pendingStep) {
        skipped++;
        this.logger.warn(
          `Skipping ${request.approvalNumber}: no PENDING step found`,
        );
        return;
      }
      if (!pendingStep.approver.isActive) {
        skipped++;
        this.logger.warn(
          `Skipping ${request.approvalNumber}: approver pasif (fallback cron ilgilenir)`,
        );
        return;
      }

      const daysWaiting = Math.max(
        1,
        Math.floor((now - request.startedAt.getTime()) / DAY_MS),
      );

      try {
        await this.emailService.send({
          to: {
            email: pendingStep.approver.email,
            name: `${pendingStep.approver.firstName} ${pendingStep.approver.lastName}`,
          },
          templateData: {
            template: "approval_reminder",
            data: {
              approverFirstName: pendingStep.approver.firstName,
              approvalNumber: request.approvalNumber,
              tenderNumber: request.tender.tenderNumber,
              tenderTitle: request.tender.title,
              initiatorName: `${request.initiatedBy.firstName} ${request.initiatedBy.lastName}`,
              flowName: request.flow.name,
              amount: Number(request.amount),
              currency: request.currency,
              approvalType: request.type,
              approvalUrl: `${this.webUrl()}/dashboard/onay-bekleyenler/${request.id}`,
              daysWaiting,
            },
          },
          context: {
            type: "approval_request_reminder",
            id: request.id,
          },
        });

        await this.prisma.approvalRequest.update({
          where: { id: request.id },
          data: { lastReminderAt: new Date() },
        });

        sent++;
        this.logger.log(
          `Reminder sent for ${request.approvalNumber} (${daysWaiting} days) → ${pendingStep.approver.email}`,
        );
      } catch (err) {
        skipped++;
        this.logger.error(
          `Reminder enqueue failed for ${request.approvalNumber}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    });

    await Promise.allSettled(tasks);

    this.logger.log(
      `Approval reminder scan complete: sent=${sent}, skipped=${skipped}`,
    );
    return { sent, skipped };
  }

  private webUrl(): string {
    return (this.config.get<string>("WEB_URL") ?? "http://localhost:3000")
      .replace(/\/$/, "");
  }
}
