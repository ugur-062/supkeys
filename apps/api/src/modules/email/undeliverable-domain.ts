/**
 * TESLİM EDİLEMEZ ALAN ADI KAPISI (canlı öncesi son tur, 2026-10-05).
 *
 * Staging tohum tedarikçileri `demir@demofill.local` gibi adresler taşıyor; tek
 * bir e2e koşusu bu adreslere 9 bildirim gönderdi ve hepsi ORTAK `rothern.com`
 * Resend alan adı üzerinden BOUNCE etti. Sıçrama oranı alan adı itibarını
 * düşürür — canlı e-postalar da spam/promosyon klasörüne kayar. Bu adreslere
 * hiçbir zaman teslim edilemez (RFC 2606 / 6761 özel kullanımlı adlar), o
 * yüzden sağlayıcıya HİÇ gitmez: `EmailService` gönderimi suppression gibi
 * atlar (FAILED + `suppressed:` önekli neden, yeniden deneme/alarm yok).
 *
 * Saf fonksiyon: DB'ye gitmez, gönderim yolunun en başında koşar.
 */

/** Özel kullanımlı / yönlendirilmeyen üst düzey alan adları. */
export const UNDELIVERABLE_TLDS: ReadonlySet<string> = new Set([
  "local",
  "test",
  "invalid",
  "example",
  "localhost",
  "internal",
]);

/** Belge örnekleri için ayrılmış alan adları (alt alan adları dahil). */
export const UNDELIVERABLE_DOMAINS: ReadonlySet<string> = new Set([
  "example.com",
  "example.net",
  "example.org",
]);

/**
 * Adres teslim edilemez bir alan adına mı gidiyor? Evetse günlüğe yazılacak
 * kısa neden (adres İÇERMEZ — yalnız alan adı sınıfı), değilse `null`.
 */
export function undeliverableEmailReason(email: string): string | null {
  const value = (email ?? "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return "geçersiz adres (alan adı yok)";
  // Sondaki kök noktası ("firma.local.") aynı alan adıdır.
  const domain = value.slice(at + 1).replace(/\.+$/, "");
  if (!domain.includes(".")) return "noktasız alan adı";
  const labels = domain.split(".");
  if (labels.some((l) => l === "")) return "geçersiz alan adı";
  const tld = labels[labels.length - 1]!;
  if (UNDELIVERABLE_TLDS.has(tld)) return `özel kullanımlı alan adı (.${tld})`;
  const base = labels.slice(-2).join(".");
  if (UNDELIVERABLE_DOMAINS.has(base)) return `örnek alan adı (${base})`;
  return null;
}
