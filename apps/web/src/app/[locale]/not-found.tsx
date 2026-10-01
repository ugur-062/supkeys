import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import { PublicLayout } from "@/components/marketplace/public-layout";
import { DEFAULT_LOCALE, pickLocale } from "@rothern/i18n";

/**
 * 404 metası (arayüz testi D-081): başlık sayfanın dilinde ("Sayfa bulunamadı
 * · Rothern"; eskiden kök şablonun yedeği "Rothern" kalıyordu). `robots: null`
 * kök düzenin `index, follow` yönergesini SIFIRLAR — Next 404 yanıtına zaten
 * tek `noindex` basar; ikisi birlikte çelişen iki robots etiketi oluyordu.
 */
export async function generateMetadata(props: { params?: LocaleParams }): Promise<Metadata> {
  const locale = props?.params ? await localeFromParams(props.params) : (pickLocale(await getLocale()) ?? DEFAULT_LOCALE);
  const t = await getTranslations({ locale, namespace: "web.marketplace.pages" });
  return { title: t("notFoundTitle"), robots: null };
}

/**
 * Global 404 — eşleşmeyen rota veya notFound() çağrısı. Site kabuğuyla
 * (üst çubuk + altbilgi) sarılır: ziyaretçi menüden yoluna devam edebilsin
 * (D-081; eskiden yalnız "Ana sayfaya dön" düğmesi vardı).
 */
export default function NotFound() {
  const t = useTranslations("web.marketplace.pages");
  return (
    <PublicLayout className="bg-zinc-50">
      <div className="flex min-h-[70dvh] items-center justify-center px-6 pt-28 pb-16">
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <p className="text-5xl font-semibold tracking-tight text-zinc-900" aria-hidden>
            404
          </p>
          <h1 className="text-lg font-semibold text-zinc-900">{t("notFoundTitle")}</h1>
          <p className="text-sm text-zinc-500">{t("notFoundBody")}</p>
          <Link
            href="/"
            className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {t("backHome")}
          </Link>
        </div>
      </div>
    </PublicLayout>
  );
}
