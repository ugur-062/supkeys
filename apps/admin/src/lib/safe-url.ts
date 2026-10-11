/**
 * Admin'de kullanıcı-kontrollü URL'leri çizmek için iki yardımcı (arayüz testi
 * O-077, D-157).
 *
 * - `WEB_ORIGIN`: vitrin kökeni. Ürün görsellerinin bir kısmı (ör. kategori
 *   yer tutucuları `/categories/*.webp`) web uygulamasının `public/`
 *   klasöründen gelen GÖRELİ yollardır; admin kökeninde çözülünce 404 olur.
 * - `webAssetUrl`: http(s) mutlak adresi olduğu gibi, kök-göreli yolu (`/x`)
 *   vitrin kökenine bağlayarak döner; başka her şey (javascript:, data:,
 *   `//host`, şemasız metin) → null (görsel/bağlantı çizilmez).
 * - `safeHttpUrl`: YALNIZ açık http/https şemalı adres; aksi hâlde null.
 *   Firmanın girdiği video/dış bağlantı/belge adresleri bağlantı olarak
 *   çizilmeden önce buradan geçer (`javascript:` tıklamada XSS olurdu).
 */
export const WEB_ORIGIN = (process.env.NEXT_PUBLIC_WEB_URL ?? "https://www.rothern.com").replace(/\/+$/, "");

export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!/^https?:\/\//i.test(t)) return null;
  try {
    const u = new URL(t);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname) return null;
    return u.href;
  } catch {
    return null;
  }
}

export function webAssetUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (t.startsWith("/") && !t.startsWith("//")) return `${WEB_ORIGIN}${t}`;
  return safeHttpUrl(t);
}
