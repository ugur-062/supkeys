import type { EmailStream } from "./email-streams";

/**
 * ŞİKÂYET GERİ BİLDİRİM BAŞLIKLARI (canlı öncesi sağlamlaştırma, 2026-10-07).
 *
 * Posta sağlayıcılarının "postmaster" panelleri spam şikâyetlerini gönderenin
 * verdiği tanımlayıcıya göre kırar; başlık yoksa şikâyet oranı tek bir toplam
 * sayıdır ve hangi e-posta türünün şikâyet aldığı görülemez.
 *
 * 1) Gmail Feedback Loop (Google Postmaster Tools) — biçim:
 *
 *        Feedback-ID: a:b:c:SenderId
 *
 *    `a`, `b`, `c` İSTEĞE BAĞLI üç tanımlayıcıdır (kampanya / müşteri / tür…),
 *    `SenderId` ZORUNLUDUR: gönderenin seçtiği, tüm posta akışında SABİT kalan
 *    5–15 karakterlik benzersiz kimlik. Alanlar `:` ile ayrılır; Gmail veriyi
 *    SAĞDAN başlayarak tanımlayıcı başına toplar ve yalnız yeterli hacim +
 *    kayda değer şikâyet oranı olan tanımlayıcıları gösterir. Ön koşul: ileti,
 *    Postmaster Tools'ta doğrulanmış alan adıyla DKIM imzalı olmalı. Alıcıya
 *    özgü değer (kişi başına benzersiz kimlik) kullanılmaz — hem panelde veri
 *    üretmez hem kişisel veri sızdırır.
 *
 * 2) Yandex Postmaster — AYNI `Feedback-ID` başlığını ve aynı iki nokta
 *    ayrımlı biçimi okur (şikâyet istatistiğini tanımlayıcıya göre kırar);
 *    ayrı bir başlık gerekmez.
 *
 * 3) Mail.ru Postmaster — gönderim türüne göre istatistik için:
 *
 *        X-Mailru-Msgtype: <tür>
 *
 *    Değer gönderenin seçtiği kısa bir ASCII belirteçtir (ör. `password_reset`);
 *    Postmaster paneli teslim / şikâyet / okunma sayılarını bu türe göre ayırır.
 *
 * Değerlerimiz:
 *    a = bağlam tipi (`listing_invitation`, `email_verify`…; bağlam yoksa
 *        şablon adı) — şikâyetin hangi e-posta TÜRÜNE geldiği
 *    b = akış (`TRANSACTIONAL` / `ACTIVITY` / `NOTIFICATION` / `INVITE` /
 *        `LIFECYCLE`) — gönderen adresiyle birebir
 *    c = ortam (`prod` / `staging` / `dev`) — staging gönderimleri canlı
 *        istatistiğini kirletmesin
 *    SenderId = `rothern` (7 karakter, sabit)
 *
 * GÜVENLİK: değerler yalnız `[A-Za-z0-9_-]` taşır (başlık enjeksiyonu / `:`
 * ile alan kayması olmaz), uzunluk sınırlıdır ve KİŞİSEL VERİ içermez: bağlam
 * KİMLİĞİ (`context.id`), alıcı adresi ve firma adı başlığa HİÇ girmez; e-posta
 * adresine benzeyen bir tip değeri de (`@` içeren) `other` olarak yazılır.
 *
 * Bu başlıklar çıkış (unsubscribe) başlığı DEĞİLDİR: Gmail'in "bülten"
 * sınıflandırmasını tetiklemez, o yüzden ACTIVITY ve işlem akışında da basılır
 * (`List-Unsubscribe` kuralı aynen korunur — bkz. `carriesOneClickUnsubscribe`).
 */

/** Gmail FBL `SenderId` — sabit, 5–15 karakter. */
export const FEEDBACK_SENDER_ID = "rothern";

export const FEEDBACK_ID_HEADER = "Feedback-ID";
export const MAILRU_MSGTYPE_HEADER = "X-Mailru-Msgtype";

/** Tek alanın üst sınırı (en uzun bağlam tipimiz ~30 karakter). */
export const FEEDBACK_FIELD_MAX_LENGTH = 40;
/** Bağlam tipi ve şablon adı yoksa / kullanılamıyorsa yazılan değer. */
export const FEEDBACK_FALLBACK_TYPE = "other";

export type FeedbackEnvironment = "prod" | "staging" | "dev";

/**
 * Serbest metni başlık belirtecine çevirir: yalnız `[A-Za-z0-9_-]`, baş/son
 * ayırıcı yok, en fazla `FEEDBACK_FIELD_MAX_LENGTH` karakter. Boş kalırsa ya
 * da e-posta adresine benziyorsa (`@`) `other`.
 */
export function sanitizeFeedbackToken(value: string | undefined | null): string {
  if (typeof value !== "string" || value.includes("@")) return FEEDBACK_FALLBACK_TYPE;
  const token = value
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .slice(0, FEEDBACK_FIELD_MAX_LENGTH)
    .replace(/^[_-]+|[_-]+$/g, "");
  return token || FEEDBACK_FALLBACK_TYPE;
}

/**
 * Ortam etiketi. Staging de `NODE_ENV=production` ile koşar, o yüzden önce
 * açık `APP_ENV`, sonra `SENTRY_ENVIRONMENT`, en son `NODE_ENV` okunur.
 * Tanınmayan / boş değer `dev` (canlı istatistiğine karışmaz).
 */
export function feedbackEnvironment(get: (key: string) => string | undefined): FeedbackEnvironment {
  for (const key of ["APP_ENV", "SENTRY_ENVIRONMENT", "NODE_ENV"]) {
    const raw = get(key);
    const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!v) continue;
    if (v === "production" || v === "prod" || v === "live") return "prod";
    if (v === "staging" || v === "stage" || v === "preview") return "staging";
    return "dev";
  }
  return "dev";
}

/**
 * Bir e-postanın geri bildirim başlıkları — saf fonksiyon. `contextType`
 * yoksa şablon adı kullanılır (ikisi de kod sabitidir, alıcı verisi değil).
 */
export function feedbackHeaders(input: {
  contextType?: string | null;
  template?: string | null;
  stream: EmailStream;
  environment: FeedbackEnvironment;
}): Record<string, string> {
  const type = sanitizeFeedbackToken(input.contextType || input.template);
  return {
    [FEEDBACK_ID_HEADER]: `${type}:${input.stream}:${input.environment}:${FEEDBACK_SENDER_ID}`,
    [MAILRU_MSGTYPE_HEADER]: type,
  };
}
