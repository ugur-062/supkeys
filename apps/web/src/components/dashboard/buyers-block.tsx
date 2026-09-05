"use client";

import { useSellerTenders, type SellerTenderRow } from "@/hooks/use-seller-tenders";
import { ArrowRightIcon, BuildingOffice2Icon, MapPinIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

/**
 * "TALEP AÇAN ALICILAR" (satış) — tedarikçi bloğunun aynası: açık talebi olan
 * firmalar, talep sayısıyla. Veri `seller-tenders`ten TÜRETİLİR (görünürlük
 * aynı fonksiyondan; ayrı uç yok). Sahibi maskeli (STANDART üye) talepler
 * dışarıda kalır. Kart → Açık Talepler'de o alıcının talepleri (`?q=` alıcı
 * adıyla da eşleşir).
 */
export const BUYERS_LIMIT = 4;

export function topBuyers(rows: SellerTenderRow[], limit = BUYERS_LIMIT) {
  const byOwner = new Map<string, { id: string; name: string; city: string | null; open: number }>();
  for (const r of rows) {
    if (!r.owner || r.masked) continue;
    if (r.status !== "OPEN") continue;
    const cur = byOwner.get(r.owner.id) ?? { id: r.owner.id, name: r.owner.name, city: r.ownerCity ?? null, open: 0 };
    cur.open += 1;
    byOwner.set(r.owner.id, cur);
  }
  return [...byOwner.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name, "tr")).slice(0, limit);
}

export function BuyersBlock() {
  const tenders = useSellerTenders();
  const buyers = topBuyers(tenders.data ?? []);
  if (!tenders.isLoading && buyers.length === 0) return null;
  return (
    <section aria-label="Talep açan alıcılar">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950">Talep açan alıcılar</h2>
          <p className="mt-1 text-sm text-zinc-500">Şu an açık talebi olan firmalar; kart o alıcının taleplerini açar.</p>
        </div>
        <Link href="/company/satis/acik-talepler" className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:text-zinc-600">
          Tüm açık talepler
          <ArrowRightIcon aria-hidden className="size-4" />
        </Link>
      </div>
      {tenders.isLoading ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>
          {Array.from({ length: BUYERS_LIMIT }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-zinc-100" />
          ))}
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {buyers.map((b) => (
            <li key={b.id}>
              <Link
                href={`/company/satis/acik-talepler?q=${encodeURIComponent(b.name)}`}
                className="group flex h-full flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-zinc-950/10"
              >
                <span className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
                    <BuildingOffice2Icon aria-hidden className="size-5 text-zinc-400" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-zinc-950">{b.name}</span>
                    {b.city ? (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-zinc-500">
                        <MapPinIcon aria-hidden className="size-3.5 text-zinc-300" />
                        {b.city}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-zinc-600 tabular-nums">
                    {b.open} açık talep
                  </span>
                  <span className="font-semibold text-zinc-900 group-hover:text-zinc-600">Talepleri gör →</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
