import { MAX_LISTING_HORIZON_MS } from "@rothern/shared";

/**
 * Kapanış tarihi doğrulaması — TEK KAYNAK. Backend ile birebir: gelecekte VE
 * en fazla now + 2 yıl (`MAX_LISTING_HORIZON_MS`; üst sınır yoksa closesAt=9999
 * auto-close cron'unu hiç tetiklemez). Hem sihirbaz zod şeması hem ad-hoc
 * formlar (yeni-tur / kapanış değiştir) bunu kullanır → iki yerde kural
 * tekrarı/drift yok.
 *
 * i18n Faz 2: kural metinden AYRI — `closesAtErrorKey` yalnız ANAHTAR döner
 * (`web.panel.requests.closesAt.<anahtar>`), metni çağıranın `t`si basar;
 * `closesAtError` aynı işi çevirmeni ZORUNLU alarak yapar (Türkçe yedek
 * sözlük kaldırıldı — tek kaynak katalog).
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

/** Geçerliyse `null`, değilse kullanıcı-yüzü hata mesajı (çağıranın dilinde). */
export function closesAtError(value: string | null | undefined, t: ClosesAtTranslate): string | null {
  const key = closesAtErrorKey(value);
  return key ? t(key) : null;
}
