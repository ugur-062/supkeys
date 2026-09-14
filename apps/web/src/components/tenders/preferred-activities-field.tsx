"use client";

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
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
          }`}
        >
          Fark etmez
        </button>
        {COMPANY_ACTIVITIES.map((a) => {
          const secili = value.includes(a.code);
          return (
            <button
              key={a.code}
              type="button"
              disabled={disabled || (!secili && dolu)}
              aria-pressed={secili}
              title={a.hintTr}
              onClick={() =>
                onChange(
                  secili
                    ? value.filter((c) => c !== a.code)
                    : [...value, a.code],
                )
              }
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                secili
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
              }`}
            >
              {a.nameTr}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        {value.length === 0
          ? "Tercih belirtmezseniz kategorinize uyan tüm firmalar aynı sırada bilgilendirilir."
          : "Seçtiğiniz tipteki firmalar öne alınır; diğerleri de talebi görmeye devam eder."}
      </p>
    </div>
  );
}
