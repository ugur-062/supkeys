import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createEmailClient,
  renderEmail,
  type EmailClient,
  type EmailProviderName,
} from "@supkeys/email";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { EmailJobPayload } from "./dto/email-job.dto";

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private client!: EmailClient;
  private providerName!: EmailProviderName;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    const provider = (this.config.get<string>("EMAIL_PROVIDER") ??
      "mailpit") as EmailProviderName;
    const fromEmail = this.config.getOrThrow<string>("EMAIL_FROM_ADDRESS");
    const fromName = this.config.get<string>("EMAIL_FROM_NAME");
    const replyTo = this.config.get<string>("EMAIL_REPLY_TO");

    this.providerName = provider;
    this.client = createEmailClient({
      provider,
      from: { email: fromEmail, name: fromName },
      replyTo: replyTo && replyTo.trim() !== "" ? replyTo : undefined,
      resend:
        provider === "resend"
          ? { apiKey: this.config.getOrThrow<string>("RESEND_API_KEY") }
          : undefined,
      mailpit:
        provider === "mailpit"
          ? {
              host: this.config.get<string>("MAILPIT_HOST", "localhost"),
              port: parseInt(
                this.config.get<string>("MAILPIT_PORT", "1025"),
                10,
              ),
            }
          : undefined,
    });

    this.logger.log(`EmailService ready (provider=${provider}, from=${fromEmail})`);
  }

  /**
   * Job processor'dan çağrılır. Render et + gönder + EmailLog'u güncelle.
   * Hata fırlatırsa BullMQ retry yapar.
   */
  async processJob(payload: EmailJobPayload): Promise<void> {
    const log = await this.prisma.emailLog.findUnique({
      where: { id: payload.emailLogId },
    });

    if (!log) {
      this.logger.warn(`EmailLog ${payload.emailLogId} not found, skipping`);
      return;
    }

    if (log.status === "SENT") {
      // İdempotansi: aynı job tekrar tetiklenirse yine göndermeyelim
      this.logger.log(`EmailLog ${log.id} already SENT, skipping`);
      return;
    }

    const rendered = await renderEmail(payload.templateData);

    await this.prisma.emailLog.update({
      where: { id: log.id },
      data: {
        status: "SENDING",
        subject: rendered.subject,
        provider: this.providerName,
        attemptCount: { increment: 1 },
      },
    });

    try {
      const result = await this.client.send({
        to: payload.to,
        rendered,
      });

      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: "SENT",
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
          errorMessage: null,
        },
      });

      this.logger.log(
        `Sent email ${log.id} (${log.template}) → ${payload.to.email} via ${this.providerName}`,
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);

      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: "FAILED",
          errorMessage,
          failedAt: new Date(),
        },
      });

      this.logger.error(
        `Email ${log.id} failed: ${errorMessage}`,
      );
      throw err; // BullMQ retry tetikler
    }
  }
}
