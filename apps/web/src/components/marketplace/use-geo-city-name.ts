"use client";

import { resolveProvince } from "@rothern/shared";
import type { Locale } from "@rothern/i18n";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { cityDisplayName, cityKeyDisplayName, countryDisplayName } from "@/i18n/domain";
import { fetchGeoCityClient } from "@/lib/public/geo-client";

/** Oturum boyu küçük önbellek — aynı şehir için tekrar istek atılmasın. */
const cache = new Map<string, string>();

/** API kaydının görünen adı — yabancı şehirde ülke eklenir. */
function geoLabel(g: { name: string; countryCode: string }, locale: Locale): string {
  return g.countryCode === "TR" ? g.name : `${g.name}, ${countryDisplayName(g.countryCode, locale)}`;
}

/** Ağa gitmeden çözülebilen ad: yedek → Türk il listesi → oturum önbelleği. */
function syncName(slug: string, locale: Locale, known?: string | null): string | undefined {
  if (known) return known;
  const tr = resolveProvince(slug);
  return tr ? cityDisplayName(tr.name, locale) : cache.get(`${locale}:${slug}`);
}

/**
 * Şehir süzgeci/"Yakınımda" değerinin (kalıcı adres ya da eski ham il adı)
 * görünen adı (2026-09-27, dünya şehir listesi). Sırayla: verilen yedek ad
 * (facet'ten) → Türk il listesi → API. Yabancı şehirde ülke eklenir
 * ("Münih, Almanya"); yüklenene dek adresin kendisi görünür.
 */
export function useGeoCityName(slug: string | undefined | null, known?: string | null): string {
  const locale = useLocale() as Locale;
  const key = `${locale}:${slug ?? ""}`;
  const sync = slug ? syncName(slug, locale, known) : (known ?? undefined);
  const [name, setName] = useState<string | undefined>(sync);
  useEffect(() => {
    if (!slug || sync) {
      setName(sync);
      return;
    }
    let alive = true;
    void fetchGeoCityClient(slug, locale).then((g) => {
      if (!alive || !g) return;
      const label = geoLabel(g, locale);
      cache.set(key, label);
      setName(label);
    });
    return () => {
      alive = false;
    };
  }, [slug, sync, key, locale]);
  return name ?? slug ?? "";
}

/**
 * Çoklu şehir süzgecinin görünen adları (çipler; arayüz testi D-317) — aynı
 * sıra: `known` (facet) → Türk il listesi → önbellek → API. Yüklenene dek
 * adresin kendisi döner.
 */
export function useGeoCityNames(
  slugs: string[],
  known?: (slug: string) => string | null | undefined,
): Record<string, string> {
  const locale = useLocale() as Locale;
  const [, setLoaded] = useState(0);
  const resolved = slugs.map((s) => [s, syncName(s, locale, known?.(s))] as const);
  const missing = resolved.filter(([, n]) => !n).map(([s]) => s);
  const missingKey = missing.join("|");
  useEffect(() => {
    if (!missingKey) return;
    let alive = true;
    void Promise.all(
      missingKey.split("|").map((slug) =>
        fetchGeoCityClient(slug, locale).then((g) => {
          if (g) cache.set(`${locale}:${slug}`, geoLabel(g, locale));
        }),
      ),
    ).then(() => alive && setLoaded((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [missingKey, locale]);
  return Object.fromEntries(resolved.map(([s, n]) => [s, n ?? s]));
}

/**
 * Şehir süzgecinin seçili değerleri için etiket işlevi (kenar çubuğu
 * `ShowMore.labelFor` ve çipler aynı adı yazsın — canlı öncesi): facet'te
 * olmayan seçili dünya şehri kenar çubuğunda ham adresle ("de-munich 0")
 * görünürken çip "Münih, Almanya" yazıyordu. Çözüm sırası `useGeoCityNames`
 * ile aynı: facet adı → Türk il listesi → önbellek → API.
 */
export function useCityFilterLabel(
  selected: string[],
  facetCities: ReadonlyArray<{ city: string; name?: string | null }>,
): (slug: string) => string {
  const locale = useLocale() as Locale;
  const known = (s: string) => facetCities.find((f) => f.city === s)?.name;
  const names = useGeoCityNames(selected, known);
  // Çözülemeyen (eski serbest metin) değer önceki gibi `cityKeyDisplayName`a
  // düşer — ham adres yalnız API yanıtı gelene dek görünür.
  return (slug) => {
    const n = names[slug] ?? syncName(slug, locale, known(slug));
    return n && n !== slug ? n : cityKeyDisplayName(slug, locale);
  };
}
