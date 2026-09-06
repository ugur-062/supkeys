"use client";

import { SilverLockCard } from "@/components/company/silver-lock-card";
import type { LockedRequestsSummary } from "@/hooks/use-seller-tenders";
import { formatDate } from "@/lib/format-date";

/**
 * AÇIK TALEPLER KİLİDİ — ücretsiz üye (2026-09-06). Sayılar sunucudan ve
 * GERÇEK (`lockedPublicSummary`: Silver olsaydı görecekleri küme); örnek
 * satırlar pazar yeri teaser'ıyla aynı alanlar, bulanık ve dekoratif.
 * Hiç talep yoksa sayı basılmaz — "0 talep" pazarı küçük gösterir.
 */
export function LockedRequestsCard({
  summary,
}: {
  summary: Extract<LockedRequestsSummary, { locked: true }>;
}) {
  const { total, inMyCategories, thisWeek, itemCount, samples } = summary;
  const hasAny = total > 0;
  const metaParts = [
    inMyCategories > 0 ? `${inMyCategories} kategorinizde` : null,
    thisWeek > 0 ? `${thisWeek} bu hafta yeni` : null,
    itemCount > 0 ? `toplam ${itemCount} kalem` : null,
  ].filter(Boolean);
  return (
    <SilverLockCard
      title={hasAny ? `Silver ile açılacak ${total} açık talep` : "Herkese açık talepler Silver ile görünür"}
      meta={hasAny && metaParts.length > 0 ? metaParts.join(" · ") : null}
      description="Ücretsiz üyelikte yalnız bağlantı davetiyle gelen talepleri görürsünüz. Herkese açık taleplerin tamamı, teklif verme ve alıcı kimliği Silver paketiyle açılır."
      className="border-zinc-300"
    >
      {samples.length > 0 ? (
        <ul
          aria-hidden
          className="pointer-events-none mt-4 select-none space-y-2 blur-[3px]"
        >
          {samples.map((s, i) => (
            <li
              key={`${s.title}-${i}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700"
            >
              <span className="font-medium text-zinc-900">{s.title}</span>
              {s.category ? <span>{s.category}</span> : null}
              <span>{s.itemCount} kalem</span>
              {s.city ? <span>{s.city}</span> : null}
              {s.closesAt ? <span>Kapanış {formatDate(s.closesAt)}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </SilverLockCard>
  );
}
