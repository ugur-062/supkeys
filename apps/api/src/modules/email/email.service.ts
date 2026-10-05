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
import type { Locale } from "@rothern/i18n";
import type { Prisma } from "@rothern/db";
import { reportToSentry } from "../../instrument";
import { PrismaService } from "../../common/prisma/prisma.service";
import { resolveWebUrl } from "../../common/config/web-url";
import { localizeAppPath } from "../../common/company/app-routes";
import { isCriticalEmailContext } from "./critical-contexts";
import {
  STREAM_SENDER_ENV,
  privacyNoticeFor,
  streamForContext,
  unsubscribeScopeFor,
  type EmailStream,
} from "./email-streams";
import { signUnsubscribeToken } from "./unsubscribe-token";
import { maskEmail } from "../../common/logging/mask-email";
import { SUPPRESSION_CLEAR_MARKER_WHERE } from "./suppression-marker";
import { undeliverableEmailReason } from "./undeliverable-domain";
import {
  EmailSendThrottle,
  emailIdempotencyKey,
  isRetryableEmailError,
  retryDelayMs,
  type EmailSendPriority,
} from "./email-send-throttle";

// Geriye-dönük uyumluluk: mevcut import'lar (testler dahil) bu sembolü
// email.service'ten çeker. Tek kaynak critical-contexts.ts; burada re-export.
export { isCriticalEmailContext, CRITICAL_EMAIL_CONTEXTS } from "./critical-contexts";

/**
 * Politika gereği ATLANAN gönderimin EmailLog `errorMessage` önekleri
 * (suppress edilmiş adres / tek tık çıkış). Satır FAILED yazılır ama bu bir
 * teslim hatası değildir: yeniden denemek aynı sonucu verir. Teslim edilemez
 * alan adı (`.local`, `.test`, example.com…; bkz. undeliverable-domain.ts) da
 * `suppressed:` önekiyle yazılır — aynı sınıf, tekillik süzgeci ve e2e
 * "atlanan" listesi değişmeden kapsar.
 */
export const EMAIL_SKIPPED_SUPPRESSED_PREFIX = "suppressed:";
export const EMAIL_SKIPPED_OPTED_OUT_PREFIX = "opted_out:";

/**
 * `sent:false` dönüşünde gönderimin NEDEN atlandığı. Log öneki teslim
 * edilemez alan adında da `suppressed:` kalır; ekran metni ise bu alana
 * bakar — `.test`/example.com adresine "bu adres e-postalarımızı kalıcı
 * olarak geri çevirdi" demek yanlış olurdu (canlı öncesi son tur).
 */
export type EmailSkipReason = "undeliverable" | "suppressed" | "opted_out";

export interface EmailSendResult {
  emailLogId: string;
  sent: boolean;
  /** Yalnız politika gereği atlanan gönderimde (`sent:false`) dolu. */
  skipReason?: EmailSkipReason;
}

/**
 * Tekillik sorguları için "bu bağlam için gönderim denendi" süzgeci: FAILED
 * olmayan satırlar + politika gereği atlanan FAILED satırlar. Yalnız
 * `status: { not: "FAILED" }` ile süzmek, suppress/çıkış yapmış adrese her
 * zamanlayıcı turunda yeni bir FAILED satırı yazdırıyordu (derin denetim LU-18).
 */
export const EMAIL_LOG_HANDLED_WHERE = {
  OR: [
    { status: { not: "FAILED" } },
    { errorMessage: { startsWith: EMAIL_SKIPPED_SUPPRESSED_PREFIX } },
    { errorMessage: { startsWith: EMAIL_SKIPPED_OPTED_OUT_PREFIX } },
  ],
} satisfies Prisma.EmailLogWhereInput;

export interface SendEmailInput {
  to: EmailRecipient;
  templateData: EmailTemplateData;
  context?: { type: string; id: string };
  /** Render edilmiş subject — fallback olarak log'a yazılır */
  subject?: string;
  /**
   * ALICININ dili — şablon metni (ve kabuk/altbilgi) bu dille üretilir.
   * Verilmezse Türkçe: bugünkü davranış aynen korunur. Bildirim/e-posta tek
   * payload'dan N kişiye dağıldığı için dil ALICI BAŞINA geçirilmelidir.
   */
  locale?: Locale;
  /**
   * Gönderenin GÖRÜNEN adı (adres akıştan gelir) — ör. davette
   * "ABC İnşaat (Rothern üzerinden)". Verilmezse `EMAIL_FROM_NAME`.
   */
  fromName?: string;
  /**
   * Gönderim kuyruğundaki öncelik (bkz. email-send-throttle). Verilmezse
   * akıştan türer: işlem e-postası `high`, diğerleri `normal`. Toplu yönetici
   * duyurusu `bulk` geçer — diğer e-postaları arkasında bekletmesin. Kritik
   * (kod/şifre/2FA) e-posta her zaman `high`.
   */
  priority?: EmailSendPriority;
}

/** Sağlayıcı çağrısı için en fazla deneme (ilk + 2 yeniden deneme). */
export const EMAIL_SEND_MAX_ATTEMPTS = 3;
/**
 * Varsayılan hız — Resend'in varsayılan takım limiti saniyede 2 istek.
 * Hesap limiti yükseltildiyse `EMAIL_SEND_RATE_PER_SEC` ile artırılır.
 */
const DEFAULT_EMAIL_SEND_RATE_PER_SEC = 2;
/** Aynı anda koşan gönderim hattı (DB sorguları + render + sağlayıcı). */
const DEFAULT_EMAIL_SEND_CONCURRENCY = 4;

function positiveNumber(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Çıkış sayfası (web, dil ön ekli) ve RFC 8058 tek tık ucu. Tek tık ucu web
 * alan adındadır (`/api/email/unsubscribe`, API'ye iletir): bağlantı gönderen
 * alan adıyla hizalı kalır ve API'nin genel adresini bilmesi gerekmez.
 */
export const UNSUBSCRIBE_PAGE_PATH = "/e-posta-tercihleri";
export const UNSUBSCRIBE_ONE_CLICK_PATH = "/api/email/unsubscribe";
const PREFERENCES_PATH = "/company/ayarlar/bildirimler";

/**
 * Payload'ında tek-kullanımlık sır (parola-reset token'ı, 2FA/doğrulama kodu)
 * taşıyan context tipleri. Bu tiplerde EmailLog.payload DÜZ saklanırsa, admin
 * e-posta-logları uçları (findOne payload'ı aynen döndürür) ya da DB okuma
 * erişimi olan biri aktif token/kodu okuyup hesap ele geçirebilirdi — token'ı
 * hash'lemenin (tokenHash/codeHash) tüm amacını boşa çıkarırdı. Bu tiplerde
 * payload maskeli yazılır; gerçek veri yalnız o an render için kullanılır.
 */
export const REDACTED_CONTEXT_TYPES = new Set([
  "password_reset",
  "login_2fa",
  "email_verify",
  // Davet token'ları da tek-kullanımlık sır: payload'da düz saklanırsa admin
  // e-posta-logları (findOne payload'ı aynen döner) veya DB okuma erişimi olan
  // biri `?ref=<token>` / `/company/davet/<token>` linkindeki token'ı okuyup
  // daveti kabul edebilir (bağlantı/ takıma katılma = yetki yükseltme).
  "referral_invite",
  // Dış ihale daveti AYNI CompanyReferralInvite.token'ı taşır (registerUrl
  // ?ref= + optOutUrl ?token=) — aynı sınıf, aynı redaksiyon (denetim
  // 2026-08-23 Parça 4).
  "tender_external_invite",
  "company_user_invitation",
  // Misafir bilgi talebi doğrulama jetonu (Faz 1): `?t=<token>` bağlantısı
  // TEK KULLANIMLIK bir sırdır — okuyan, başkasının talebini onaylayıp
  // satıcıya ilettirebilir (spam kapısını dışarıdan açar). tokenHash ile
  // hash'lemenin amacı payload düz saklanırsa boşa çıkardı.
  "public_inquiry_verify",
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
 *
 * Resend SDK'sı (v4) 429/5xx'te YENİDEN DENEMEZ; toplu bildirimler aynı anda
 * ateşlenince hesabın saniyelik limiti aşılıp e-postalar sessizce FAILED
 * kalıyordu (derin denetim 2026-09-29 Y-08). Bu yüzden her gönderim süreç içi
 * `EmailSendThrottle`dan geçer (sınırlı eşzamanlılık + öncelik + jeton kovası)
 * ve 429/5xx üstel geri çekilmeyle `EMAIL_SEND_MAX_ATTEMPTS` kez denenir.
 * Kuyruk bellektedir: süreç yeniden başlarsa henüz hat almamış gönderimler
 * kaybolur (EmailLog satırı da henüz yazılmamıştır).
 */
@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private client!: EmailClient;
  private providerName!: EmailProviderName;
  /** Akış başına gönderen (boş akış varsayılana düşer — bkz. email-streams). */
  private senders!: Record<EmailStream, { email: string; name?: string }>;
  private throttle: EmailSendThrottle;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // Kurucuda (onModuleInit'te değil): birim testleri servisi elle kurar.
    this.throttle = new EmailSendThrottle({
      ratePerSec: positiveNumber(
        this.config.get<string>("EMAIL_SEND_RATE_PER_SEC"),
        DEFAULT_EMAIL_SEND_RATE_PER_SEC,
      ),
      maxConcurrent: positiveNumber(
        this.config.get<string>("EMAIL_SEND_CONCURRENCY"),
        DEFAULT_EMAIL_SEND_CONCURRENCY,
      ),
    });
  }

  onModuleInit() {
    const provider = (this.config.get<string>("EMAIL_PROVIDER") ??
      "resend") as EmailProviderName;
    const fromEmail = this.config.getOrThrow<string>("EMAIL_FROM_ADDRESS");
    const fromName = this.config.get<string>("EMAIL_FROM_NAME");
    const replyTo = this.config.get<string>("EMAIL_REPLY_TO");

    this.providerName = provider;
    const senderFor = (stream: EmailStream) => {
      const v = (this.config.get<string>(STREAM_SENDER_ENV[stream]) ?? "").trim();
      return { email: v || fromEmail, name: fromName };
    };
    this.senders = {
      TRANSACTIONAL: { email: fromEmail, name: fromName },
      NOTIFICATION: senderFor("NOTIFICATION"),
      INVITE: senderFor("INVITE"),
      LIFECYCLE: senderFor("LIFECYCLE"),
    };
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
  /**
   * Dalga B (P7): dönüş artık `sent` bayrağı taşıyor. Suppress edilmiş adreste
   * bu metot HATA ATMAZ (bilinçli — çağıran akış çökmemeli) ama eskiden başarı
   * ŞEKLİNİ döndürüyordu: `issueEmailCode` bunu "gitti" sayıp kullanıcıya
   * "kod gönderildi" diyordu. Oysa hard-bounce almış adrese kod ASLA gitmez →
   * kullanıcı kalıcı mahsur ve nedenini göremiyor. Parça 1'de eklenen
   * dürüst-sinyal (`emailSent` / 2FA 503) bu yolda devre dışı kalıyordu.
   */
  async send(input: SendEmailInput): Promise<EmailSendResult> {
    return this.throttle.run(this.priorityFor(input), () => this.sendNow(input));
  }

  private priorityFor(input: SendEmailInput): EmailSendPriority {
    if (isCriticalEmailContext(input.context?.type)) return "high";
    if (input.priority) return input.priority;
    return streamForContext(input.context?.type) === "TRANSACTIONAL" ? "high" : "normal";
  }

  /**
   * Sağlayıcı çağrısı — her deneme hız jetonu alır; 429/5xx'te üstel geri
   * çekilmeyle yeniden dener. Başarısız son denemenin hatası `attempts` ile
   * fırlatılır.
   */
  private async sendWithRetry(
    payload: Parameters<EmailClient["send"]>[0],
    logId: string,
  ): Promise<{ result: Awaited<ReturnType<EmailClient["send"]>>; attempts: number }> {
    // Her denemede AYNI anahtar (EmailLog satırı başına bir): bağlantı Resend
    // isteği aldıktan sonra koparsa (`application_error`) yeniden deneme
    // sağlayıcı tarafında tekilleşir, ikinci e-posta gitmez.
    const keyed = { ...payload, idempotencyKey: emailIdempotencyKey(logId) };
    for (let attempt = 1; ; attempt++) {
      await this.throttle.acquireToken();
      try {
        const result = await this.client.send(keyed);
        return { result, attempts: attempt };
      } catch (err) {
        if (attempt >= EMAIL_SEND_MAX_ATTEMPTS || !isRetryableEmailError(err)) {
          throw Object.assign(err instanceof Error ? err : new Error(String(err)), {
            emailAttempts: attempt,
          });
        }
        const delay = retryDelayMs(attempt);
        this.logger.warn(
          `Email ${logId} transient error (attempt ${attempt}/${EMAIL_SEND_MAX_ATTEMPTS}), retrying in ${delay} ms: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        await this.throttle.wait(delay);
      }
    }
  }

  private async sendNow(input: SendEmailInput): Promise<EmailSendResult> {
    // Teslim edilemez alan adı (canlı öncesi son tur): `.local`/`.test`/
    // example.com… adresine gönderim ORTAK Resend alan adında bounce üretir ve
    // canlı e-postaların itibarını düşürür. Sağlayıcıya gitmez; suppression
    // gibi FAILED + `suppressed:` yazılır. Kritik bağlamda bile Sentry alarmı
    // YOK: adres hiçbir zaman teslim edilemez, bu bir ops arızası değil.
    const undeliverable = undeliverableEmailReason(input.to.email);
    if (undeliverable) {
      this.logger.warn(
        `Send skipped - ${undeliverable} (${maskEmail(input.to.email)}); ${input.templateData.template}`,
      );
      const skipped = await this.logSkipped(
        input,
        `${EMAIL_SKIPPED_SUPPRESSED_PREFIX} undeliverable domain: ${undeliverable}`,
      );
      return { emailLogId: skipped.id, sent: false, skipReason: "undeliverable" };
    }

    // G-M2 suppression: kalıcı-bounce (hard) veya şikayet (complaint) almış
    // adrese gönderim yapma — Resend itibar riski + boşa gönderim. Mevcut
    // EmailLog verisinden kontrol (migration'sız). Soft/undetermined bounce
    // geçici olduğundan suppress edilmez.
    // Aklama (Faz 8): admin "suppression clear" marker'ı append-only bir
    // EmailLog satırıdır (template=suppression_clear) — marker'dan ÖNCEKİ
    // bounce/complaint kayıtları suppression'ı tetiklemez, tarih yeniden
    // yazılmaz. Marker sonrası yeni bounce yeniden suppress eder.
    const clearMarker = await this.prisma.emailLog.findFirst({
      // Yalniz servisin yazdigi gecerli isaret (provider=internal, SENT) —
      // ayni sablonlu baska satir aklamaz (arayuz testi O-078).
      where: { toEmail: input.to.email, ...SUPPRESSION_CLEAR_MARKER_WHERE },
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
        `Gönderim atlandı — adres ${suppressed.status} (${maskEmail(input.to.email)}); ${input.templateData.template}`,
      );
      const skipped = await this.logSkipped(
        input,
        `${EMAIL_SKIPPED_SUPPRESSED_PREFIX} adres daha önce ${suppressed.status}`,
      );
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
      return { emailLogId: skipped.id, sent: false, skipReason: "suppressed" };
    }

    // Tek tık çıkış (2026-09-27): işlem dışı akışta adres o kapsamdan (ya da
    // "tümü"nden) çıktıysa gönderilmez. Kayıtlı kullanıcının kategori tercihi
    // çağıranda (`isNotificationEnabled`) uygulanır; bu kapı kullanıcı OLMAYAN
    // alıcıyı (firma `billingEmail`i) ve davet adreslerini de kapsar.
    const stream = streamForContext(input.context?.type);
    const scope = unsubscribeScopeFor(input.context?.type);
    if (scope && (await this.isOptedOut(input.to.email, scope))) {
      const skipped = await this.logSkipped(input, `${EMAIL_SKIPPED_OPTED_OUT_PREFIX} ${scope}`);
      this.logger.log(`skipped (opted out of "${scope}"): ${input.templateData.template}`);
      return { emailLogId: skipped.id, sent: false, skipReason: "opted_out" };
    }
    const unsubscribe = scope ? this.unsubscribeLinks(input.to.email, scope, input.locale ?? "tr", stream) : null;

    // Hassas tiplerde token/kod düz saklanmaz (bkz. REDACTED_CONTEXT_TYPES).
    // NOT: bu payload ile YENİDEN GÖNDERİM yapılamaz — admin-email-logs.resend
    // bu tipleri reddeder (denetim 2026-08-26 Parça 9 #2).
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
        // Admin "Yeniden gonder" ayni dil + baglamla cizsin (derin denetim MU-05).
        locale: input.locale,
        attemptCount: 1,
      },
      select: { id: true },
    });

    let rendered;
    try {
      // Alt bilgideki alan adı gönderen ortamın web adresinden (staging kendi alanını basar).
      rendered = await renderEmail(input.templateData, input.locale, {
        siteUrl: resolveWebUrl(this.config),
        // KVKK aydınlatma: çıkıştan bağımsız (üye olmayan adrese işlem e-postası).
        privacyNotice: privacyNoticeFor(input.context?.type),
        ...(unsubscribe?.env ?? {}),
      });
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
      // Elle kurulan servis (birim testleri onModuleInit'i koşmaz) istemcinin
      // varsayılan göndericisine düşer.
      const sender = this.senders?.[stream];
      const { result, attempts } = await this.sendWithRetry(
        {
          to: input.to,
          rendered,
          ...(sender ? { from: { email: sender.email, name: input.fromName ?? sender.name } } : {}),
          ...(unsubscribe ? { headers: unsubscribe.headers } : {}),
        },
        log.id,
      );

      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: "SENT",
          subject: rendered.subject,
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
          errorMessage: null,
          ...(attempts > 1 ? { attemptCount: attempts } : {}),
        },
      });

      this.logger.log(
        `Sent email ${log.id} (${input.templateData.template}) → ${maskEmail(input.to.email)} via ${this.providerName}`,
      );
      return { emailLogId: log.id, sent: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const attempts = (err as { emailAttempts?: number } | null)?.emailAttempts;
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: "FAILED",
          subject: rendered.subject,
          errorMessage,
          failedAt: new Date(),
          ...(attempts && attempts > 1 ? { attemptCount: attempts } : {}),
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

  /**
   * Politika gereği atlanan gönderimin EmailLog satırı (FAILED, payload'sız,
   * deneme 0) — suppression, tek tık çıkış ve teslim edilemez alan adı ortak.
   */
  private logSkipped(input: SendEmailInput, errorMessage: string): Promise<{ id: string }> {
    return this.prisma.emailLog.create({
      data: {
        template: input.templateData.template,
        toEmail: input.to.email,
        toName: input.to.name,
        subject: input.subject ?? input.templateData.template,
        provider: this.providerName,
        status: "FAILED",
        errorMessage,
        failedAt: new Date(),
        contextType: input.context?.type,
        contextId: input.context?.id,
        locale: input.locale,
        attemptCount: 0,
      },
      select: { id: true },
    });
  }

  /** Adres bu kapsamdan (ya da tüm isteğe bağlı e-postalardan) çıkmış mı? */
  private async isOptedOut(email: string, scope: string): Promise<boolean> {
    const lower = email.trim().toLowerCase();
    const row = await this.prisma.emailOptOut.findFirst({
      where: { email: lower, scope: { in: [scope, "all"] } },
      select: { id: true },
    });
    if (row) return true;
    if (scope !== "invite") return false;
    const invite = await this.prisma.referralOptOut.findUnique({
      where: { email: lower },
      select: { email: true },
    });
    return !!invite;
  }

  /**
   * Alt bilgi bağlantıları + RFC 8058 başlıkları. `JWT_SECRET` yoksa (yalnız
   * yerel test) jeton imzalanamaz → çıkış bağlantısı basılmaz, e-posta yine gider.
   */
  private unsubscribeLinks(
    email: string,
    scope: NonNullable<ReturnType<typeof unsubscribeScopeFor>>,
    locale: Locale,
    stream: EmailStream,
  ): { env: { unsubscribeUrl: string; preferencesUrl?: string }; headers: Record<string, string> } | null {
    const secret = this.config.get<string>("JWT_SECRET");
    if (!secret) return null;
    const web = resolveWebUrl(this.config);
    const token = signUnsubscribeToken({ email, scope, locale }, secret);
    const pageUrl = `${web}${localizeAppPath(UNSUBSCRIBE_PAGE_PATH, locale)}?t=${token}`;
    const oneClickUrl = `${web}${UNSUBSCRIBE_ONE_CLICK_PATH}?t=${token}`;
    return {
      env: {
        unsubscribeUrl: pageUrl,
        // Tercih ekranı yalnız hesabı olan alıcıya anlamlı; davet adresi
        // kayıtsızdır → bağlantı basılmaz.
        ...(stream === "INVITE" ? {} : { preferencesUrl: `${web}${localizeAppPath(PREFERENCES_PATH, locale)}` }),
      },
      headers: {
        "List-Unsubscribe": `<${oneClickUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    };
  }
}
