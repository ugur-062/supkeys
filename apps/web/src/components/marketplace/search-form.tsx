import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { AccentButton } from "@/components/ui/accent-fill";
import { localizePath } from "@/i18n/href";

/**
 * Arama — DÜZ HTML FORM, client JS yok.
 *
 * `method="get"` ile tarayıcı alanları kendi query string'ine çevirir; sayfa
 * sunucuda yeniden render edilir. Bunu bilinçli seçtim: pazar yerinin ilk
 * ekranı statik/ISR üretilebilsin ve arama JavaScript kapalıyken de çalışsın
 * (tarayıcı botları da öyle gezer).
 *
 * Görünüm Application UI "Forms / Input groups" deseni: `ring-1 ring-inset`
 * + `focus-within:ring-2`. Sarmalayıcıya odak halkası vermek, ikon ve alanın
 * TEK bir kontrol gibi okunmasını sağlıyor.
 *
 * `action` İÇ (Türkçe) yoldur; forma aktif dilin DIŞ yolu basılır
 * (`/urunler` + en → `/en/products`). Düz form next-intl sarmalayıcısından
 * geçmez ve `localeDetection: false` ile ön eksiz adres her zaman `tr`
 * çözülür — çevrilmeseydi EN/RU ziyaretçi aramada Türkçe siteye düşerdi
 * (derin denetim Y-17).
 */
export function SearchForm({
  action,
  defaultValue,
  placeholder,
  shortPlaceholder,
  hidden,
  hiddenList,
  size = "md",
}: {
  action: string;
  defaultValue?: string;
  placeholder?: string;
  /**
   * TELEFONDA görünen kısa yer tutucu (mobil denetim g02-12): 360 px'te kutu
   * ~165 px metin alanı bırakıyor, uzun yer tutucu sözcük ortasında kesiliyordu
   * ("Ürün, marka veya p"). `sm` altında yerel yer tutucu saydamlaşır ve bu
   * metin onun yerinde çizilir; erişilebilir ad ve yerel yer tutucu TAM metin
   * kalır. Verilmezse genel kısa metin.
   */
  shortPlaceholder?: string;
  /** Aramada korunması gereken mevcut süzgeçler (kategori/şehir). */
  hidden?: Record<string, string | undefined>;
  /**
   * Tekrarlanabilen süzgeçler (nitelik). Ayrı prop çünkü tek anahtar altında
   * BİRDEN ÇOK değer var; `Record<string,string>` bunu taşıyamaz ve arama
   * yapan ziyaretçi seçtiği nitelikleri sessizce kaybederdi.
   */
  hiddenList?: Record<string, string[]>;
  /** `lg` = hero (daha yüksek ve gölgeli). */
  size?: "md" | "lg";
}) {
  const t = useTranslations("web.marketplace.search");
  const locale = useLocale() as Locale;
  const lg = size === "lg";
  return (
    <form action={localizePath(action, locale)} method="get" role="search" className="w-full">
      {Object.entries(hidden ?? {}).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      {Object.entries(hiddenList ?? {}).flatMap(([k, list]) =>
        list.map((v) => (
          <input key={`${k}:${v}`} type="hidden" name={k} value={v} />
        )),
      )}
      <div className="flex items-stretch gap-2">
        <div
          className={`relative flex flex-1 items-center rounded-full bg-white ring-1 ring-zinc-950/10 ring-inset transition focus-within:ring-2 focus-within:ring-blue-500 ${
            lg ? "shadow-lg shadow-zinc-950/5" : "shadow-sm"
          }`}
        >
          <MagnifyingGlassIcon
            aria-hidden
            className="pointer-events-none absolute left-4 size-5 text-zinc-400"
          />
          <input
            type="search"
            name="q"
            // API arama sınırı (arayüz testi D-056) — aşan metin 400 alıp boş liste gösteriyordu.
            maxLength={120}
            defaultValue={defaultValue}
            placeholder={placeholder ?? t("placeholder")}
            aria-label={t("ariaLabel")}
            className={`peer w-full rounded-full bg-transparent pr-4 pl-11 text-base text-zinc-950 outline-none placeholder:text-zinc-400 max-sm:placeholder:text-transparent ${
              lg ? "h-14" : "h-12"
            }`}
          />
          {/* Kısa yer tutucu — yalnız telefonda ve kutu BOŞKEN (`:placeholder-shown`);
              JS'siz çalışır (düz form). Tıklamayı kutuya bırakır. */}
          <span
            aria-hidden
            data-short-placeholder
            className="pointer-events-none absolute top-1/2 right-4 left-11 hidden -translate-y-1/2 truncate text-sm text-zinc-400 max-sm:peer-placeholder-shown:block"
          >
            {shortPlaceholder ?? t("placeholderShort")}
          </span>
        </div>
        {/* Telefonda yatay dolgu küçük (px-4): metin alanına ~24 px kalır. */}
        <AccentButton
          type="submit"
          className={`shrink-0 rounded-full font-semibold text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 ${
            lg ? "h-14 px-4 text-sm sm:px-7" : "h-12 px-4 text-sm sm:px-6"
          }`}
        >
          {t("submit")}
        </AccentButton>
      </div>
    </form>
  );
}
