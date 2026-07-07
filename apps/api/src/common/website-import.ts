import { BadRequestException } from "@nestjs/common";

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

/** SSRF guard — sadece http(s), private/loopback host'lar bloklu. */
export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new BadRequestException("Geçersiz web sitesi adresi");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BadRequestException("Sadece http/https adresleri desteklenir");
  }
  const host = url.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
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
    throw new BadRequestException("Bu adres çekilemez");
  }
  return url;
}

async function fetchWithTimeout(
  url: URL,
  accept: string,
): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "RothernBot/1.0 (+https://rothern.com)",
        Accept: accept,
      },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
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
    throw new BadRequestException("Web sitesine ulaşılamadı");
  }
  const len = Number(res.headers.get("content-length") ?? "0");
  if (len && len > MAX_HTML_BYTES) {
    throw new BadRequestException("Web sayfası çok büyük");
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const html = buf.subarray(0, MAX_HTML_BYTES).toString("utf8");
  return parseSiteMeta(html, url);
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
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) return null;
  return { buffer, contentType: ct };
}

export function extForContentType(ct: string): "png" | "webp" | "jpg" {
  return ct === "image/png" ? "png" : ct === "image/webp" ? "webp" : "jpg";
}
