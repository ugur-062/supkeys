"use client";

import { MissingFields } from "@/components/ui/missing-fields";
import type { ProductShowcase } from "@/hooks/use-company-items";
import { CheckCircleIcon } from "@heroicons/react/20/solid";

/**
 * TAMAMLANMA SKORU — canlı halka + eksikler listesi.
 *
 * Zorlamaz, YÖNLENDİRİR. Kullanıcıyı zorlamadan veri kalitesini yükselten en
 * ucuz mekanizma; skoru yayın kapısı yapmak ise ters teper — puan toplamak
 * için alan uydurulur (Europages'in fiyat alanının "1,00 €" ile dolmasının
 * sebebi tam olarak böyle bir zorlamadır).
 *
 * Halka saf SVG: `stroke-dasharray` ile doldurulur, animasyon CSS geçişi.
 */
export function CompletionRing({ completion }: { completion: ProductShowcase["completion"] }) {
  const { score, missing } = completion;
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 64 64" className="size-16 shrink-0 -rotate-90">
          <circle
            cx="32" cy="32" r={r} fill="none" strokeWidth="6"
            className="stroke-zinc-950/10"
          />
          <circle
            cx="32" cy="32" r={r} fill="none" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            className={`transition-[stroke-dasharray] duration-500 ${
              score === 100 ? "stroke-emerald-500" : "stroke-zinc-900"
            }`}
          />
        </svg>
        <div>
          <p className="text-2xl font-semibold tracking-tight text-zinc-950">
            %{score}
          </p>
          <p className="text-sm text-zinc-500">
            {score === 100 ? "Ürün eksiksiz" : "Tamamlanma"}
          </p>
        </div>
      </div>

      {missing.length > 0 ? (
        <div className="mt-5 border-t border-zinc-950/5 pt-4">
          {/* Profilim'deki "Eksik: …" ile AYNI bileşen; puan çipin içinde. */}
          <MissingFields
            label="Eksik"
            items={missing.map((m) => `${m.label} (+${m.points})`)}
          />
        </div>
      ) : (
        <p className="mt-5 flex items-center gap-2 border-t border-zinc-950/5 pt-4 text-sm text-emerald-700">
          <CheckCircleIcon aria-hidden className="size-4" />
          Tüm alanlar dolu
        </p>
      )}
    </div>
  );
}
