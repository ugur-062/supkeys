import { i18nMessage } from "./i18n/http-i18n";
import { BadRequestException } from "@nestjs/common";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Web sitesinden marka bilgisi çekme (OG meta + favicon) — SSRF korumalı.
 * Alıcı (tenant) ve tedarikçi public profil "otomatik doldur" akışları paylaşır.
 */

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 2_000_000;
const MAX_IMAGE_BYTES = 5_000_000;
const ALLOWED_IMG = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface SiteMeta {
  ogImage: string | null;
  logo: string | null;
  description: string | null;
  linkedin: string | null;
  instagram: string | null;
  /** Galeri için aday görsel URL'leri (og:image + sayfadaki <img>'ler, deduplike). */
  images: string[];
  /** Sayfanın temizlenmiş görünür metni (AI "Hakkımızda" üretimi için, ~6000 char). */
  text: string;
}

/**
 * Özel/ayrılmış IP mi (IPv4 ya da IPv6; IPv4-eşlemeli IPv6 IPv4 gibi okunur).
 * Yayın denetimi 2026-09-28 Bölüm 5: host metni kalıpla bakılıyordu —
 * `[::ffff:127.0.0.1]`, `[::]`, `localhost.` ve özel IP'ye çözülen alan adları
 * kapıdan geçiyordu.
 */
export function isPrivateAddress(ipRaw: string): boolean {
  const ip = ipRaw.replace(/^\[|\]$/g, "").toLowerCase();
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (v === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip)?.[1];
    if (mapped) return isPrivateAddress(mapped);
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip);
    if (hex) {
      const hi = parseInt(hex[1]!, 16);
      const lo = parseInt(hex[2]!, 16);
      return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return (
      ip === "::" || ip === "::1" ||
      /^f[cd]/.test(ip) || // ULA fc00::/7
      /^fe[89ab]/.test(ip) || // link-local fe80::/10
      /^ff/.test(ip) || // multicast
      ip.startsWith("64:ff9b:") // NAT64 → iç IPv4'e çevrilebilir
    );
  }
  return false;
}

/** SSRF guard — sadece http(s), private/loopback host'lar bloklu. */
export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new BadRequestException(i18nMessage("api.common.gecersizWebSitesiAdresi"));
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BadRequestException(i18nMessage("api.common.sadeceHttpHttpsAdresleriDesteklenir"));
  }
  // Sondaki nokta (`localhost.`) çözümlemede aynı ada gider.
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  const blocked =
    isPrivateAddress(host) ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "[::1]" ||
    host.startsWith("[fc") ||
    host.startsWith("[fd");
  if (blocked) {
    throw new BadRequestException(i18nMessage("api.common.buAdresCekilemez"));
  }
  return url;
}

/**
 * Host bir alan adıysa çözümlenir; herhangi bir adresi özel ağdaysa ret.
 * Çözümleme ile bağlantı arasında adres değişebilir (DNS rebinding) — tam
 * kapatmak özel bir HTTP ajanı ister; bu kontrol dolaysız yolu kapatır.
 */
async function resolvesToPublic(url: URL): Promise<boolean> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return !isPrivateAddress(host);
  try {
    const addrs = await lookup(host, { all: true, verbatim: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

/**
 * Yanıt gövdesini bayt TAVANI ve toplam SÜRE sınırıyla okur (yayın denetimi
 * 2026-09-28 Bölüm 5): `fetchPublicUrl` zamanlayıcısı gövde okunmadan
 * temizleniyordu ve `arrayBuffer()` gövdeyi tamamen belleğe alıyordu — yavaş
 * akan ya da dev bir sayfa isteği süresiz tutup belleği şişirebiliyordu.
 * Tavan aşılırsa `truncate` ise ilk `maxBytes` döner, değilse `null`;
 * süre dolarsa `null`.
 */
export async function readBodyCapped(
  res: Response,
  maxBytes: number,
  opts: { timeoutMs?: number; truncate?: boolean } = {},
): Promise<Buffer | null> {
  const { timeoutMs = FETCH_TIMEOUT_MS, truncate = false } = opts;
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    for (;;) {
      const step = await Promise.race([reader.read(), deadline]);
      if (step === "timeout") {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      if (step.done) break;
      const chunk = Buffer.from(step.value);
      if (total + chunk.byteLength > maxBytes) {
        void reader.cancel().catch(() => undefined);
        if (!truncate) return null;
        chunks.push(chunk.subarray(0, maxBytes - total));
        total = maxBytes;
        break;
      }
      chunks.push(chunk);
      total += chunk.byteLength;
    }
    return Buffer.concat(chunks, total);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * SSRF-korumalı fetch — yönlendirmeler ELLE takip edilir ve HER adım yeniden
 * `assertPublicHttpUrl`'den geçer. `redirect: "follow"` kullanmak ikinci-derece
 * SSRF bırakıyordu: public bir adres 302 ile `169.254.169.254`/`127.0.0.1`'e
 * yönlendirdiğinde ilk kapı aşılmış oluyordu (denetim 2026-08-23).
 * İlk adres geçersiz/özel ise `BadRequestException` fırlatır; sonraki hatalar
 * (ağ, çok fazla yönlendirme, özel ağa atlama) `null` döner.
 */
export async function fetchPublicUrl(
  raw: string | URL,
  opts: {
    accept?: string;
    timeoutMs?: number;
    maxRedirects?: number;
    userAgent?: string;
  } = {},
): Promise<Response | null> {
  const {
    accept = "text/html,*/*",
    timeoutMs = FETCH_TIMEOUT_MS,
    maxRedirects = 3,
    userAgent = "RothernBot/1.0 (+https://rothern.com)",
  } = opts;
  // İlk adres kapıdan AÇIKÇA geçer (kullanıcı hatalı adres girdiyse mesaj alsın).
  let url = assertPublicHttpUrl(
    typeof raw === "string" ? raw : raw.toString(),
  );
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (!(await resolvesToPublic(url))) return null;
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: "manual",
        headers: { "User-Agent": userAgent, Accept: accept },
      });
      if (res.status < 300 || res.status >= 400) return res;
      const loc = res.headers.get("location");
      if (!loc) return res;
      // Göreli konum mutlaklaştırılır; yeni host yeniden doğrulanır.
      url = assertPublicHttpUrl(new URL(loc, url).toString());
    }
    return null; // çok fazla yönlendirme
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchWithTimeout(
  url: URL,
  accept: string,
): Promise<Response | null> {
  return fetchPublicUrl(url, { accept });
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function metaContent(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1].trim());
  }
  return null;
}

/** HTML'i görünür düz metne indir — script/style/noscript atılır, etiketler boşlukla. */
function htmlToText(html: string, max = 6000): string {
  const text = html
    .replace(/<(script|style|noscript|svg|template)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|section|article|br|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n")
    .trim()
    .slice(0, max);
}

function abs(href: string | null, base: URL): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function parseSiteMeta(html: string, base: URL): SiteMeta {
  const ogImage = abs(
    metaContent(html, [
      /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    ]),
    base,
  );

  const description = metaContent(html, [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  ]);

  const logo =
    abs(
      metaContent(html, [
        /<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i,
        /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*apple-touch-icon[^"']*["']/i,
        /<meta[^>]+property=["']og:logo["'][^>]+content=["']([^"']+)["']/i,
        /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i,
        /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i,
      ]),
      base,
    ) ?? abs("/favicon.ico", base);

  // Sosyal linkler — sayfadaki <a href> içinden (paylaş butonları elenir).
  const linkedin = findSocial(html, "linkedin.com", base);
  const instagram = findSocial(html, "instagram.com", base);

  // Galeri adayları — og:image + sayfadaki <img src>'ler (deduplike, mantıklı filtre).
  const seen = new Set<string>();
  const images: string[] = [];
  const pushImg = (u: string | null) => {
    if (!u) return;
    if (seen.has(u)) return;
    if (/\.svg(\?|$)/i.test(u) || u.startsWith("data:")) return;
    // logo/ikon görünümlü küçük dosyaları ele
    if (/favicon|sprite|icon[-_.]|logo[-_.]?\d*\.(png|jpe?g)/i.test(u)) return;
    seen.add(u);
    images.push(u);
  };
  pushImg(ogImage);
  const imgRe = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null && images.length < 40) {
    pushImg(abs(m[1], base));
  }

  return {
    ogImage,
    logo,
    description,
    linkedin,
    instagram,
    images,
    text: htmlToText(html),
  };
}

/** Sayfadaki ilgili sosyal linki bul — paylaş/share URL'lerini eler. */
function findSocial(html: string, domain: string, base: URL): string | null {
  const re = new RegExp(
    `href=["'](https?:\\/\\/[^"']*${domain.replace(".", "\\.")}[^"']*)["']`,
    "gi",
  );
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) matches.push(m[1]);
  if (matches.length === 0) return null;
  // Paylaş/intent URL'lerini ele, profil/şirket linklerini tercih et.
  const clean = matches.filter(
    (u) => !/share|sharer|intent|sharing|\/shareArticle/i.test(u),
  );
  const pool = clean.length > 0 ? clean : matches;
  const preferred = pool.find((u) =>
    domain === "linkedin.com" ? /\/company\/|\/in\//i.test(u) : true,
  );
  return abs(preferred ?? pool[0], base);
}

/** URL doğrula + HTML çek + OG/favicon meta'sını çıkar. */
export async function fetchSiteMeta(website: string): Promise<SiteMeta> {
  const url = assertPublicHttpUrl(website);
  const res = await fetchWithTimeout(url, "text/html");
  if (!res || !res.ok) {
    throw new BadRequestException(i18nMessage("api.common.webSitesineUlasilamadi"));
  }
  const len = Number(res.headers.get("content-length") ?? "0");
  if (len && len > MAX_HTML_BYTES) {
    throw new BadRequestException(i18nMessage("api.common.webSayfasiCokBuyuk"));
  }
  const buf = await readBodyCapped(res, MAX_HTML_BYTES, { truncate: true });
  if (!buf) throw new BadRequestException(i18nMessage("api.common.webSitesineUlasilamadi"));
  return parseSiteMeta(buf.toString("utf8"), url);
}

/** Görseli indir (SSRF + tip/boyut kontrolü). jpeg/png/webp dışını reddeder. */
export async function downloadImageBuffer(
  imageUrl: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  let url: URL;
  try {
    url = assertPublicHttpUrl(imageUrl);
  } catch {
    return null;
  }
  const res = await fetchWithTimeout(url, "image/*");
  if (!res || !res.ok) return null;
  const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!ALLOWED_IMG.has(ct)) return null;
  const len = Number(res.headers.get("content-length") ?? "0");
  if (len && len > MAX_IMAGE_BYTES) return null;
  const buffer = await readBodyCapped(res, MAX_IMAGE_BYTES);
  if (!buffer || buffer.byteLength === 0) return null;
  return { buffer, contentType: ct };
}

export function extForContentType(ct: string): "png" | "webp" | "jpg" {
  return ct === "image/png" ? "png" : ct === "image/webp" ? "webp" : "jpg";
}
