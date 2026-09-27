"use client";

import { resolveProvince } from "@rothern/shared";
import type { Locale } from "@rothern/i18n";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { cityDisplayName, countryDisplayName } from "@/i18n/domain";
import { fetchGeoCityClient } from "@/lib/public/geo-client";

/** Oturum boyu küçük önbellek — aynı şehir için tekrar istek atılmasın. */
const cache = new Map<string, string>();

/**
 * Şehir süzgeci/"Yakınımda" değerinin (kalıcı adres ya da eski ham il adı)
 * görünen adı (2026-09-27, dünya şehir listesi). Sırayla: verilen yedek ad
 * (facet'ten) → Türk il listesi → API. Yabancı şehirde ülke eklenir
 * ("Münih, Almanya"); yüklenene dek adresin kendisi görünür.
 */
export function useGeoCityName(slug: string | undefined | null, known?: string | null): string {
  const locale = useLocale() as Locale;
  const key = `${locale}:${slug ?? ""}`;
  const tr = slug ? resolveProvince(slug) : null;
  const sync = known ?? (tr ? cityDisplayName(tr.name, locale) : cache.get(key));
  const [name, setName] = useState<string | undefined>(sync);
  useEffect(() => {
    if (!slug || sync) {
      setName(sync);
      return;
    }
    let alive = true;
    void fetchGeoCityClient(slug, locale).then((g) => {
      if (!alive || !g) return;
      const label = g.countryCode === "TR" ? g.name : `${g.name}, ${countryDisplayName(g.countryCode, locale)}`;
      cache.set(key, label);
      setName(label);
    });
    return () => {
      alive = false;
    };
  }, [slug, sync, key, locale]);
  return name ?? slug ?? "";
}
