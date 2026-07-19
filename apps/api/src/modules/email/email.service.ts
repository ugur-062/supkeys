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
import { reportToSentry } from "../../instrument";
import { PrismaService } from "../../common/prisma/prisma.service";
import { isCriticalEmailContext } from "./critical-contexts";

// Geriye-dönük uyumluluk: mevcut import'lar (testler dahil) bu sembolü
// email.service'ten çeker. Tek kaynak critical-contexts.ts; burada re-export.
export { isCriticalEmailContext, CRITICAL_EMAIL_CONTEXTS } from "./critical-contexts";

export interface SendEmailInput {
  to: EmailRecipient;
  templateData: EmailTemplateData;
  context?: { type: string; id: string };
  /** Render edilmiş subject — fallback olarak log'a yazılır */
  subject?: string;
}

/**
 * Payload'ında tek-kullanımlık sır (parola-reset token'ı, 2FA/doğrulama kodu)
 * taşıyan context tipleri. Bu tiplerde EmailLog.payload DÜZ saklanırsa, admin
 * e-posta-logları uçları (findOne payload'ı aynen döndürür) ya da DB okuma
 * erişimi olan biri aktif token/kodu okuyup hesap ele geçirebilirdi — token'ı
 * hash'lemenin (tokenHash/codeHash) tüm amacını boşa çıkarırdı. Bu tiplerde
 * payload maskeli yazılır; gerçek veri yalnız o an render için kullanılır.
 */
const REDACTED_CONTEXT_TYPES = new Set([
  "password_reset",
  "login_2fa",
  "email_verify",
  // Davet token'ları da tek-kullanımlık sır: payload'da düz saklanırsa admin
  // e-posta-logları (findOne payload'ı aynen döner) veya DB okuma erişimi olan
  // biri `?ref=<token>` / `/company/davet/<token>` linkindeki token'ı okuyup
  // daveti kabul edebilir (bağlantı/ takıma katılma = yetki yükseltme).
  "referral_invite",
  "company_user_invitation",
]);

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
    // G-M2 suppression: kalıcı-bounce (hard) veya şikayet (complaint) almış
    // adrese gönderim yapma — Resend itibar riski + boşa gönderim. Mevcut
    // EmailLog verisinden kontrol (migration'sız). Soft/undetermined bounce
    // geçici olduğundan suppress edilmez.
    // Aklama (Faz 8): admin "suppression clear" marker'ı append-only bir
    // EmailLog satırıdır (template=suppression_clear) — marker'dan ÖNCEKİ
    // bounce/complaint kayıtları suppression'ı tetiklemez, tarih yeniden
    // yazılmaz. Marker sonrası yeni bounce yeniden suppress eder.
    const clearMarker = await this.prisma.emailLog.findFirst({
      where: { toEmail: input.to.email, template: "suppression_clear" },
      orderBy: { queuedAt: "desc" },
      select: { queuedAt: true },
    });
    const suppressed = await this.prisma.emailLog.findFirst({
      where: {
        toEmail: input.to.email,
        ...(clearMarker ? { queuedAt: { gt: clearMarker.queuedAt } } : {}),
        OR: [
          { status: "COMPLAINED" },
          { status: "BOUNCED", bounceType: "hard" },
        ],
      },
      select: { status: true },
    });
    if (suppressed) {
      this.logger.warn(
        `Gönderim atlandı — adres ${suppressed.status} (${input.to.email}); ${input.templateData.template}`,
      );
      const skipped = await this.prisma.emailLog.create({
        data: {
          template: input.templateData.template,
          toEmail: input.to.email,
          toName: input.to.name,
          subject: input.subject ?? input.templateData.template,
          provider: this.providerName,
          status: "FAILED",
          errorMessage: `suppressed: adres daha önce ${suppressed.status}`,
          failedAt: new Date(),
          contextType: input.context?.type,
          contextId: input.context?.id,
          attemptCount: 0,
        },
        select: { id: true },
      });
      // Kritik e-posta suppress ise kullanıcı kalıcı mahsur (kod/reset gitmiyor)
      // → ops alarmı (PII yok).
      if (isCriticalEmailContext(input.context?.type)) {
        reportToSentry("[EMAIL-KRİTİK-SUPPRESS]", "error", {
          tags: { email: "critical-suppressed", context: input.context!.type },
          extra: {
            emailLogId: skipped.id,
            contextId: input.context?.id ?? null,
            suppressedStatus: suppressed.status,
          },
        });
      }
      return { emailLogId: skipped.id };
    }

    // Hassas tiplerde token/kod düz saklanmaz (bkz. REDACTED_CONTEXT_TYPES).
    const logPayload =
      input.context && REDACTED_CONTEXT_TYPES.has(input.context.type)
        ? { __redacted: "hassas içerik (token/kod) loglanmaz" }
        : (input.templateData.data as object);
    const log = await this.prisma.emailLog.create({
      data: {
        template: input.templateData.template,
        toEmail: input.to.email,
        toName: input.to.name,
        subject: input.subject ?? input.templateData.template,
        provider: this.providerName,
        status: "SENDING",
        payload: logPayload,
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
      // Kritik e-posta (kayıt kodu / reset / 2FA) gönderilemedi → "sessiz ölüm"
      // yerine ops alarmı. PII YOK: yalnız log-id + context (adres/kod GEÇMEZ).
      if (isCriticalEmailContext(input.context?.type)) {
        reportToSentry("[EMAIL-KRİTİK-GÖNDERİLEMEDİ]", "error", {
          tags: { email: "critical-send-failed", context: input.context!.type },
          extra: { emailLogId: log.id, contextId: input.context?.id ?? null },
        });
      }
      throw err;
    }
  }
}
