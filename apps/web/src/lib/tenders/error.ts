import axios from "axios";

export function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
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
