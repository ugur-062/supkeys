import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createEmailClient,
  renderEmail,
  type EmailClient,
  type EmailProviderName,
  type EmailRecipient,
  type EmailTemplateData,
} from "@rothern/email";
import { PrismaService } from "../../common/prisma/prisma.service";

export interface SendEmailInput {
  to: EmailRecipient;
  templateData: EmailTemplateData;
  context?: { type: string; id: string };
  /** Render edilmiş subject — fallback olarak log'a yazılır */
  subject?: string;
}

/**
 * E-posta gönderim servisi.
 *
 * BullMQ kuyruğu kaldırıldıktan sonra (2026-05-20) senkron pipeline:
 *   1. EmailLog INSERT (QUEUED) — audit + idempotency
 *   2. Render (React Email → HTML/text)
 *   3. Resend send
 *   4. EmailLog UPDATE (SENT veya FAILED)
 *
 * Caller pattern: fire-and-forget — `emailService.send({...}).catch(logger.error)`.
 * Resend kendi retry mantığına sahip, dahili olarak idempotent.
 */
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
      "resend") as EmailProviderName;
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
    });

    this.logger.log(`EmailService ready (provider=${provider}, from=${fromEmail})`);
  }

  /**
   * EmailLog kaydı + render + provider send + status update.
   * Hata caller'a fırlatılır; fire-and-forget istiyorsan `.catch(...)`.
   */
  async send(input: SendEmailInput): Promise<{ emailLogId: string }> {
    const log = await this.prisma.emailLog.create({
      data: {
        template: input.templateData.template,
        toEmail: input.to.email,
        toName: input.to.name,
        subject: input.subject ?? input.templateData.template,
        provider: this.providerName,
        status: "SENDING",
        payload: input.templateData.data as object,
        contextType: input.context?.type,
        contextId: input.context?.id,
        attemptCount: 1,
      },
      select: { id: true },
    });

    let rendered;
    try {
      rendered = await renderEmail(input.templateData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: "FAILED",
          errorMessage: `render: ${errorMessage}`,
          failedAt: new Date(),
        },
      });
      this.logger.error(`Email ${log.id} render failed: ${errorMessage}`);
      throw err;
    }

    try {
      const result = await this.client.send({
        to: input.to,
        rendered,
      });

      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: "SENT",
          subject: rendered.subject,
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
          errorMessage: null,
        },
      });

      this.logger.log(
        `Sent email ${log.id} (${input.templateData.template}) → ${input.to.email} via ${this.providerName}`,
      );
      return { emailLogId: log.id };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: "FAILED",
          subject: rendered.subject,
          errorMessage,
          failedAt: new Date(),
        },
      });
      this.logger.error(`Email ${log.id} send failed: ${errorMessage}`);
      throw err;
    }
  }
}
