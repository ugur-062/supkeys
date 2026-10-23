"use client";

import { useTranslations } from "next-intl";
import { useActivityLabel } from "@/i18n/domain";
import {
  COMPANY_ACTIVITIES,
  MAX_COMPANY_ACTIVITIES,
} from "@rothern/shared";

interface Props {
  value: string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
}

/**
 * ARANAN TEDARİKÇİ TİPİ — talep formunun ikinci ekseni.
 *
 * NEDEN VAR: `Company.activities` 2026-09-06'dan beri toplanıyordu ama
 * eşleştirmenin hiçbir yerinde okunmuyordu — çünkü alıcının "bana üretici
 * lazım, bayi değil" diyebileceği bir alan yoktu. Ölçüldü: `activities`
 * kelimesi `company-listings.service.ts`, `company-affinity.service.ts` ve
 * `supplier-discovery.service.ts` içinde 0 kez geçiyordu.
 *
 * BOŞ = "fark etmez" ve sıralamayı HİÇ etkilemez. Bu yüzden zorunlu değil ve
 * varsayılanı boş: tercih belirtmek isteyen alıcı belirtir, istemeyenin akışı
 * uzamaz.
 *
 * ELEME DEĞİL SIRALAMA (backend `notifyCategoryMatchedCompanies`): uyan
 * firmalar öne alınır, uymayanlar duyuruyu yine alır. Sert süzgeç, tipini
 * beyan etmemiş firmayı görünmez yapar ve o firma bedelini asla göremezdi.
 */
export function PreferredActivitiesField({ value, onChange, disabled }: Props) {
  const t = useTranslations("web.panel.requests.preferredActivitiesField");
  const activityLabel = useActivityLabel();
  const dolu = value.length >= MAX_COMPANY_ACTIVITIES;

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={value.length === 0}
          onClick={() => onChange([])}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
            value.length === 0
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
          }`}
        >
          {t("hepsiDahil")}
        </button>
        {COMPANY_ACTIVITIES.map((a) => {
          const secili = value.includes(a.code);
          return (
            <button
              key={a.code}
              type="button"
              disabled={disabled || (!secili && dolu)}
              aria-pressed={secili}
              title={t(`hint.${a.code}` as never)}
              onClick={() =>
                onChange(
                  secili
                    ? value.filter((c) => c !== a.code)
                    : [...value, a.code],
                )
              }
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                secili
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
              }`}
            >
              {activityLabel(a.code)}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        {value.length === 0
          ? t("tercihBelirtmezsenizKategorinizeUyanTum")
          : t("sectiginizTiptekiFirmalarOneAlinir")}
      </p>
    </div>
  );
}
