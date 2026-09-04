/**
 * Görsel optimize edilebilir mi — yani host'u `next.config` `remotePatterns`
 * içinde mi.
 *
 * `next/image` yapılandırılmamış bir uzak host'u REDDEDER (build/runtime
 * hatası). Bu yüzden bileşenler önce burayı sorar; tanımsız host düz `<img>`
 * ile gösterilir. Görselin hiç görünmemesindense optimize edilmemiş
 * görünmesi iyidir.
 *
 * Host listesi `NEXT_PUBLIC_CDN_URL`den okunur — `next.config` ile AYNI
 * kaynak. İkisi ayrışırsa `next/image` reddettiği bir görseli optimize
 * etmeye çalışır ve sayfa kırılır.
 */
function cdnHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_CDN_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

export function optimizable(src: string): boolean {
  const host = cdnHost();
  if (!host) return false;
  try {
    return new URL(src).hostname === host;
  } catch {
    // Göreli yol (aynı origin) — optimize edilebilir.
    return src.startsWith("/");
  }
}

/**
 * Stok/temsilî görsel mi — demo doluluk seti (`seed-marketplace-demo`)
 * loremflickr'dan çekiyor; kartta "Temsili görsel" etiketi basılır ki ziyaretçi
 * fotoğrafı ürünün kendisi sanmasın. Firma yüklemesi (CDN) etiket ALMAZ.
 */
const STOCK_HOSTS = ["loremflickr.com", "picsum.photos", "images.unsplash.com", "source.unsplash.com"];

export function isStockImage(src: string | null | undefined): boolean {
  if (!src) return false;
  try {
    return STOCK_HOSTS.includes(new URL(src).hostname);
  } catch {
    return false;
  }
}
