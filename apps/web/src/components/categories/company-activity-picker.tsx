"use client";

import {
  COMPANY_ACTIVITIES,
  MAX_COMPANY_ACTIVITIES,
} from "@rothern/shared";
import { Check } from "lucide-react";

interface Props {
  value: string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
  /** Etiketin altındaki gerekçe cümlesi ekrana göre değişir. */
  hint?: string;
}

/**
 * FAALİYET TİPİ — kategori NE'yi, bu NASIL'ı söyler.
 *
 * Kayıt ekranıyla Ayarlar ekranı bu kutuları AYRI AYRI çiziyordu (biri
 * `onboarding-client.tsx` içinde satır içi, diğeri `company-profile-section.
 * tsx` içinde) — aynı soru, iki farklı görünüm. Tek bileşene alındı.
 *
 * ⚠️ DÜRÜSTLÜK NOTU: bu seçim bugün süzgeç ve facet olarak GERÇEKTEN çalışıyor
 * (firma dizini, herkese açık dizin, ürün dizini) ama eşleştirme/bildirim/
 * öneri motorlarının hiçbiri okumuyor — `company-listings.service.ts`,
 * `company-affinity.service.ts` ve `supplier-discovery.service.ts` içinde
 * `activities` hiç geçmiyor. Bu yüzden ipucu metni "alıcılar sizi süzerken
 * kullanır" der; "eşleşmenizi iyileştirir" DEMEZ. Eşleştirmeye bağlanması
 * ayrı bir iş (alıcının talepte tedarikçi tipi belirtebilmesi gerekiyor).
 */
export function CompanyActivityPicker({
  value,
  onChange,
  disabled,
  hint = "Alıcılar üreticiyle bayiyi ayırt edebilsin diye sorulur; dizin ve arama süzgeçlerinde kullanılır.",
}: Props) {
  const dolu = value.length >= MAX_COMPANY_ACTIVITIES;

  return (
    <div>
      <span className="block text-sm font-medium text-zinc-950">
        Faaliyet tipiniz{" "}
        <span className="font-normal text-zinc-500">(isteğe bağlı)</span>
      </span>
      <p className="mt-0.5 mb-2 text-xs text-zinc-500">
        En fazla {MAX_COMPANY_ACTIVITIES} seçim. {hint}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {COMPANY_ACTIVITIES.map((a) => {
          const secili = value.includes(a.code);
          const kapali = disabled || (!secili && dolu);
          return (
            <button
              key={a.code}
              type="button"
              disabled={kapali}
              aria-pressed={secili}
              onClick={() =>
                onChange(
                  secili
                    ? value.filter((c) => c !== a.code)
                    : [...value, a.code],
                )
              }
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                secili
                  ? "border-zinc-900 bg-zinc-900/5"
                  : "border-zinc-950/10 bg-white hover:border-zinc-950/25"
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  secili
                    ? "border-zinc-900 bg-zinc-900"
                    : "border-zinc-300 bg-white"
                }`}
              >
                {secili ? <Check className="h-3 w-3 text-white" /> : null}
              </span>
              <span>
                <span className="block text-sm font-medium text-zinc-900">
                  {a.nameTr}
                </span>
                <span className="block text-xs text-zinc-500">{a.hintTr}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
