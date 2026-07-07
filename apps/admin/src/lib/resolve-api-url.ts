/**
 * Security audit D-3 — API base URL resolver (admin panel).
 * Bkz. `apps/web/src/lib/resolve-api-url.ts` — aynı rasyonel.
 */
export function resolveApiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (url && url.length > 0) return url;

  if (process.env.NODE_ENV === "production") {
    if (typeof window !== "undefined") {
      console.error(
        "[rothern-admin] NEXT_PUBLIC_API_URL set edilmemiş — production build'inde API isteği yapılamayacak.",
      );
    }
    return "";
  }

  return "http://localhost:4000/api";
}
