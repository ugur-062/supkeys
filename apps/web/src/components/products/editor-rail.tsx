"use client";

import { MissingFields } from "@/components/ui/missing-fields";
import { cn } from "@/lib/utils";
import { CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import type { ReactNode } from "react";

/**
 * DÜZENLEYİCİ RAYI (2026-09-19): formun sağında yapışkan — tamamlanma yüzdesi,
 * onay için gerekli eksikler (çipe tıklayınca ilgili bölüme kayar) ve
 * katlanabilir öneriler (arama görünürlüğü kartı). Önizleme BURADA DEĞİL:
 * yayındaki ürün açılınca önce salt-okunur önizleme gelir, "Düzenle" forma
 * geçirir (kullanıcı kararı: "Kart/Sayfa panelini tamamen kaldır").
 */
export function EditorRail({
  completion,
  blockers,
  onJump,
  recommendations,
  className,
}: {
  completion: { score: number; missing: { key: string; label: string; points: number }[] };
  blockers: string[];
  onJump?: (sectionId: string) => void;
  recommendations?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      <section aria-label="Tamamlanma" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-950/5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-900">Tamamlanma</p>
          <p className="text-sm font-semibold tabular-nums text-zinc-950">%{completion.score}</p>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100" aria-hidden>
          <div
            className={cn("h-full rounded-full transition-[width] duration-500", completion.score === 100 ? "bg-emerald-500" : "bg-zinc-900")}
            style={{ width: `${completion.score}%` }}
          />
        </div>
        {blockers.length > 0 ? (
          <div className="mt-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
              <ExclamationTriangleIcon aria-hidden className="size-4" />
              Onaya göndermek için gerekli
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {blockers.map((b) => (
                <li key={b}>
                  <button
                    type="button"
                    onClick={() => onJump?.(sectionFor(b))}
                    className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-600/20 ring-inset hover:bg-amber-100"
                  >
                    {b}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {completion.missing.length > 0 ? (
          <MissingFields className="mt-3" label="Puanını artırmak için" items={completion.missing.map((m) => `${m.label} (+${m.points})`)} max={4} />
        ) : (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700">
            <CheckCircleIcon aria-hidden className="size-4" /> Tüm alanlar dolu
          </p>
        )}
      </section>

      {recommendations ? (
        <details open className="group rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-zinc-950 marker:hidden [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between">
              Öneriler
              <span aria-hidden className="text-xs font-medium text-zinc-500 group-open:hidden">Göster</span>
              <span aria-hidden className="hidden text-xs font-medium text-zinc-500 group-open:inline">Gizle</span>
            </span>
          </summary>
          <div className="border-t border-zinc-950/5">{recommendations}</div>
        </details>
      ) : null}
    </div>
  );
}

/** Onay kapısı metni → form bölümü (`productPublishBlockers` sözcükleriyle). */
export function sectionFor(blocker: string): string {
  const b = blocker.toLowerCase();
  if (b.includes("görsel")) return "urun-gorsel";
  if (b.includes("anahtar") || b.includes("nitelik")) return "urun-ozellik";
  if (b.includes("fiyat")) return "urun-fiyat";
  return "urun-temel";
}
