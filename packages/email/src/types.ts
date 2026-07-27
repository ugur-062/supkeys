export type EmailTemplate =
  | "password_reset"
  | "referral_invite"
  | "tender_external_invite"
  | "notification";

export type EmailProviderName = "resend";

export interface EmailRecipient {
  email: string;
  name?: string;
}

/**
 * Self-service "şifremi unuttum" + e-posta daveti — kullanıcıya giden tek
 * kullanımlık parola belirleme/sıfırlama linki.
 */
export interface PasswordResetData {
  firstName: string;
  email: string;
  resetUrl: string;
  expiresInMinutes: number;
}

/**
 * Kayıtlı olmayan firmayı bağlantı için davet — kaydolunca otomatik INVITE
 * bağlantısı kurulur.
 */
export interface ReferralInviteData {
  inviterName: string;
  email: string;
  registerUrl: string;
}

/** Faz C — dış ihale daveti (kapalı zarf: yalnız başlık/kategori/kapanış). */
export interface TenderExternalInviteData {
  inviterName: string;
  tenderTitle: string;
  categories: string;
  closesAt: string | null;
  registerUrl: string;
  optOutUrl: string;
}

/**
 * Genel işlemsel bildirim — ihale daveti, kapanış hatırlatma, kategori
 * eşleşmesi, teklif eleme, kazandırma, onay isteği vb. hepsi bunu kullanır.
 * İçerik çağrı tarafında kurulur (başlık + paragraflar + bilgi satırları + CTA).
 */
export interface NotificationInfoRow {
  label: string;
  value: string;
}
export interface NotificationData {
  subject: string;
  preview?: string;
  heading: string;
  paragraphs: string[];
  infoRows?: NotificationInfoRow[];
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}

export type EmailTemplateData =
  | {
      template: "password_reset";
      data: PasswordResetData;
    }
  | {
      template: "referral_invite";
      data: ReferralInviteData;
    }
  | {
      template: "tender_external_invite";
      data: TenderExternalInviteData;
    }
  | {
      template: "notification";
      data: NotificationData;
    };

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** E-posta eki. inlineContentId set ise gömülü (inline) ek olur ve HTML'de
 *  `cid:<inlineContentId>` ile referanslanır (ör. gömülü logo). */
export interface EmailAttachment {
  filename: string;
  /** base64 içerik. */
  content: string;
  contentType?: string;
  inlineContentId?: string;
}

export interface SendEmailInput {
  to: EmailRecipient;
  from: { email: string; name?: string };
  replyTo?: string;
  rendered: RenderedEmail;
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  providerMessageId: string | null;
}

export interface EmailClientConfig {
  provider: EmailProviderName;
  from: { email: string; name?: string };
  replyTo?: string;
  resend?: { apiKey: string };
}
