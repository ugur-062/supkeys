import axios from "axios";

/**
 * ValidationPipe'ın 400 gövdesindeki ALAN-BAZLI hatalar:
 * `{ message: "Doğrulama hatası", errors: { "items.0.quantity": "..." } }`
 * (üretici: `apps/api/src/main.ts` exceptionFactory).
 *
 * Denetim 2026-08-26 Parça 10 #3: üç interceptor'ın yorumu "component
 * `extractFieldErrors` ile inline gösterir" diyordu ama BÖYLE BİR FONKSİYON
 * YOKTU — her DTO hatası kullanıcıya tek satır "Doğrulama hatası" olarak
 * çıkıyor, hangi alanın neden reddedildiği hiç söylenmiyordu.
 */
export function extractFieldErrors(
  err: unknown,
): Record<string, string> | null {
  if (!axios.isAxiosError(err)) return null;
  const data = err.response?.data as
    | { errors?: Record<string, unknown> }
    | undefined;
  const raw = data?.errors;
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, string> = {};
  for (const [field, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.trim()) out[field] = value;
    else if (Array.isArray(value)) {
      const joined = value.filter((v) => typeof v === "string").join(", ");
      if (joined) out[field] = joined;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Toast'a sığacak kadar alan hatası (fazlası "+N alan daha"). */
const MAX_FIELD_ERRORS_IN_TOAST = 3;

export function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    // #3: alan hataları varsa GENEL mesaj yerine onları göster — kullanıcı
    // hangi alanı düzelteceğini bilsin. (RHF formları `extractFieldErrors`
    // ile alanlara basabilir; bu dal imperatif formlar ve toast'lar için.)
    const fields = extractFieldErrors(err);
    if (fields) {
      const entries = Object.values(fields);
      const shown = entries.slice(0, MAX_FIELD_ERRORS_IN_TOAST).join(" · ");
      const extra = entries.length - MAX_FIELD_ERRORS_IN_TOAST;
      return extra > 0 ? `${shown} (+${extra} alan daha)` : shown;
    }
    const data = err.response?.data as
      | { message?: string | string[] }
      | undefined;
    if (Array.isArray(data?.message)) return data.message.join(", ");
    return data?.message ?? fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * `responseType: "blob"` istekleri için hata mesajı çıkarımı. Hata gövdesi
 * Blob olarak gelir (JSON değil); text'e çevirip `message` alanını ayıkla.
 * PDF indirme gibi blob endpoint'lerinde kullanılır.
 */
export async function extractBlobErrorMessage(
  err: unknown,
  fallback: string,
): Promise<string> {
  if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
    try {
      const text = await err.response.data.text();
      const json = JSON.parse(text) as { message?: string | string[] };
      if (Array.isArray(json.message)) return json.message.join(", ");
      if (typeof json.message === "string") return json.message;
    } catch {
      // Blob JSON değilse fallback'e düş.
    }
  }
  return extractErrorMessage(err, fallback);
}
