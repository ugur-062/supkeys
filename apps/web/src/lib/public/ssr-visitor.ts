import { cache } from "react";

/**
 * SSR ZİYARETÇİ İLİŞKİLENDİRMESİ (derin denetim MU-12, RM-12).
 *
 * API, `x-rothern-ssr` taşıyan istekleri IP kovası yerine SSR kovasına sayar.
 * Tek ortak kova, önbelleği ıskalayan URL'leri (`/urunler?q=<rastgele>`,
 * `?onizleme=1`, `/firma/<rastgele>`) basan TEK bir ziyaretçinin kovayı
 * doldurup herkesin SSR'ını 429'a düşürmesine izin veriyordu. Bu yüzden
 * DİNAMİK çizimde gerçek ziyaretçi IP'si `x-rothern-client-ip` ile iletilir;
 * API bunu yalnız sır doğrulanınca kabul eder ve ziyaretçi başına kovaya sayar.
 *
 * Önbellek bölünmez: `marketplace-api` önbelleği `unstable_cache` ile (URL, dil)
 * anahtarında tutar; IP yalnız gerçek ıskalamada API'ye gider, anahtara girmez
 * (eskiden `fetch` başlıkları anahtara katıyordu → yalnız parametreli çizim
 * ilişkilendiriliyor, rastgele yol parçası ortak kovaya düşüyordu).
 *
 * YALNIZ ZATEN DİNAMİK çizimde çağır (sayfa `searchParams` okuyor): `headers()`
 * ISR/statik sayfayı dinamiğe çevirir. ISR rotaları (`/talep/[slug]`,
 * `/firma/[slug]/urun/[urunSlug]`) ilişkilendirilemez → rastgele yol kalıntısı
 * Vercel Firewall'daki IP başına kuralda.
 *
 * Akış: dinamik sayfa/metadata veri çekmeden önce `attributeSsrToVisitor()`
 * çağırır; aynı istekteki (React `cache` = istek kapsamı) sonraki pazar yeri
 * çağrıları `ssrVisitorIp()` ile başlığı ekler. İstek dışı (rota işleyicisi,
 * sitemap, OG) `cache` ezberlemez → her zaman boş.
 */
export const SSR_CLIENT_IP_HEADER = "x-rothern-client-ip";

const slot = cache((): { ip?: string } => ({}));

/**
 * Vercel'in yazdığı başlıklardan ziyaretçi IP'si (istemcininkini ezer; web
 * Cloudflare arkasında DEĞİL — `app/api/client-error/route.ts` ile aynı kural).
 */
export function visitorIpFrom(h: { get(name: string): string | null }): string | undefined {
  const ip = h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return ip && ip.length <= 64 ? ip : undefined;
}

/** Bu (zaten dinamik) çizimi ziyaretçiye bağla; istek bağlamı yoksa hiçbir şey yapmaz. */
export async function attributeSsrToVisitor(): Promise<void> {
  let ip: string | undefined;
  try {
    // Dinamik import: `marketplace-api` (istemcide tip olarak da içe aktarılır)
    // statik grafiğine `next/headers` girmesin.
    const { headers } = await import("next/headers");
    ip = visitorIpFrom(await headers());
  } catch {
    return; // istek bağlamı yok
  }
  if (ip) slot().ip = ip;
}

/** Bu istekte ilişkilendirilmiş ziyaretçi IP'si (yoksa `undefined`). */
export function ssrVisitorIp(): string | undefined {
  try {
    return slot().ip;
  } catch {
    return undefined;
  }
}
