import { safeRedirect } from "@/lib/public/visibility";

/**
 * GİRİŞ SONRASI DÖNÜŞ ADRESİ (`/company/login?next=…`) — yalnız panel içi yol.
 *
 * Sınır NORMALLEŞTİRİLMİŞ yola uygulanır (arayüz testi 2026-10 login-12):
 * ham metnin `/company/` ile başlaması yetmez — yönlendirici `/company/../urunler`
 * ve `/company/%2e%2e/urunler` adreslerini `/urunler`e indirger, kullanıcı
 * panel dışına düşerdi. Dış köke giden biçimler (`//host`, `\`, `://`,
 * denetim karakteri) baştan reddedilir.
 *
 * GİRİŞ SAYFASININ KENDİSİ hedef olamaz (kayıt denetimi 2026-10 web-auth-5):
 * `?next=/company/login` ile giriş sayfası kendi adresine yönleniyor,
 * yönlendirme efekti bir daha çalışmıyor ve girişli ziyaretçiye form
 * çizilmediği için sayfa yükleme kutusunda kalıyordu.
 *
 * Kabul edilmeyen her değer panoya (`/company`) düşer.
 */
const FALLBACK = "/company";
const BASE = "http://n";
const LOGIN_PATH = "/company/login";

/**
 * Yol giriş sayfasının kendisi mi? Sondaki eğik çizgi (yönlendirici atar) ve
 * yüzde kaçışlı yazım (`/company/%6cogin`; sunucu çözerek eşler) aynı sayfadır.
 */
function isLoginPage(path: string): boolean {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // Bozuk kaçış dizisi: ham yol karşılaştırılır.
  }
  return decoded === LOGIN_PATH || decoded === `${LOGIN_PATH}/`;
}

export function safeNextPath(value: string | null | undefined): string {
  const raw = safeRedirect(value);
  if (!raw || raw.includes("//") || raw.includes("://")) return FALLBACK;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return FALLBACK;
  }
  if (url.origin !== BASE) return FALLBACK;
  const path = url.pathname;
  // Yol sınırında eşleşme: /companyfoo gibi lookalike'lar reddedilir.
  if (path !== "/company" && !path.startsWith("/company/")) return FALLBACK;
  if (isLoginPage(path)) return FALLBACK;
  return `${path}${url.search}${url.hash}`;
}

/**
 * KAYIT ↔ GİRİŞ BAĞLANTILARI dönüş hedefini taşır (arayüz testi 2026-10
 * code-auth-8). Davet e-postasındaki `/company/kayit?ref=…&redirect=…`
 * bağlantısına hesabı olan biri gelince "Giriş yap" çıplak `/company/login`e
 * gidiyor, girişten sonra davet edildiği talep açılmıyordu; ters yönde
 * `/company/login?next=…` → "Kayıt ol" `redirect`i düşürüyordu.
 *
 * Kayıt `redirect` (+ `intent`, `ref`), giriş `next` okur; iki sayfa da
 * karşı tarafın parametrelerini AYNEN geri taşır (gidip dönünce kaybolmaz).
 */
export interface AuthLinkParams {
  /** Dönüş yolu: kayıtta `redirect`, girişte `next`. */
  target?: string | null;
  /** Davet (referral) jetonu. */
  ref?: string | null;
  /** Kayıt niyeti (`signup-intent.ts`). */
  intent?: string | null;
}

function withQuery(path: string, entries: Array<[string, string | null | undefined]>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of entries) if (v) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Kayıt sayfasından giriş sayfasına. */
export function loginLinkFromSignup({ target, ref, intent }: AuthLinkParams): string {
  return withQuery("/company/login", [
    ["next", safeRedirect(target)],
    ["ref", ref],
    ["intent", intent],
  ]);
}

/** Giriş sayfasından kayıt sayfasına. */
export function signupLinkFromLogin({ target, ref, intent }: AuthLinkParams): string {
  return withQuery("/company/kayit", [
    ["intent", intent],
    ["redirect", safeRedirect(target)],
    ["ref", ref],
  ]);
}
