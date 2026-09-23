import { getTranslations } from "next-intl/server";
import { CompanyCard } from "@/components/marketplace/company-card";
import { MARKET_GROUND, PublicLayout } from "@/components/marketplace/public-layout";
import { PublicSearchTabs } from "@/components/marketplace/public-search-tabs";
import type { SearchParamsLike } from "@/lib/public/filter-param-utils";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { fetchPublicDirectory } from "@/lib/public/marketplace-api";
import { loginHref, signupHref } from "@/lib/public/visibility";
import { JsonLd } from "@/components/seo/json-ld";
import { graph, itemListNode } from "@/lib/seo/jsonld";
import { ArrowRightIcon, LockClosedIcon } from "@heroicons/react/20/solid";
import { Link } from "@/i18n/navigation";

/**
 * FİRMA DİZİNİ — ÜYELİĞE YÖNLENDİREN VİTRİN (2026-09-22, kullanıcı kararı:
 * "hepsini sıralamayalım, tamamını görmek için üye olmaya yönlendirelim,
 * sayı falan görünmesin çünkü başta az firma olacağı için kötü bir intiba
 * bırakır").
 *
 * Eski hâli tam liste + kenar süzgeci + sayfalama + "N firma" sayacı +
 * şehir bağlantılarıydı (2026-09-09, Parça 3). Artık:
 *  · en fazla `TEASER_COUNT` kart (dizinin kendi sırası: doğrulanmış ve
 *    paketli önce), süzgeç/arama/sayfalama YOK;
 *  · hiçbir yerde SAYI yok — başlıkta, sekmede, JSON-LD'de (`totalItems`
 *    verilmez), llms dosyalarında;
 *  · altında "tamamını görmek için üye olun" kartı → kayıt (niyet `firma`)
 *    ya da giriş → panel dizini (`/company/satinalma/firmalar`).
 * Panel dizini (`PanelCompanyIndex`) ve firma profil sayfaları
 * (`/firma/<slug>`, sitemap `companies.xml`) ETKİLENMEDİ — SEO profil
 * sayfalarından gelir, bu sayfa yalnız kapı.
 *
 * `searchParams` imzada kaldı (sayfa ve eski çağrılar geçiyor) ama okunmaz:
 * `?q=` ya da süzgeç bu sayfada sonuç DEĞİŞTİRMEZ.
 */
export const TEASER_COUNT = 6;

export async function CompanyIndex({
  title,
  lead,
}: {
  searchParams?: SearchParamsLike;
  title?: string;
  lead?: string;
}) {
  const t = await getTranslations("web.marketplace.index");
  const tl = await getTranslations("web.marketplace.labels");
  const heading = title ?? tl("companies");
  const intro = lead ?? t("companyLead");
  const result = await fetchPublicDirectory({ page: 1 });
  const items = result.items.filter((c) => !!c.slug).slice(0, TEASER_COUNT);
  const base = MARKETPLACE_ROUTES.companies;

  /* ITEMLIST — yalnız gösterilen kartlar; `totalItems` bilinçli YOK. */
  const listLd = graph([
    itemListNode({
      name: tl("companies"),
      path: base,
      startPosition: 1,
      items: items.map((c) => ({ name: c.name, path: `/firma/${c.slug}` })),
    }),
  ]);

  return (
    <PublicLayout className={MARKET_GROUND}>
      <JsonLd data={listLd} />
      <div className="mx-auto max-w-7xl px-6 pt-28 pb-20 lg:px-8">
        <PublicSearchTabs active="companies" />
        <header className="mt-6 max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl">{heading}</h1>
          <p className="mt-3 text-base/7 text-zinc-600">{intro}</p>
        </header>

        {items.length > 0 ? (
          <div className="mt-10 flex flex-col gap-3">
            {items.map((c) => (
              <CompanyCard
                key={c.slug}
                company={c}
                variant="wide"
                cta={{ label: t("inquire"), href: signupHref("teklif", `/firma/${c.slug}`) }}
              />
            ))}
          </div>
        ) : null}

        {/* ÜYELİK KAPISI — liste kaç kart olursa olsun aynı; "daha N firma"
            gibi bir sayı YAZILMAZ. */}
        <section
          aria-labelledby="firmalar-uyelik"
          className="mt-8 flex flex-col items-start gap-5 rounded-2xl bg-white p-6 ring-1 ring-zinc-950/5 sm:flex-row sm:items-center sm:justify-between sm:p-8"
        >
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <LockClosedIcon aria-hidden className="size-5" />
            </span>
            <div>
              <h2 id="firmalar-uyelik" className="text-lg font-semibold text-zinc-950">
                {t("membersOnlyTitle")}
              </h2>
              <p className="mt-1 max-w-xl text-sm/6 text-zinc-600">{t("membersOnlyBody")}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <Link
              href={signupHref("ikisi", "/company/satinalma/firmalar")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              {t("joinFree")}
              <ArrowRightIcon aria-hidden className="size-4" />
            </Link>
            <Link
              href={loginHref("/company/satinalma/firmalar")}
              className="text-sm font-semibold text-zinc-700 hover:text-zinc-950"
            >
              {t("login")}
            </Link>
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
