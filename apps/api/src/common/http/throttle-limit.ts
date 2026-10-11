import { Logger } from "@nestjs/common";

/**
 * `THROTTLE_*` ortam değişkeninden hız sınırı — GEÇERSİZ DEĞER VARSAYILANA DÜŞER
 * (canlı öncesi sağlamlaştırma, 2026-10-07).
 *
 * KÖK NEDEN: `Number(process.env.THROTTLE_DEFAULT_LIMIT ?? 100)` yalnız
 * `undefined`ı yakalar. Render panelinde değeri silinip BOŞ bırakılan anahtar
 * `""` olarak gelir → `Number("")` = 0 → sınır 0 → her istek 429: API tek bir
 * boş kutu yüzünden kilitlenir. `"abc"` → NaN ve negatif değer de aynı sonuca
 * çıkar.
 *
 * Kural: tanımsız → varsayılan (sessiz). Boş / sayı değil / sonsuz / ≤ 0 →
 * varsayılan + UYARI (değerin kendisi yazılır; bu bir sır değildir).
 * Kesirli değer aşağı yuvarlanır; yuvarlanınca 0 kalıyorsa yine varsayılan.
 */
export function resolveThrottleLimit(
  envName: string,
  fallback: number,
  raw: string | undefined = process.env[envName],
  warn: (message: string) => void = (message) => new Logger("Throttle").warn(message),
): number {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  const n = trimmed === "" ? Number.NaN : Number(trimmed);
  const limit = Number.isFinite(n) ? Math.floor(n) : Number.NaN;
  if (Number.isFinite(limit) && limit > 0) return limit;
  warn(
    `${envName}=${JSON.stringify(raw.slice(0, 40))} is invalid (empty, not a number or <= 0) - ` +
      `using the default ${fallback}. Set a positive integer to change the limit, ` +
      "or delete the variable to use the default.",
  );
  return fallback;
}

/** Kod varsayılanları (tek kaynak — app.module.ts ve herkese açık uçlar). */
export const DEFAULT_THROTTLE_LIMIT = 100;
export const DEFAULT_THROTTLE_AUTH_LIMIT = 1000;
export const DEFAULT_THROTTLE_PUBLIC_LIMIT = 600;
