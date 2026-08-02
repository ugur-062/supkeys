"use client";

import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";

/**
 * P2 (frontend denetimi §5) — "aksiyon verilemiyor, karşı taraf bekleniyor"
 * durumunun TEK ifadesi. EmptyState aksiyon ZORUNLU kılar; aksiyon
 * verilemeyen boşluklar (karşı tarafın yükleyeceği belge, onay bekleyen
 * adım) bu bileşenle gösterilir — "Henüz belge yok." tarzı çıplak gri
 * satırların 5 farklı yazımı biter.
 *
 *  - size "md": kart içi blok (saat ikonu 40px dairede + başlık + meta).
 *  - size "sm": belge kutusu gibi dar alanlarda tek satır.
 */
export function WaitingState({
  title,
  meta,
  size = "md",
  actions,
  className,
}: {
  title: string;
  /** Kim/ne zamandan beri — "İkinci Firma Ltd · 2 Ağu 19:01'den beri" */
  meta?: string;
  size?: "sm" | "md";
  actions?: React.ReactNode;
  className?: string;
}) {
  if (size === "sm") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2",
          className,
        )}
      >
        <Clock className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-zinc-600">{title}</p>
          {meta ? (
            <p className="truncate text-xs text-zinc-400">{meta}</p>
          ) : null}
        </div>
        {actions ? <div className="ml-auto shrink-0">{actions}</div> : null}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-950/10 bg-white px-4 py-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100">
          <Clock className="h-5 w-5 text-zinc-500" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900">{title}</p>
          {meta ? <p className="text-xs text-zinc-500">{meta}</p> : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
