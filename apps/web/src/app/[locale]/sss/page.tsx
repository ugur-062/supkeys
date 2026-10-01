import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import { PublicLayout } from "@/components/marketplace/public-layout";
import { JsonLd } from "@/components/seo/json-ld";
import { faqGroups } from "./faq-data";
import { breadcrumbNode, faqNode, graph } from "@/lib/seo/jsonld";
import { buildMetadata } from "@/lib/seo/meta";
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { ChevronDownIcon } from "@heroicons/react/20/solid";

/**
 * SIK SORULAN SORULAR (2026-09-09, Parça 4: GEO).
 *
 * Üretken arama motorları bir cevabı HAZIR ve KAYNAKLANABİLİR bulduğunda o
 * sayfayı alıntılar. "Rothern'de teklifler gizli mi?" sorusunun cevabı
 * platformun içinde dağınık duruyordu; burada tek yerde, tam cümlelerle ve
 * `FAQPage` işaretlemesiyle duruyor.
 *
 * Soru-cevaplar `faq-data.ts`ten gelir — sayfa ve şema AYNI listeden beslenir.
 */
export const revalidate = 3600;

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeFromParams(params);
  const t = await getTranslations({ locale, namespace: "web.marketing.faq" });
  return buildMetadata({
    locale,
    title: t("metaTitle"),
    description: t("metaDesc"),
    path: "/sss",
  });
}

const LINK = "underline hover:text-zinc-900";

export default async function Page({ params }: { params: LocaleParams }) {
  const locale = await localeFromParams(params);
  setRequestLocale(locale);
  const t = await getTranslations("web.marketing.faq");
  const tm = await getTranslations("web.marketing");
  const groups = faqGroups(locale);
  const flat = groups.flatMap((g) => g.items);
  return (
    <PublicLayout>
      <JsonLd
        data={graph([
          faqNode(flat.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbNode(
            [
              { name: tm("breadcrumbHome"), path: "/" },
              { name: t("title"), path: "/sss" },
            ],
            locale,
          ),
        ])}
      />
      <div className="mx-auto max-w-3xl px-6 pt-28 pb-16">
        <h1 className="text-2xl font-bold text-zinc-900">{t("title")}</h1>
        <p className="mt-2 text-sm/6 text-zinc-600">
          {t.rich("intro", {
            how: (chunks) => (
              <Link href="/nasil-calisir" className={LINK}>
                {chunks}
              </Link>
            ),
            pricing: (chunks) => (
              <Link href="/nasil-calisir#fiyatlar" className={LINK}>
                {chunks}
              </Link>
            ),
          })}
        </p>

        {groups.map((group) => (
          <section key={group.heading} className="mt-10">
            <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
              {group.heading}
            </h2>
            {/* AKORDEON (arayüz testi D-338): 13 cevap hep açıktı. Yerel
                `<details>` — JS'siz, sunucu bileşeninde çalışır; cevap metni
                kapalıyken de HTML'de durur (arama motoru ve FAQPage şeması
                aynı metni görür), tarayıcının sayfa içi araması kapalı
                cevabı bulup açar. */}
            <div className="mt-4 divide-y divide-zinc-950/5 border-y border-zinc-950/5">
              {group.items.map((item) => (
                <details key={item.q} className="group py-1">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md py-4 text-base font-semibold text-zinc-950 [&::-webkit-details-marker]:hidden">
                    <span>{item.q}</span>
                    <ChevronDownIcon
                      aria-hidden="true"
                      className="size-5 shrink-0 text-zinc-500 transition group-open:rotate-180 motion-reduce:transition-none"
                    />
                  </summary>
                  <p className="pb-5 text-sm/6 text-zinc-600">{item.a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}

        <p className="mt-10 text-sm/6 text-zinc-600">
          {t.rich("notFound", {
            contact: (chunks) => (
              <Link href="/iletisim" className={LINK}>
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>
    </PublicLayout>
  );
}
