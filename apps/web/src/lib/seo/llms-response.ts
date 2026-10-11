import { isLocale, type Locale } from "@rothern/i18n";
import { faqFlat } from "@/app/[locale]/sss/faq-data";
import { countryDisplayName } from "@/i18n/domain";
import { seoT } from "@/i18n/server";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { fetchProductFacets, fetchStats } from "@/lib/public/marketplace-api";
import { LLMS_HEADERS, buildLlmsFullTxt, buildLlmsTxt } from "@/lib/seo/llms";

/**
 * llms dosyalarının rota işleyicisi gövdesi — kök (`/llms.txt`, İngilizce) ve
 * dil sürümleri (`/<dil>/llms.txt`) AYNI fonksiyondan. SUNUCU (`i18n/server`).
 * Pazar yeri yayında değilken dosya YOK (var olmayan adresleri anlatmasın).
 */
function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

export function llmsResponse(locale: string): Response {
  if (!MARKETPLACE_LIVE || !isLocale(locale)) return notFound();
  return new Response(buildLlmsTxt(locale, seoT(locale)), { headers: LLMS_HEADERS });
}

export async function llmsFullResponse(locale: string): Promise<Response> {
  if (!MARKETPLACE_LIVE || !isLocale(locale)) return notFound();
  const l: Locale = locale;
  const [stats, facets] = await Promise.all([fetchStats(), fetchProductFacets({}, { locale: l })]);
  const body = buildLlmsFullTxt(l, seoT(l), {
    stats,
    facets,
    faq: faqFlat(l),
    countryLabel: (code) => countryDisplayName(code, l),
  });
  return new Response(body, { headers: LLMS_HEADERS });
}
