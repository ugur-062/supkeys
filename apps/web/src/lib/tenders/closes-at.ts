import { MAX_LISTING_HORIZON_MS } from "@rothern/shared";

/**
 * Kapanış tarihi doğrulaması — TEK KAYNAK. Backend ile birebir: gelecekte VE
 * en fazla now + 2 yıl (`MAX_LISTING_HORIZON_MS`; üst sınır yoksa closesAt=9999
 * auto-close cron'unu hiç tetiklemez). Geçerliyse `null`, değilse kullanıcı-yüzü
 * hata mesajı. Hem sihirbaz zod şeması hem ad-hoc formlar (yeni-tur / kapanış
 * değiştir) bunu kullanır → iki yerde kural tekrarı/drift yok.
 */
export function closesAtError(value: string | null | undefined): string | null {
  if (!value) return "Kapanış tarihi girin";
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "Geçerli bir kapanış tarihi girin";
  if (t <= Date.now()) return "Kapanış tarihi gelecekte olmalı";
  if (t > Date.now() + MAX_LISTING_HORIZON_MS)
    return "Kapanış tarihi çok ileri (en fazla 2 yıl)";
  return null;
}
