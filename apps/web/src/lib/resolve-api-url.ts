/**
 * Security audit D-3 — API base URL resolver.
 *
 * `NEXT_PUBLIC_API_URL` build-time'da set edilmezse production build'inde
 * `localhost:4000` fallback'ine düşer. Bu yanlışlıkla deploy edilirse
 * kullanıcı tarayıcılarından iç network'e (`localhost`) istek yapılır →
 * "kullanıcının kendi cihazındaki bir servisi" çağırma davranışı (DNS rebinding
 * / SSRF-benzeri sürpriz).
 *
 * Kural:
 * - Production'da env zorunlu — eksikse console.error + boş döner (browser'da
 *   axios instance kurulduktan sonra istek atılmaz).
 * - Dev'de fallback OK.
 */
export function resolveApiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (url && url.length > 0) return url;

  if (process.env.NODE_ENV === "production") {
    // Production'da env eksik — log + boş döner. axios isteği fail eder,
    // ama yanlış host'a (localhost) trafik akmaz.
    if (typeof window !== "undefined") {
      console.error(
        "[rothern] NEXT_PUBLIC_API_URL set edilmemiş — production build'inde API isteği yapılamayacak.",
      );
    }
    return "";
  }

  return "http://localhost:4000/api";
}
