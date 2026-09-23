import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import type { Metadata } from "next";
import { PublicLayout } from "@/components/marketplace/public-layout";
import { OPERATOR } from "@/lib/company-info";
import { buildMetadata } from "@/lib/seo/meta";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbNode, graph } from "@/lib/seo/jsonld";
import { Link } from "@/i18n/navigation";

/* Başlıkta "— Rothern" YOK: kök `layout.tsx` şablonu zaten `%s · Rothern`
   ekliyordu, canlıda "Hakkımızda — Rothern · Rothern" çıkıyordu (2026-09-09).
   Açıklama da sayfaya özel — eskiden kökün genel cümlesi mirasla geliyordu ve
   arama sonucunda bu sayfa anasayfayla aynı metni gösteriyordu. */
export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeFromParams(params);
  const t = await getTranslations({ locale, namespace: "web.marketing.about" });
  return buildMetadata({
    locale,
    title: t("metaTitle"),
    description: t("metaDesc"),
    path: "/hakkimizda",
  });
}

const LINK = "underline hover:text-zinc-900";
const H2 = "text-base font-semibold text-zinc-950";
const PRINCIPLES = ["p1", "p2", "p3", "p4"] as const;

export default async function Page({ params }: { params: LocaleParams }) {
  const locale = await localeFromParams(params);
  setRequestLocale(locale);
  const t = await getTranslations("web.marketing.about");
  const tm = await getTranslations("web.marketing");
  const b = (chunks: ReactNode) => <strong>{chunks}</strong>;
  const link = (href: string) => (chunks: ReactNode) => (
    <Link href={href} className={LINK}>
      {chunks}
    </Link>
  );
  return (
    <PublicLayout>
      <JsonLd
        data={graph([
          breadcrumbNode(
            [
              { name: tm("breadcrumbHome"), path: "/" },
              { name: t("title"), path: "/hakkimizda" },
            ],
            locale,
          ),
        ])}
      />
      <div className="mx-auto max-w-3xl px-6 pt-28 pb-16">
        <h1 className="text-2xl font-bold text-zinc-900">{t("title")}</h1>
        <p className="mt-3 text-base/7 text-zinc-700">{t.rich("intro", { b })}</p>

        <div className="mt-10 space-y-8 text-sm/6 text-zinc-700">
          <section>
            <h2 className={H2}>{t("whatTitle")}</h2>
            <p className="mt-2">{t("what1")}</p>
            <p className="mt-3">{t("what2")}</p>
          </section>

          <section>
            <h2 className={H2}>{t("oneAccountTitle")}</h2>
            <p className="mt-2">{t("oneAccountBody")}</p>
          </section>

          <section>
            <h2 className={H2}>{t("principlesTitle")}</h2>
            <dl className="mt-3 space-y-4">
              {PRINCIPLES.map((p) => (
                <div key={p}>
                  <dt className="font-semibold text-zinc-950">{t(`${p}Title`)}</dt>
                  <dd className="mt-1">{t(`${p}Body`)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h2 className={H2}>{t("noIntermediationTitle")}</h2>
            <p className="mt-2">{t("noIntermediationBody")}</p>
          </section>

          <section>
            <h2 className={H2}>{t("whoTitle")}</h2>
            <p className="mt-2">
              {t.rich("whoBody", { faq: link("/sss"), how: link("/nasil-calisir") })}
            </p>
          </section>

          <section>
            <h2 className={H2}>{t("operatorTitle")}</h2>
            <p className="mt-2">
              {t.rich("operatorBody", {
                b,
                legalName: OPERATOR.legalName,
                address: OPERATOR.address,
                taxOffice: OPERATOR.taxOffice,
                taxNo: OPERATOR.taxNo,
                email: OPERATOR.supportEmail,
                mail: (chunks) => (
                  <a href={`mailto:${OPERATOR.supportEmail}`} className={LINK}>
                    {chunks}
                  </a>
                ),
                contact: link("/iletisim"),
              })}
            </p>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
}
