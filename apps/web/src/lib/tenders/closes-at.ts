import { MAX_LISTING_HORIZON_MS } from "@rothern/shared";

/**
 * Kapanış tarihi doğrulaması — TEK KAYNAK. Backend ile birebir: gelecekte VE
 * en fazla now + 2 yıl (`MAX_LISTING_HORIZON_MS`; üst sınır yoksa closesAt=9999
 * auto-close cron'unu hiç tetiklemez). Hem sihirbaz zod şeması hem ad-hoc
 * formlar (yeni-tur / kapanış değiştir) bunu kullanır → iki yerde kural
 * tekrarı/drift yok.
 *
 * i18n Faz 2: kural metinden ayrıldı — `closesAtErrorKey` yalnız ANAHTAR
 * döner (`web.panel.requests.closesAt.<anahtar>`), metni çağıranın `t`si
 * basar. `closesAtError` eski imzayı korur; `t` verilmezse Türkçe yedek
 * (geçiş dönemi — çeviri bağlamı olmayan eski çağrı yerleri için).
 */
export type ClosesAtErrorKey = "required" | "invalid" | "mustBeFuture" | "tooFar";
export type ClosesAtTranslate = (key: ClosesAtErrorKey) => string;

/** Geçerliyse `null`, değilse mesaj anahtarı. */
export function closesAtErrorKey(value: string | null | undefined): ClosesAtErrorKey | null {
  if (!value) return "required";
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "invalid";
  if (t <= Date.now()) return "mustBeFuture";
  if (t > Date.now() + MAX_LISTING_HORIZON_MS) return "tooFar";
  return null;
}

/** Türkçe yedek — `t` vermeyen eski çağrı yerleri (katalogla birebir). */
const CLOSES_AT_MESSAGES_TR: Record<ClosesAtErrorKey, string> = {
  required: "Kapanış tarihi girin",
  invalid: "Geçerli bir kapanış tarihi girin",
  mustBeFuture: "Kapanış tarihi gelecekte olmalı",
  tooFar: "Kapanış tarihi çok ileri (en fazla 2 yıl)",
};
export const closesAtMessageTr: ClosesAtTranslate = (key) => CLOSES_AT_MESSAGES_TR[key];

/** Geçerliyse `null`, değilse kullanıcı-yüzü hata mesajı (istenen dilde). */
export function closesAtError(value: string | null | undefined, t: ClosesAtTranslate = closesAtMessageTr): string | null {
  const key = closesAtErrorKey(value);
  return key ? t(key) : null;
}
