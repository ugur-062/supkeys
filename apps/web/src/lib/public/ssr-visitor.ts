import { cache } from "react";

/**
 * SSR ZİYARETÇİ İLİŞKİLENDİRMESİ (derin denetim MU-12, gözden geçirme).
 *
 * API, `x-rothern-ssr` taşıyan istekleri IP kovası yerine SSR kovasına sayar.
 * Tek ortak kova, süzgeçli/önizleme URL'lerini (`/urunler?q=<rastgele>`,
 * `?onizleme=1`: her biri veri önbelleğini ıskalar) basan TEK bir ziyaretçinin
 * kovayı doldurup herkesin SSR'ını 429'a düşürmesine izin veriyordu. Bu yüzden
 * ARAMA PARAMETRESİ taşıyan dinamik çizimde gerçek ziyaretçi IP'si
 * `x-rothern-client-ip` ile iletilir; API bunu yalnız sır doğrulanınca kabul
 * eder ve ziyaretçi başına kovaya sayar.
 *
 * Neden yalnız parametreli çizim: başlık Next veri önbelleği anahtarına girer
 * (`generateCacheKey` başlıkları katar). Kanonik URL'de (parametresiz) IP
 * eklemek paylaşılan önbelleği ziyaretçi başına böler; ISR/statik çizimde
 * `headers()` okumak sayfayı dinamiğe çevirir. Parametreli çizim zaten dinamik
 * ve uzun kuyruk — önbelleği bölmenin bedeli yok denecek kadar az.
 *
 * Akış: sayfa `searchParams`ı çözdükten hemen sonra `attributeSsrToVisitor(sp)`
 * çağırır; aynı istekteki (React `cache` = istek kapsamı) sonraki pazar yeri
 * çağrıları `ssrVisitorIp()` ile başlığı ekler. İstek dışı (rota işleyicisi,
 * sitemap, OG) `cache` ezberlemez → her zaman boş.
 */
export const SSR_CLIENT_IP_HEADER = "x-rothern-client-ip";

const slot = cache((): { ip?: string } => ({}));

type SearchParamsLike = Record<string, string | string[] | undefined> | URLSearchParams | null | undefined;

/** En az bir boş olmayan arama parametresi var mı? */
export function hasSearchParams(sp: SearchParamsLike): boolean {
  if (!sp) return false;
  const values = sp instanceof URLSearchParams ? [...sp.values()] : Object.values(sp);
  return values.some((v) =>
    Array.isArray(v) ? v.some((x) => x.trim() !== "") : typeof v === "string" && v.trim() !== "",
  );
}

/**
 * Vercel'in yazdığı başlıklardan ziyaretçi IP'si (istemcininkini ezer; web
 * Cloudflare arkasında DEĞİL — `app/api/client-error/route.ts` ile aynı kural).
 */
export function visitorIpFrom(h: { get(name: string): string | null }): string | undefined {
  const ip = h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return ip && ip.length <= 64 ? ip : undefined;
}

/** Parametreli dinamik çizimi ziyaretçiye bağla (parametresizse hiçbir şey yapmaz). */
export async function attributeSsrToVisitor(sp: SearchParamsLike): Promise<void> {
  if (!hasSearchParams(sp)) return;
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
