import { useLocale, useTranslations } from "next-intl";
import { categoriesHref } from "@/lib/public/anchors";
import { Link } from "@/i18n/navigation";
import { AccentLink } from "@/components/ui/accent-fill";
import { OpenRequestLink } from "./member-cta";

/**
 * TEK BOŞ DURUM — bütün herkese açık listeler (2026-09-04).
 *
 * Denetim: üç sayfada üç farklı metin vardı ve boş sayfa boş sayfaya
 * bağlantı veriyordu (`/satilik` → "Alım taleplerine bak" → o da boş).
 * Şablon tek: "… bulunamadı." (TAM cümle, çağıran verir — isim parçasını
 * cümleye eklemek EN/RU'da çekimi bozuyordu) + "Filtreleri temizle" (süzgeç varsa) +
 * "Kategorilere göz at" (anasayfa kategori ızgarası — her zaman dolu).
 */
export function PublicEmptyState({
  title,
  clearHref,
  extra,
  openRequest,
}: {
  /** Tam cümle: "Bu kriterlerle ürün bulunamadı." */
  title: string;
  /** Süzgeç aktifken temizleme hedefi; yoksa düğme basılmaz. */
  clearHref?: string;
  /** Ek eylem — ürün dizininde "Bu ürün için talep aç" (arama terimi ön-dolu). */
  extra?: { label: string; href: string };
  /**
   * "Talep aç" eylemi — üyenin paketine göre hedef seçen `OpenRequestLink`
   * (misafire kayıt, Gold alıcıya sihirbaz, diğer üyeye "… · Gold"; T-02).
   */
  openRequest?: { label: string; prefill?: string };
}) {
  const t = useTranslations("web.marketplace.empty");
  const locale = useLocale();
  // BEYAZ yüzey: katalog sayfalarının zemini artık tonlu (`MARKET_GROUND`);
  // eski `bg-zinc-50/60` orada zeminden ayrışmıyor ve kutu kayboluyordu.
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
      <p className="text-base font-semibold text-zinc-900">{title}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
        {extra ? (
          <AccentLink
            href={extra.href}
            className="rounded-full px-4 py-2 font-semibold text-white transition"
          >
            {extra.label}
          </AccentLink>
        ) : null}
        {openRequest ? (
          <OpenRequestLink
            label={openRequest.label}
            prefill={openRequest.prefill}
            accent
            className="rounded-full px-4 py-2 font-semibold text-white transition"
          />
        ) : null}
        {clearHref ? (
          <Link
            href={clearHref}
            className="rounded-full border border-zinc-300 px-4 py-2 font-semibold text-zinc-900 transition hover:bg-white"
          >
            {t("clear")}
          </Link>
        ) : null}
        <Link
          href={categoriesHref(locale)}
          className="rounded-full border border-zinc-300 px-4 py-2 font-semibold text-zinc-900 transition hover:bg-white"
        >
          {t("browse")}
        </Link>
      </div>
    </div>
  );
}
