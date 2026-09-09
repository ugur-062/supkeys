import { MARKETPLACE_ROUTES, categoryPath } from "@/lib/public/marketplace";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { fetchProductFacets, fetchPublicDirectoryFacets, fetchStats } from "@/lib/public/marketplace-api";
import { cityCompanyPath, cityProductPath, allCitySlugs } from "@/lib/public/city";
import { FAQ_FLAT } from "@/app/sss/faq-data";
import { absoluteUrl } from "@/lib/seo/meta";

/**
 * /llms-full.txt — `llms.txt`in veriyle genişletilmiş hâli (Parça 4).
 *
 * Fark şu: `llms.txt` sitenin KURALLARINI anlatır (kısa, statik, elle
 * yazılmış); bu dosya envanterin O ANKİ hâlini verir — kaç ürün, kaç firma,
 * hangi kategoriler, hangi şehirler, hangi adresler. Bir dil modeli
 * "Rothern'de kaç tedarikçi var" ya da "hangi şehirlerde" diye sorulduğunda
 * sayfaları tek tek taramak yerine buradan okuyabilir.
 *
 * HER SAYI GERÇEK UÇTAN GELİR. Uydurma ya da yuvarlanmış envanter yazılmaz;
 * uç cevap veremezse o satır hiç basılmaz (boş dosya, yanlış dosyadan
 * iyidir). Saatlik yeniden üretim: envanter dakikada bir değişmiyor.
 */
export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  if (!MARKETPLACE_LIVE) return new Response("Not found", { status: 404 });

  const [stats, facets, dir] = await Promise.all([
    fetchStats(),
    fetchProductFacets({}),
    fetchPublicDirectoryFacets({}),
  ]);

  const known = new Set(allCitySlugs().map((c) => c.name));
  const line = (s: string) => s;
  const parts: string[] = [];

  parts.push("# Rothern — genişletilmiş site kılavuzu");
  parts.push("");
  parts.push(
    "> Türkiye merkezli B2B tedarik pazar yeri. Bu dosya envanterin güncel özetini ve gezinme adreslerini içerir; kurallar ve alıntı sınırları için /llms.txt.",
  );
  parts.push("");

  /* --- Envanter (yalnız gerçek sayılar) --- */
  const inv: string[] = [];
  if (stats.products > 0) inv.push(`- Yayımlanmış ürün: ${stats.products}`);
  if (stats.companies > 0) inv.push(`- Listelenen firma: ${stats.companies}`);
  if (stats.verifiedCompanies > 0) inv.push(`- Doğrulanmış firma: ${stats.verifiedCompanies}`);
  if (stats.openDemands > 0) inv.push(`- Açık alım talebi: ${stats.openDemands}`);
  if (stats.categories > 0) inv.push(`- Ürünü olan kategori: ${stats.categories}`);
  if (inv.length) {
    parts.push("## Envanter");
    parts.push("");
    parts.push(...inv);
    parts.push("");
    parts.push(`Sayılar ${new Date().toISOString().slice(0, 10)} tarihinde üretildi ve saatlik yenilenir.`);
    parts.push("");
  }

  /* --- Kategoriler --- */
  const cats = facets.categories.filter((c) => c.count > 0).slice(0, 30);
  if (cats.length) {
    parts.push("## Ürünü olan kategoriler");
    parts.push("");
    for (const c of cats) {
      parts.push(line(`- [${c.name}](${absoluteUrl(categoryPath(c.id, c.name))}) — ${c.count} ürün`));
    }
    parts.push("");
  }

  /* --- Şehirler --- */
  const cities = facets.cities.filter((c) => c.count > 0 && known.has(c.city)).slice(0, 30);
  if (cities.length) {
    parts.push("## Şehirlere göre ürünler");
    parts.push("");
    for (const c of cities) {
      parts.push(line(`- [${c.city}](${absoluteUrl(cityProductPath(c.city))}) — ${c.count} ürün`));
    }
    parts.push("");
  }
  const dirCities = dir.cities.filter((c) => c.count > 0 && known.has(c.city)).slice(0, 30);
  if (dirCities.length) {
    parts.push("## Şehirlere göre firmalar");
    parts.push("");
    for (const c of dirCities) {
      parts.push(line(`- [${c.city}](${absoluteUrl(cityCompanyPath(c.city))}) — ${c.count} firma`));
    }
    parts.push("");
  }

  /* --- Gezinme --- */
  parts.push("## Ana adresler");
  parts.push("");
  parts.push(`- Ürün dizini: ${absoluteUrl(MARKETPLACE_ROUTES.products)}`);
  parts.push(`- Firma dizini: ${absoluteUrl(MARKETPLACE_ROUTES.companies)}`);
  parts.push(`- Alım talepleri: ${absoluteUrl(MARKETPLACE_ROUTES.demands)}`);
  parts.push(`- Ürün sayfası şeması: ${absoluteUrl("/firma/<firma-slug>/urun/<urun-slug>")}`);
  parts.push(`- Firma sayfası şeması: ${absoluteUrl("/firma/<firma-slug>")}`);
  parts.push(`- Alım talebi şeması: ${absoluteUrl("/talep/<numara>-<baslik>")}`);
  parts.push(`- Sitemap: ${absoluteUrl("/sitemap.xml")}`);
  parts.push("");

  /* --- SSS (sayfayla AYNI kaynak) --- */
  parts.push("## Sık sorulan sorular");
  parts.push("");
  parts.push(`Tam hâli: ${absoluteUrl("/sss")}`);
  parts.push("");
  for (const f of FAQ_FLAT) {
    parts.push(`### ${f.q}`);
    parts.push("");
    parts.push(f.a);
    parts.push("");
  }

  return new Response(parts.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
