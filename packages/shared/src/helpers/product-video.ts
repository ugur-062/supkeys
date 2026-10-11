/**
 * ÜRÜN VİDEOSU — gömülebilir adres tek kaynağı (arayüz testi Y-11).
 *
 * Silver paketi "ürün belgesi ve video" vaat ediyor, ürün formu "ürün
 * sayfasında gömülü oynatılır" diyor; video adresi yalnız uzunlukla
 * doğrulanıyor ve hiçbir sayfada çizilmiyordu. Kural İZİNLİ LİSTE:
 * YouTube ve Vimeo. Başka her adres (ve `javascript:` gibi şemalar) `null`
 * döner — API kaydı reddeder, web çizmez. YouTube çerezsiz alana
 * (`youtube-nocookie.com`) çevrilir; CSP `frame-src` yalnız bu iki konağı açar.
 */
export const PRODUCT_VIDEO_FRAME_HOSTS = [
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
] as const;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{1,12}$/;

function parseHttpsUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Gömme adresi (`https://www.youtube-nocookie.com/embed/<id>` ya da Vimeo oynatıcısı); izinsizse null. */
export function productVideoEmbedUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const url = parseHttpsUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  let youtubeId: string | null = null;
  if (host === "youtu.be") youtubeId = parts[0] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch") youtubeId = url.searchParams.get("v");
    else if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") youtubeId = parts[1] ?? null;
  }
  if (youtubeId) {
    return YOUTUBE_ID.test(youtubeId) ? `https://www.youtube-nocookie.com/embed/${youtubeId}` : null;
  }

  let vimeoId: string | null = null;
  if (host === "vimeo.com") vimeoId = parts[0] ?? null;
  else if (host === "player.vimeo.com" && parts[0] === "video") vimeoId = parts[1] ?? null;
  if (vimeoId && VIMEO_ID.test(vimeoId)) return `https://player.vimeo.com/video/${vimeoId}`;
  return null;
}

/** Dış bağlantı (ürünün üretici sayfası) yalnız https — `javascript:`/`data:` kaydedilmez. */
export function isHttpsUrl(raw: string | null | undefined): boolean {
  return !!raw && parseHttpsUrl(raw) !== null;
}
