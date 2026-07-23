/**
 * Faz AI-0 — AI anahtar sağlık kontrolü (saf fonksiyon + boot değerlendirme;
 * prod-config-sanity deseni).
 *
 * POLİTİKA (fail-closed ama sessiz DEĞİL):
 * - Anahtar YOK → boot devam eder, AI KAPALI (endpoint'ler 503). Prod'da
 *   gürültülü: boot log'una warn + Sentry uyarısı (main.ts).
 * - Anahtar VAR ama placeholder/bozuk → prod'da BOOT ETMEZ (throw): bozuk
 *   anahtarla "AI açık" sanılıp runtime'da her çağrının 502 dönmesi sessiz
 *   kırıktır; deploy'da patlasın.
 */

export type AiKeyStatus = "ok" | "missing" | "placeholder";

const PLACEHOLDER_PATTERNS = [/^change/i, /^your[-_]/i, /^<.*>$/, /^xxx/i];
/** Google AI Studio anahtarları "AIza..." ile başlar ve 30+ karakterdir. */
const MIN_KEY_LENGTH = 20;

export function checkAiKey(key: string | undefined): AiKeyStatus {
  const k = (key ?? "").trim();
  if (k === "") return "missing";
  if (k.length < MIN_KEY_LENGTH || PLACEHOLDER_PATTERNS.some((p) => p.test(k))) {
    return "placeholder";
  }
  return "ok";
}
