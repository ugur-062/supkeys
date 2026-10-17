"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { Globe } from "lucide-react";
import { Button } from "@/components/catalyst/button";
import { countryDisplayName } from "@/i18n/domain";

/**
 * ÜLKE KAPISI (2026-09-27) — talep yalnız belirli ülkelere açık, firmanın
 * ülkesi listede değil. API `getOne` 404 yerine 403 `COUNTRY_NOT_ELIGIBLE` +
 * `targetCountries` döner (talep pazar yerinde zaten herkese açık; kayıt olup
 * derin bağlantıdan gelen yabancı tedarikçi "bulunamadı" değil nedenini
 * görmeli). Gövde talep İÇERİĞİ taşımaz — kart yalnız kuralı söyler.
 * Paket kilidi (`TIER_REQUIRED` → `SilverLockCard`) ile aynı kalıp.
 */
export interface CountryGate {
  targetCountries: string[];
}

/** Axios hatasından ülke kapısı; başka hata ise null. */
export function countryGateFrom(error: unknown): CountryGate | null {
  const res = (
    error as {
      response?: { status?: number; data?: { code?: string; targetCountries?: unknown } };
    } | null
  )?.response;
  if (res?.status !== 403 || res.data?.code !== "COUNTRY_NOT_ELIGIBLE") return null;
  const raw = res.data.targetCountries;
  return {
    targetCountries: Array.isArray(raw) ? raw.filter((c): c is string => typeof c === "string") : [],
  };
}

export function CountryNotEligibleCard({
  targetCountries,
  backHref = "/company/satis",
}: {
  targetCountries: readonly string[];
  backHref?: string;
}) {
  const t = useTranslations("web.panel.requests.countryGate");
  const locale = useLocale() as Locale;
  const fmt = useFormatter();
  const countries = targetCountries.length
    ? fmt.list(
        targetCountries.map((c) => countryDisplayName(c, locale)),
        { type: "conjunction" },
      )
    : null;
  return (
    <section
      aria-label={t("title")}
      className="mx-auto max-w-3xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm ring-1 ring-zinc-950/5"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100">
          <Globe aria-hidden className="size-5 text-zinc-700" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold tracking-tight text-zinc-950">{t("title")}</h3>
          <p className="mt-1 text-sm text-zinc-600">
            {countries ? t("description", { countries, n: targetCountries.length }) : t("descriptionNoList")}
          </p>
          <p className="mt-1 text-sm text-zinc-600">{t("inviteNote")}</p>
          <Button outline className="mt-4" href={backHref}>
            {t("backToOpen")}
          </Button>
        </div>
      </div>
    </section>
  );
}
