import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import { PublicLayout } from "@/components/marketplace/public-layout";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { resolveApiBaseUrl } from "@/lib/resolve-api-url";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/20/solid";
import { buildMetadata } from "@/lib/seo/meta";
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";

/**
 * MİSAFİR TALEBİ ONAY SAYFASI — e-postadaki bağlantı buraya düşer.
 *
 * Doğrulama SUNUCUDA yapılır: bağlantıya tıklamak talebi satıcıya ileten
 * adımdır ve istemciye bırakılamaz.
 *
 * `noindex`: tek kullanımlık jeton taşıyan bir adres; arama motorunun
 * indekslemesinin anlamı yok, üstelik jetonun sızma yüzeyini büyütür.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeFromParams(params);
  const t = await getTranslations({ locale, namespace: "web.marketing.inquiryVerify" });
  return {
    ...buildMetadata({
      locale,
      title: t("metaTitle"),
      description: t("metaDesc"),
      path: "/talep-onayla",
      noindex: true,
    }),
    robots: { index: false, follow: false },
  };
}

interface VerifyResult {
  ok: true;
  productName: string;
  companyName: string;
  email: string;
}

interface VerifyMessages {
  serviceDown: string;
  invalidLink: string;
  failed: string;
}

async function verify(token: string, msg: VerifyMessages): Promise<VerifyResult | { error: string }> {
  const base = resolveApiBaseUrl();
  if (!base) return { error: msg.serviceDown };
  try {
    const res = await fetch(
      `${base}/public/inquiries/verify?t=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { message?: string }
        | null;
      return { error: body?.message ?? msg.invalidLink };
    }
    return (await res.json()) as VerifyResult;
  } catch {
    return { error: msg.failed };
  }
}

export default async function Page({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams: Promise<{ t?: string }>;
}) {
  setRequestLocale(await localeFromParams(params));
  if (!MARKETPLACE_LIVE) notFound();
  const t = await getTranslations("web.marketing.inquiryVerify");
  const { t: token } = await searchParams;
  const result = token
    ? await verify(token, { serviceDown: t("serviceDown"), invalidLink: t("invalidLink"), failed: t("failed") })
    : { error: t("missingLink") };
  const ok = "ok" in result;

  return (
    <PublicLayout>
      <div className="mx-auto max-w-2xl px-6 pt-32 pb-24 lg:px-8">
        {ok ? (
          <>
            <span className="flex size-12 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-600/20">
              <CheckCircleIcon aria-hidden className="size-6 text-emerald-600" />
            </span>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-zinc-950">
              {t("sentTitle")}
            </h1>
            <p className="mt-4 text-base/7 text-zinc-600">
              {t.rich("sentBody", {
                product: result.productName,
                company: result.companyName,
                b: (chunks: ReactNode) => <strong className="text-zinc-900">{chunks}</strong>,
              })}
            </p>

            {/* Kayıt teşviki: yanıtın İÇERİĞİ hesapta okunur. Bildirim
                e-postasına içeriği koymuyoruz — koysaydık kayıt için bir
                sebep kalmaz, platform ücretsiz bir e-posta rölesine dönerdi. */}
            <div className="mt-8 rounded-2xl bg-zinc-50 p-6 ring-1 ring-zinc-950/5">
              <h2 className="text-base font-semibold text-zinc-950">
                {t("signupTitle")}
              </h2>
              <p className="mt-2 text-sm/6 text-zinc-600">
                {t("signupBody", { email: result.email })}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href={`/company/kayit?email=${encodeURIComponent(result.email)}`}
                  className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  {t("signupCta")}
                </Link>
                <Link
                  href="/company/login"
                  className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-white"
                >
                  {t("haveAccount")}
                </Link>
              </div>
            </div>
          </>
        ) : (
          <>
            <span className="flex size-12 items-center justify-center rounded-full bg-amber-50 ring-1 ring-amber-600/20">
              <ExclamationTriangleIcon
                aria-hidden
                className="size-6 text-amber-600"
              />
            </span>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-zinc-950">
              {t("failedTitle")}
            </h1>
            <p className="mt-4 text-base/7 text-zinc-600">{result.error}</p>
            <Link
              href="/"
              className="mt-8 inline-flex rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              {t("backToMarket")}
            </Link>
          </>
        )}
      </div>
    </PublicLayout>
  );
}
