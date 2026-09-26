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

/* Başlıkta "— Rothern" YOK: şablon (`%s · Rothern`) markayı zaten ekliyor —
   canlıda "İletişim ve Künye — Rothern · Rothern" çıkıyordu (2026-09-09). */
export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeFromParams(params);
  const t = await getTranslations({ locale, namespace: "web.marketing.contact" });
  return buildMetadata({
    locale,
    title: t("metaTitle"),
    description: t("metaDesc"),
    path: "/iletisim",
  });
}

const LINK = "underline hover:text-zinc-900";

export default async function Page({ params }: { params: LocaleParams }) {
  const locale = await localeFromParams(params);
  setRequestLocale(locale);
  const t = await getTranslations("web.marketing.contact");
  const tm = await getTranslations("web.marketing");
  const mail = (email: string) =>
    function MailChunk(chunks: ReactNode) {
      return (
        <a href={`mailto:${email}`} className={LINK}>
          {chunks}
        </a>
      );
    };
  const link = (href: string) =>
    function LinkChunk(chunks: ReactNode) {
      return (
        <Link href={href} className={LINK}>
          {chunks}
        </Link>
      );
    };
  /* Künye satırları — etiketler çevrilir, DEĞERLER künyenin kendisidir (tek kaynak `lib/company-info.ts`). */
  const rows: Array<{ label: string; value: string }> = [
    { label: t("legalName"), value: OPERATOR.legalName },
    { label: t("brand"), value: OPERATOR.brand },
    { label: t("address"), value: OPERATOR.address },
    { label: t("mersis"), value: OPERATOR.mersisNo },
    { label: t("taxOffice"), value: OPERATOR.taxOffice },
    { label: t("taxNo"), value: OPERATOR.taxNo },
    { label: t("supportEmail"), value: OPERATOR.supportEmail },
    { label: t("kvkkEmail"), value: OPERATOR.kvkkEmail },
    { label: t("web"), value: OPERATOR.website },
  ];
  return (
    <PublicLayout>
    <JsonLd
      data={graph([
        breadcrumbNode(
          [
            { name: tm("breadcrumbHome"), path: "/" },
            { name: t("title"), path: "/iletisim" },
          ],
          locale,
        ),
      ])}
    />
    <div className="mx-auto max-w-3xl px-6 pt-28 pb-16">
      <h1 className="text-2xl font-bold text-zinc-900">{t("title")}</h1>
      <p className="mt-2 text-sm text-zinc-600">
        {t.rich("intro", {
          legalName: OPERATOR.legalName,
          supportEmail: OPERATOR.supportEmail,
          kvkkEmail: OPERATOR.kvkkEmail,
          support: mail(OPERATOR.supportEmail),
          kvkk: mail(OPERATOR.kvkkEmail),
        })}
      </p>
      <h2 className="mt-10 text-base font-semibold text-zinc-950">{t("whereTitle")}</h2>
      <dl className="mt-3 space-y-4 text-sm/6 text-zinc-700">
        <div>
          <dt className="font-semibold text-zinc-950">{t("supportTitle")}</dt>
          <dd className="mt-1">
            {t.rich("supportBody", { email: OPERATOR.supportEmail, mail: mail(OPERATOR.supportEmail) })}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-zinc-950">{t("dataTitle")}</dt>
          <dd className="mt-1">
            {t.rich("dataBody", { email: OPERATOR.kvkkEmail, mail: mail(OPERATOR.kvkkEmail) })}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-zinc-950">{t("abuseTitle")}</dt>
          <dd className="mt-1">
            {t.rich("abuseBody", { email: OPERATOR.supportEmail, mail: mail(OPERATOR.supportEmail) })}
          </dd>
        </div>
      </dl>

      <h2 className="mt-10 text-base font-semibold text-zinc-950">{t("imprintTitle")}</h2>
      <dl className="mt-3 divide-y divide-zinc-100 rounded-2xl border border-zinc-200">
        {rows.map((r) => (
          <div
            key={r.label}
            className="grid grid-cols-1 gap-1 px-5 py-3.5 sm:grid-cols-3 sm:gap-4"
          >
            <dt className="text-sm font-medium text-zinc-500">{r.label}</dt>
            <dd className="text-sm text-zinc-900 sm:col-span-2">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-8 text-sm/6 text-zinc-600">
        {t.rich("footer", {
          faq: link("/sss"),
          terms: link("/sozlesmeler/kullanici"),
          kvkk: link("/sozlesmeler/kvkk"),
        })}
      </p>
    </div>
    </PublicLayout>
  );
}
