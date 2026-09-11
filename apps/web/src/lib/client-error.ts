import { scrubUrl } from "@/lib/sentry-scrub";

/**
 * ÖN YÜZ HATA BİLDİRİMİ — hafif işaretçi (2026-09-12).
 *
 * Neden Sentry tarayıcı SDK'sı DEĞİL: SDK paylaşılan pakete **83 kB** ekliyordu
 * (103 → 186 kB). Bu ürünün stratejisi organik arama; her herkese açık sayfaya
 * 83 kB bindirmek LCP'yi ve dolayısıyla sıralamayı ödetir. Onun yerine olay
 * yalnızca birkaç alan olarak sunucuya gönderilir, Sentry'e SUNUCUDA yazılır
 * (`/api/client-error`). Maliyet ~1 kB.
 *
 * Kayıp: otomatik iz kırıntıları (breadcrumb) ve oturum takibi. Kazanç: hata
 * artık görünür — daha önce HİÇ görünmüyordu.
 */
const MAX_PER_PAGE = 5;
const MAX_MESSAGE = 500;
const MAX_STACK = 8_000;
let sent = 0;
const seen = new Set<string>();

type ClientErrorContext = { kind?: string; digest?: string; componentStack?: string };

export function reportClientError(error: unknown, context: ClientErrorContext = {}): void {
  if (typeof window === "undefined") return;
  if (sent >= MAX_PER_PAGE) return;

  const err = error instanceof Error ? error : new Error(String(error));
  const key = `${err.name}:${err.message}`.slice(0, 200);
  if (seen.has(key)) return; // aynı hatayı tekrar tekrar gönderme
  seen.add(key);
  sent += 1;

  const payload = {
    name: String(err.name ?? "Error").slice(0, 100),
    message: String(err.message ?? "").slice(0, MAX_MESSAGE),
    stack: String(err.stack ?? "").slice(0, MAX_STACK),
    url: scrubUrl(window.location.href),
    kind: context.kind ?? "window",
    digest: context.digest?.slice(0, 100),
    componentStack: context.componentStack?.slice(0, 2_000),
  };

  // `keepalive`: sayfa değişirken de gitsin. Çerez GÖNDERİLMEZ (credentials:
  // omit) — bildirimin kimliğe ihtiyacı yok, PII yüzeyini açmayalım.
  void fetch("/api/client-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
    credentials: "omit",
  }).catch(() => undefined);
}

let installed = false;

/** `window.onerror` + yakalanmamış promise reddi → tek yol. */
export function installGlobalErrorReporter(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    // Kaynak yükleme hatalarında (img/script) `error` yok — gürültü yapma.
    if (e.error) reportClientError(e.error, { kind: "window.error" });
  });
  window.addEventListener("unhandledrejection", (e) => {
    reportClientError(e.reason, { kind: "unhandledrejection" });
  });
}
