export type EmailTemplate =
  | "password_reset"
  | "referral_invite"
  | "tender_external_invite"
  | "tender_invite_digest"
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
  /**
   * Tek tık "davet almak istemiyorum" (`/davet-kapat?token=`) — dış talep
   * davetiyle AYNI mekanizma (İYS/ETK hijyeni). Eski çağıranlar için isteğe
   * bağlı; verilmezse bağlantı satırı çizilmez.
   */
  optOutUrl?: string;
}

/** Dış talep davetinde bir kalem satırı ("Çelik boru — 1.200 m"). */
export interface TenderExternalInviteItem {
  /** Kalem adı — alıcının dilinde (talep çevirisi hazırsa). */
  name: string;
  quantity: number;
  /** Katalog birim kodu (`PCE`, `KG`…) → etiket alıcının dilinde; yoksa serbest `unit`. */
  unitCode: string | null;
  unit: string;
}

/**
 * Faz C — dış talep daveti (2026-09-27 zenginleşti, kullanıcı: "kalemler
 * hakkında bilgi verilmeli ki şirkete cazip gelsin"). Her metin ALICININ
 * dilinde. Kapalı zarf ve anonimlik: hedef fiyat, marka/MPN/açıklama/
 * şartname, belgeler, ticari şartlar, tam adres, teklif sayısı ve diğer
 * davetliler bu yüke HİÇ girmez (alan yok — şablon basamaz).
 */
export interface TenderExternalInviteData {
  inviterName: string;
  tenderTitle: string;
  /** Talep numarası (`ROT-000042`); taslakta yok. */
  tenderNumber?: string | null;
  /** Kategori adları — alıcının dilinde ("Kategori/Kategoriler" çoğulu sayıdan). */
  categories: string[];
  closesAt: string | null;
  /** İlk kalemler (en fazla `INVITE_ITEM_PREVIEW`). */
  items?: TenderExternalInviteItem[];
  /** Toplam kalem sayısı — gösterilmeyenler "+N kalem daha". */
  itemCount?: number;
  /** Teslim yeri — YALNIZ şehir + ülke, alıcının dilinde. */
  deliveryPlace?: string | null;
  /** Aranan tedarikçi tipi (faaliyet kodları: `MANUFACTURER`…). */
  supplierTypes?: string[];
  /** Herkese açık talep sayfası (vitrindeyse), alıcının dilindeki adres. */
  publicUrl?: string | null;
  registerUrl: string;
  optOutUrl: string;
  /**
   * Kayıt olmadan talebin tüm kalemlerini gösteren jetonlu önizleme
   * (2026-09-27, Faz 3) — verilirse ikincil bağlantı olarak basılır.
   */
  previewUrl?: string | null;
  /**
   * Kapanıştan önceki TEK hatırlatma (2026-09-27) — konu, başlık ve giriş
   * cümlesi hatırlatma sürümüyle basılır; içerik aynı.
   */
  reminder?: boolean;
}

/** Özet e-postasında bir talep daveti (içerik kuralları tekli davetle aynı). */
export interface TenderInviteDigestEntry {
  inviterName: string;
  /**
   * Davet edeni tekilleştirme anahtarı (opak; gösterilmez). Adını gizleyen
   * her alıcının görünen adı aynı nötr metin olduğundan konu satırı ada göre
   * sayınca farklı anonim alıcılar tek firma sanılıyordu (derin denetim
   * LU-09). Yoksa `inviterName`e düşülür.
   */
  inviterKey?: string;
  /** Alıcı adını gizledi (görünen ad nötr metin) — konuda ilk ad olarak seçilmez. */
  inviterAnonymous?: boolean;
  tenderTitle: string;
  tenderNumber?: string | null;
  closesAt: string | null;
  deliveryPlace?: string | null;
  /** İlk kalemler (özette en fazla 3). */
  items?: TenderExternalInviteItem[];
  itemCount?: number;
  /** Kayıt + talebe dönüş bağlantısı (o davet edenin jetonu). */
  ctaUrl: string;
}

/**
 * Aynı kayıtsız adrese bekleyen BİRDEN ÇOK talep daveti TEK e-postada
 * (2026-09-27, kullanıcı: "aynı kişiye sık değil"): adres başına 7 günde bir
 * e-posta kuralında bekleyen davetler kaybolmaz, burada birlikte gider.
 */
export interface TenderInviteDigestData {
  invites: TenderInviteDigestEntry[];
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
      template: "tender_invite_digest";
      data: TenderInviteDigestData;
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
  /**
   * Ek başlıklar — ör. `List-Unsubscribe` + `List-Unsubscribe-Post`
   * (RFC 8058 tek tık çıkış; Gmail/Yahoo/Outlook toplu gönderici kuralı).
   */
  headers?: Record<string, string>;
  /**
   * Sağlayıcı tarafı tekilleştirme anahtarı (Resend `Idempotency-Key`, 24 sa).
   * Aynı anahtarla yinelenen istek İKİNCİ e-posta göndermez, ilk yanıtı
   * döndürür — yeniden denemeler bu sayede çift e-posta üretmez
   * (derin denetim Y-08 gözden geçirme).
   */
  idempotencyKey?: string;
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
