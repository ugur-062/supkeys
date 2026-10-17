import { resolveApiBaseUrl } from "@/lib/resolve-api-url";

/**
 * DÜNYA ŞEHİR LİSTESİ — istemci (2026-09-27). Uç `public/geo/*` pazar yeri
 * anahtarına TABİ DEĞİL ve maskeleme taşımaz (GeoNames başvuru verisi) —
 * "herkese açık uç panelde kullanılmaz" kuralının bilinçli istisnası: kayıt
 * formu, adres defteri ve panel süzgeçleri de aynı listeden seçer.
 */
export interface GeoCity {
  id: number;
  /** Kalıcı adres — şehir sayfası ve `?sehir=` değeri ("bursa", "de-munich"). */
  slug: string;
  /** İstek dilinde ad. */
  name: string;
  countryCode: string;
  countryName: string;
}

export async function searchGeoCities(
  q: string,
  opts: { country?: string | null; locale?: string; limit?: number } = {},
): Promise<GeoCity[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const base = resolveApiBaseUrl();
  if (!base) return [];
  const sp = new URLSearchParams({ q: term, limit: String(opts.limit ?? 10) });
  if (opts.country) sp.set("country", opts.country);
  try {
    const res = await fetch(`${base}/public/geo/cities?${sp}`, {
      headers: opts.locale ? { "accept-language": opts.locale } : undefined,
    });
    return res.ok ? ((await res.json()) as GeoCity[]) : [];
  } catch {
    return [];
  }
}

export async function fetchGeoCityClient(slug: string, locale?: string): Promise<GeoCity | null> {
  const base = resolveApiBaseUrl();
  if (!base || !slug) return null;
  try {
    const res = await fetch(`${base}/public/geo/cities/${encodeURIComponent(slug)}`, {
      headers: locale ? { "accept-language": locale } : undefined,
    });
    return res.ok ? ((await res.json()) as GeoCity) : null;
  } catch {
    return null;
  }
}
