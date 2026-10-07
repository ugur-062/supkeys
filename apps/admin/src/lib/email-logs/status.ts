import type { EmailEventType, EmailLogStatus } from "./types";

interface StatusMeta {
  label: string;
  badgeClass: string;
}

export const EMAIL_STATUS_META: Record<EmailLogStatus, StatusMeta> = {
  QUEUED: {
    label: "Kuyrukta",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-300",
  },
  SENDING: {
    label: "Gönderiliyor",
    badgeClass: "bg-zinc-100 text-zinc-800 border-zinc-300",
  },
  SENT: {
    label: "Gönderildi",
    badgeClass: "bg-zinc-50 text-zinc-600 border-zinc-200",
  },
  // V2-1 — Resend webhook tracking
  DELIVERED: {
    label: "Teslim Edildi",
    badgeClass: "bg-success-50 text-success-700 border-success-200",
  },
  OPENED: {
    label: "Açıldı",
    badgeClass: "bg-zinc-100 text-zinc-700 border-zinc-300",
  },
  CLICKED: {
    label: "Tıklandı",
    badgeClass: "bg-zinc-900 text-white border-zinc-900",
  },
  BOUNCED: {
    label: "Geri Döndü",
    badgeClass: "bg-danger-50 text-danger-700 border-danger-200",
  },
  COMPLAINED: {
    label: "Şikayet",
    badgeClass: "bg-danger-100 text-danger-800 border-danger-300",
  },
  FAILED: {
    label: "Başarısız",
    badgeClass: "bg-warning-50 text-warning-700 border-warning-200",
  },
};

export const EMAIL_STATUS_ORDER: EmailLogStatus[] = [
  "QUEUED",
  "SENDING",
  "SENT",
  "DELIVERED",
  "OPENED",
  "CLICKED",
  "BOUNCED",
  "COMPLAINED",
  "FAILED",
];

export const EMAIL_EVENT_META: Record<
  EmailEventType,
  { label: string; iconColor: string; iconBg: string; iconBorder: string }
> = {
  SENT: {
    label: "Gönderildi",
    iconColor: "text-zinc-600",
    iconBg: "bg-zinc-100",
    iconBorder: "border-zinc-200",
  },
  DELIVERED: {
    label: "Teslim Edildi",
    iconColor: "text-success-600",
    iconBg: "bg-success-50",
    iconBorder: "border-success-200",
  },
  DELIVERY_DELAYED: {
    label: "Teslim Gecikti",
    iconColor: "text-warning-600",
    iconBg: "bg-warning-50",
    iconBorder: "border-warning-200",
  },
  OPENED: {
    label: "Açıldı",
    iconColor: "text-zinc-700",
    iconBg: "bg-zinc-100",
    iconBorder: "border-zinc-300",
  },
  CLICKED: {
    label: "Tıklandı",
    iconColor: "text-zinc-900",
    iconBg: "bg-zinc-100",
    iconBorder: "border-zinc-400",
  },
  BOUNCED: {
    label: "Geri Döndü",
    iconColor: "text-danger-600",
    iconBg: "bg-danger-50",
    iconBorder: "border-danger-200",
  },
  COMPLAINED: {
    label: "Şikayet Edildi",
    iconColor: "text-danger-700",
    iconBg: "bg-danger-100",
    iconBorder: "border-danger-300",
  },
  FAILED: {
    label: "Başarısız",
    iconColor: "text-warning-600",
    iconBg: "bg-warning-50",
    iconBorder: "border-warning-200",
  },
};

/**
 * EmailLog.template değerleri → etiket. Kaynak: packages/email `EmailTemplateData`
 * birliği + API'nin iç `suppression_clear` işareti. Eski harita yalnız artık
 * üretilmeyen demo şablonlarını içeriyordu; filtre hep boş dönüyordu (derin
 * denetim LU-13). Yeni şablon eklenince BURAYA da eklenmeli.
 */
export const EMAIL_TEMPLATE_LABELS: Record<string, string> = {
  notification: "Bildirim",
  password_reset: "Şifre sıfırlama",
  referral_invite: "Davet (kayıtsız firma)",
  tender_external_invite: "Alım talebi — dış tedarikçi daveti",
  tender_invite_digest: "Alım talebi — davet özeti",
  suppression_clear: "Engel kaldırma (iç kayıt)",
};

export function getTemplateLabel(template: string): string {
  return EMAIL_TEMPLATE_LABELS[template] ?? template;
}

/**
 * API `REDACTED_CONTEXT_TYPES` (apps/api email.service.ts) ile BİREBİR:
 * tek kullanımlık kod/davet jetonu taşıyan türlerde payload maskeli saklanır,
 * API yeniden gönderimi 400 ile reddeder — düğme hiç çizilmez.
 */
const REDACTED_CONTEXT_TYPES = new Set([
  "password_reset",
  "login_2fa",
  "email_verify",
  "referral_invite",
  "tender_external_invite",
  "company_user_invitation",
  "public_inquiry_verify",
]);

export type EmailResendBlock = "internal" | "redacted" | null;

/**
 * Kayıt yeniden gönderilebilir mi? İç kayıt (engel kaldırma işareti,
 * provider="internal") gerçek e-posta değildir; gizli içerikli kayıtta
 * payload maskelidir (arayüz testi O-078). API aynı kuralla reddeder.
 */
export function emailResendBlock(log: {
  provider: string;
  template: string;
  contextType: string | null;
  payload: unknown;
}): EmailResendBlock {
  if (log.provider === "internal" || log.template === "suppression_clear") {
    return "internal";
  }
  const redactedPayload =
    !!log.payload &&
    typeof log.payload === "object" &&
    "__redacted" in (log.payload as Record<string, unknown>);
  if (
    redactedPayload ||
    (log.contextType && REDACTED_CONTEXT_TYPES.has(log.contextType))
  ) {
    return "redacted";
  }
  return null;
}

/**
 * EmailLog.contextType → okunur bağlam (arayüz testi D-144). Bildirim
 * e-postalarında bağlam bildirim türüdür; bilinmeyen tür ham kodla gösterilir.
 */
export const EMAIL_CONTEXT_LABELS: Record<string, string> = {
  password_reset: "Şifre sıfırlama",
  login_2fa: "Giriş doğrulama kodu",
  email_verify: "E-posta doğrulama kodu",
  referral_invite: "Firma daveti (kayıtsız)",
  tender_external_invite: "Talebe dış tedarikçi daveti",
  company_user_invitation: "Ekip daveti",
  company_ownership_transferred: "Firma sahipliği devri",
  public_inquiry_verify: "Bilgi talebi — e-posta doğrulama",
  public_inquiry_received: "Bilgi talebi alındı",
  public_inquiry_reply: "Bilgi talebine yanıt",
  message_received: "Yeni mesaj",
  order_status_changed: "Sipariş durumu değişti",
  membership_downgraded: "Üyelik sona erdi",
  approval_pending: "Onay bekleniyor",
  approval_decided: "Onay sonuçlandı",
  listing_invitation: "Talebe davet",
  listing_invitation_ai: "Talebe davet (AI önerisi)",
  listing_invitation_digest: "Akşam özeti (AI davetleri)",
  listing_reminder: "Talep kapanış hatırlatması",
  listing_reminder_ai: "Talep kapanış hatırlatması (AI daveti)",
  listing_category_match: "Kategori eşleşmesi",
  listing_category_digest: "Akşam özeti (kategori)",
  listing_zero_bid: "Teklifsiz talep hatırlatması",
  listing_new_round: "Yeni teklif turu",
  listing_closed: "Talep kapandı",
  listing_closed_owner: "Talep kapandı (sahibine)",
  listing_evaluation_reminder: "Değerlendirme hatırlatması",
  bid_awarded: "Teklif kazandı",
  bid_lost: "Teklif kazanamadı",
  bid_eliminated: "Teklif elendi",
  ai_supplier_suggestions: "AI tedarikçi önerisi",
  lifecycle_profile: "Karşılama: profil",
  lifecycle_first_product: "Karşılama: ilk ürün",
  lifecycle_verify: "Karşılama: doğrulama",
  lifecycle_market: "Karşılama: pazar",
  lifecycle_weekly: "Haftalık görünürlük özeti",
  suppression_clear: "Engel kaldırma (iç kayıt)",
};

export function getContextLabel(contextType: string): string {
  return EMAIL_CONTEXT_LABELS[contextType] ?? contextType;
}
