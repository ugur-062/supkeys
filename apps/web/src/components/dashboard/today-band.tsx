import type { ReactNode } from "react";

/**
 * "BUGÜN" BANDI — bekleyen işler şeridi + dönemsiz 4 KPI tek başlık altında.
 * Üstteki bloklar pazar (arama, kategoriler, seçki), burası "benim işim";
 * başlık bu ayrımı okunur kılar. İçerik değişmedi, yalnız gruplandı.
 */
export function TodayBand({ lead, children }: { lead: string; children: ReactNode }) {
  return (
    <section aria-labelledby="bugun" className="space-y-4">
      <div>
        <h2 id="bugun" className="text-lg font-semibold tracking-tight text-zinc-950">
          Bugün
        </h2>
        <p className="mt-1 text-sm text-zinc-500">{lead}</p>
      </div>
      {children}
    </section>
  );
}
