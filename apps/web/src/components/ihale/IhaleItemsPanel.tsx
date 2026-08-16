"use client";

import { IHALE_VIEW_FOCUS } from "./IhaleListRow";
import { companyApi } from "@/lib/company-auth/api";
import { formatMoney } from "@/components/ui/money";
import { cn } from "@/lib/utils";
import type { ListingDetail } from "@/hooks/use-company-listings";
import { useQuery } from "@tanstack/react-query";
import { PackageOpen } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/** Kademeli liste eşikleri: ≤5 hepsi; 6-20 "daha göster"; >20 detaya link. */
const PREVIEW_COUNT = 5;
const INLINE_MAX = 20;

/**
 * İhale satırı accordion'unda tembel kalem listesi. Detay sayfasıyla AYNI
 * endpoint + AYNI queryKey (`/company/listings/:id`) — yetki/maskeleme sunucuda
 * (sahip-değil kapalı zarf korunur; hedef fiyat non-owner'a yalnız sahip
 * opt-in ettiyse gelir, maskeli önizlemeye teaser) ve cache ortak: detaydan
 * listeye dönüşte istek atılmaz. Panel yalnız satır AÇIKKEN mount edilir →
 * liste yüklenirken toptan istek yok; aynı key'e paralel istek TanStack
 * tarafından tekilleştirilir; staleTime sayesinde kapat-aç yeni istek üretmez;
 * `signal` sayesinde panel kapanınca uçuştaki istek iptal edilir.
 */
function useLazyListingItems(listingId: string) {
  return useQuery({
    queryKey: ["company-listings", "detail", listingId],
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => {
      const { data } = await companyApi.get<ListingDetail>(
        `/company/listings/${listingId}`,
        { signal },
      );
      return data;
    },
  });
}

export function IhaleItemsPanel({
  listingId,
  detailHref,
  itemsTab,
  initialCount,
}: {
  listingId: string;
  /** "Tüm N kalemi detayda gör" hedefi — satırın mevcut detay linkiyle aynı. */
  detailHref: string;
  /** Detay sayfasında Kalemler sekmesinin indeksi (sahip: 2, sahip-değil: 1). */
  itemsTab: number;
  /** Liste verisinde kalem sayısı varsa başlık fetch beklemeden dolar. */
  initialCount?: number;
}) {
  const { data, isPending, isError, refetch, isRefetching } =
    useLazyListingItems(listingId);
  const [showAll, setShowAll] = useState(false);

  const knownCount = data ? (data.itemCount ?? data.items?.length ?? 0) : initialCount;
  const heading = (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
      Kalemler{knownCount != null ? ` (${knownCount})` : ""}
    </p>
  );

  // min-h: skeleton ↔ tablo ↔ boş/hata geçişinde panel zıplamasın.
  const frame = "mt-3 min-h-[88px] border-t border-slate-100 pt-2";

  if (isPending) {
    return (
      <div className={frame}>
        {heading}
        <div className="mt-2 space-y-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={frame}>
        {heading}
        <p className="mt-2 text-[12px]">
          <span className="text-rose-600">Kalemler yüklenemedi.</span>{" "}
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isRefetching}
            className={cn(
              "rounded font-medium text-blue-600 hover:underline disabled:opacity-50",
              IHALE_VIEW_FOCUS,
            )}
          >
            Tekrar dene
          </button>
        </p>
      </div>
    );
  }

  const items = data.items ?? [];
  const total = data.itemCount ?? items.length;

  if (items.length === 0) {
    return (
      <div className={frame}>
        {heading}
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-slate-400">
          <PackageOpen className="h-4 w-4" aria-hidden />
          Bu ihalede kalem tanımlanmamış.
        </p>
      </div>
    );
  }

  const expandableInline = total > PREVIEW_COUNT && total <= INLINE_MAX;
  const visible = showAll && expandableInline ? items : items.slice(0, PREVIEW_COUNT);
  // Hedef fiyat sunucu-yetkili: sahip her zaman alır, tedarikçi yalnız sahip
  // "tedarikçiler görsün" dediyse (aksi halde alan null → kolon hiç çizilmez).
  const showTarget = visible.some((it) => it.targetPrice != null);
  const currency = data.primaryCurrency ?? "TRY";
  const allItemsHref = `${detailHref}&tab=${itemsTab}`;

  return (
    <div className={frame}>
      {heading}
      <div
        className={cn(
          "overflow-x-auto",
          // Tüm liste açıkken sayfayı büyütme: sınırlı yükseklik + iç scroll.
          showAll && "max-h-[320px] overflow-y-auto",
        )}
      >
        <table className="w-full min-w-[420px] text-left">
          <thead className={cn(showAll && "sticky top-0 z-[1] bg-white")}>
            <tr>
              <th className="w-8 py-1 pr-2 text-[11px] font-normal text-slate-400">
                #
              </th>
              <th className="py-1 pr-2 text-[11px] font-normal text-slate-400">
                Kalem
              </th>
              <th className="py-1 pr-2 text-right text-[11px] font-normal text-slate-400">
                Miktar
              </th>
              {showTarget ? (
                <th className="py-1 text-right text-[11px] font-normal text-slate-400">
                  Hedef Fiyat
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {visible.map((it) => (
              <tr key={it.id}>
                <td className="py-1.5 pr-2 align-top text-[13px] tabular-nums leading-tight text-slate-400">
                  {it.lineNo}
                </td>
                <td className="py-1.5 pr-2 align-top">
                  <div
                    title={it.name}
                    className="line-clamp-2 text-[13px] font-medium leading-tight text-slate-800"
                  >
                    {it.name}
                  </div>
                  {it.materialCode ? (
                    <div className="font-mono text-[11px] text-slate-500">
                      {it.materialCode}
                    </div>
                  ) : null}
                  {it.description ? (
                    <div
                      title={it.description}
                      className="line-clamp-2 text-[11px] text-slate-500"
                    >
                      {it.description}
                    </div>
                  ) : null}
                </td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-right align-top text-[13px] tabular-nums leading-tight text-slate-700">
                  {Number(it.quantity).toLocaleString("tr-TR")} {it.unit}
                </td>
                {showTarget ? (
                  <td className="whitespace-nowrap py-1.5 text-right align-top text-[13px] tabular-nums leading-tight text-slate-700">
                    {it.targetPrice != null
                      ? formatMoney(it.targetPrice, currency)
                      : "—"}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {expandableInline ? (
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          className={cn(
            "mt-1 inline-block rounded text-[12px] font-medium text-blue-600 hover:underline",
            IHALE_VIEW_FOCUS,
          )}
        >
          {showAll ? "Daha az göster" : `${total - PREVIEW_COUNT} kalem daha göster`}
        </button>
      ) : null}
      {total > INLINE_MAX ? (
        <Link
          href={allItemsHref}
          className={cn(
            "mt-1 inline-block rounded text-[12px] font-medium text-blue-600 hover:underline",
            IHALE_VIEW_FOCUS,
          )}
        >
          Tüm {total} kalemi detayda gör →
        </Link>
      ) : null}
    </div>
  );
}
