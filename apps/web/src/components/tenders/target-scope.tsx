"use client";

import type { Locale } from "@rothern/i18n";
import { GlobeAltIcon } from "@heroicons/react/20/solid";
import { useLocale, useTranslations } from "next-intl";
import { CountryLabel, FlagImage } from "@/components/ui/country-flag";
import { countryDisplayName, useScopeLabel } from "@/i18n/domain";
import { cn } from "@/lib/utils";

/**
 * TALEBİN HEDEF ÜLKE KAPSAMI — bayraklı (son toparlama 2026-10-04, arayüz
 * testi bulgusu: "Yalnız Almanya" talebi küre ikonuyla basılıyordu).
 *
 * - Hedef listesi BOŞ (tüm ülkelere açık) → küre + "Tüm ülkeler". Küre YALNIZ
 *   bu durumda.
 * - Hedef ülke(ler) → ilk `maxFlags` ülkenin bayrağı + kapsam etiketi
 *   (`useScopeLabel`: "Almanya", "Almanya, Azerbaycan", "Almanya +2 ülke");
 *   tam liste ipucunda (ülke ADLARI).
 *
 * Bayraklar dekoratif: ad metinde yazılı, ekran okuyucu iki kez okumaz.
 */
export function TargetScope({
  targetCountries,
  ownerCountry,
  maxFlags = 3,
  className,
  iconClassName,
}: {
  targetCountries: readonly string[] | null | undefined;
  /** Verilirse tek hedef = bu ülke iken etiket "Yalnız Türkiye" olur. */
  ownerCountry?: string | null;
  maxFlags?: number;
  className?: string;
  /** "Tüm ülkeler" küresinin rengi (kartlarda soluk). */
  iconClassName?: string;
}) {
  const scopeLabel = useScopeLabel();
  const locale = useLocale() as Locale;
  const list = targetCountries ?? [];
  const label = scopeLabel(list, ownerCountry);
  if (list.length === 0) {
    return (
      <span className={cn("inline-flex min-w-0 max-w-full items-center gap-1", className)} data-scope="all">
        <GlobeAltIcon aria-hidden className={cn("size-3.5 shrink-0", iconClassName)} />
        <span className="min-w-0 truncate">{label}</span>
      </span>
    );
  }
  return (
    <span
      className={cn("inline-flex min-w-0 max-w-full items-center gap-1", className)}
      title={list.map((c) => countryDisplayName(c, locale)).join(", ")}
      data-scope="countries"
    >
      <ScopeFlags codes={list} max={maxFlags} />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

/** İlk `max` hedef ülkenin dekoratif bayrakları (ad yanında yazılı). */
export function ScopeFlags({ codes, max = 3 }: { codes: readonly string[]; max?: number }) {
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center gap-0.5">
      {codes.slice(0, Math.max(1, max)).map((c) => (
        <FlagImage key={c} code={c} label="" decorative />
      ))}
    </span>
  );
}

/** Tek hedef ülke talebin açıldığı ülkeyle AYNI mı ("Yalnız Türkiye" + alıcı Türkiye). */
export function isDomesticOnly(targetCountries: readonly string[] | null | undefined, buyerCountry: string | null | undefined): boolean {
  const list = targetCountries ?? [];
  return !!buyerCountry && list.length === 1 && list[0]!.toUpperCase() === buyerCountry.toUpperCase();
}

/**
 * ALICI KUTUSUNUN KONUM + KAPSAM SATIRLARI — herkese açık talep detayı ve
 * panelin maskeli talep görünümü aynı bileşeni okur. Alıcının ülkesi ile tek
 * hedef ülke AYNIYSA "Türkiye" iki kez yazılmaz: tek satır "<bayrak> Türkiye ·
 * yalnız yurt içi tedarikçiler". Farklıysa iki satır: alıcının ülkesi, altında
 * hedef kapsamı (bayraklı; tüm ülkelere açıkta küre).
 */
export function BuyerCountryScope({
  buyerCountry,
  targetCountries,
  lineClassName,
}: {
  buyerCountry: string | null | undefined;
  targetCountries: readonly string[] | null | undefined;
  /** Her satırın sınıfı (kutunun metin boyutu/rengi). */
  lineClassName?: string;
}) {
  const t = useTranslations("web.domain.scope");
  if (isDomesticOnly(targetCountries, buyerCountry)) {
    return (
      <p className={cn("flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5", lineClassName)} data-scope="domestic">
        <CountryLabel code={buyerCountry} />
        <span aria-hidden className="text-zinc-400">·</span>
        <span>{t("domesticOnly")}</span>
      </p>
    );
  }
  return (
    <>
      {buyerCountry ? (
        <p className={cn("flex min-w-0 items-center", lineClassName)}>
          <CountryLabel code={buyerCountry} />
        </p>
      ) : null}
      <p className={cn("flex min-w-0 items-center", lineClassName)}>
        <TargetScope targetCountries={targetCountries} />
      </p>
    </>
  );
}

/**
 * Kart içi kapsam (alıcının ülkesi aynı kartta AYRICA yazılıyken): tek hedef
 * alıcının ülkesiyse "yalnız yurt içi tedarikçiler" (ülke adı tekrarlanmaz),
 * değilse bayraklı `TargetScope`.
 */
export function ScopeBesideBuyer({
  targetCountries,
  buyerCountry,
  iconClassName,
  className,
}: {
  targetCountries: readonly string[] | null | undefined;
  buyerCountry: string | null | undefined;
  iconClassName?: string;
  className?: string;
}) {
  const t = useTranslations("web.domain.scope");
  if (isDomesticOnly(targetCountries, buyerCountry)) {
    return (
      <span className={cn("min-w-0 truncate", className)} data-scope="domestic">
        {t("domesticOnly")}
      </span>
    );
  }
  return <TargetScope targetCountries={targetCountries} iconClassName={iconClassName} className={className} />;
}
