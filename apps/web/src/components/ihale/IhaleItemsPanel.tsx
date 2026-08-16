"use client";

import { IHALE_VIEW_FOCUS } from "./IhaleListRow";
import { companyApi } from "@/lib/company-auth/api";
import { cn } from "@/lib/utils";
import type { ListingDetail } from "@/hooks/use-company-listings";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import Link from "next/link";

/** Accordion'da gösterilen azami kalem — fazlası detay sayfasına. */
const MAX_VISIBLE_ITEMS = 5;

/**
 * İhale satırı accordion'unda tembel kalem listesi. Detay sayfasıyla AYNI
 * endpoint + AYNI queryKey (`/company/listings/:id`) — yetki/maskeleme sunucuda
 * (sahip-değil kapalı zarf korunur, maskeli önizlemeye teaser gelir) ve cache
 * ortak: detaydan listeye dönüşte istek atılmaz. Panel yalnız satır AÇIKKEN
 * mount edilir → liste yüklenirken toptan istek yok; staleTime sayesinde
 * kapat-aç yeni istek üretmez.
 */
function useLazyListingItems(listingId: string) {
  return useQuery({
    queryKey: ["company-listings", "detail", listingId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await companyApi.get<ListingDetail>(
        `/company/listings/${listingId}`,
      );
      return data;
    },
  });
}

function terminDate(iso: string): string {
  return format(new Date(iso), "d MMM yyyy", { locale: tr });
}

export function IhaleItemsPanel({
  listingId,
  detailHref,
}: {
  listingId: string;
  /** "Tümünü gör" hedefi — satırın mevcut detay linkiyle aynı href. */
  detailHref: string;
}) {
  const { data, isPending, isError, refetch, isRefetching } =
    useLazyListingItems(listingId);

  if (isPending) {
    return (
      <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-slate-100" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mt-3 border-t border-slate-100 pt-3 text-[12px]">
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
      </div>
    );
  }

  const items = data.items ?? [];
  const total = data.itemCount ?? items.length;

  if (items.length === 0) {
    return (
      <p className="mt-3 border-t border-slate-100 pt-3 text-[12px] text-slate-400">
        Bu ihalede kalem bulunmuyor.
      </p>
    );
  }

  const visible = items.slice(0, MAX_VISIBLE_ITEMS);
  const hasTermin = visible.some((it) => it.requiredByDate);

  return (
    <div className="mt-3 border-t border-slate-100 pt-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left">
          <thead>
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
              <th className="py-1 pr-2 text-[11px] font-normal text-slate-400">
                Birim
              </th>
              {hasTermin ? (
                <th className="py-1 text-[11px] font-normal text-slate-400">
                  Termin
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
                  <div className="text-[13px] font-medium leading-tight text-slate-800">
                    {it.name}
                  </div>
                  {it.materialCode ? (
                    <div className="font-mono text-[11px] text-slate-500">
                      {it.materialCode}
                    </div>
                  ) : null}
                  {it.description ? (
                    <div className="line-clamp-2 text-[11px] text-slate-500">
                      {it.description}
                    </div>
                  ) : null}
                </td>
                <td className="py-1.5 pr-2 text-right align-top text-[13px] tabular-nums leading-tight text-slate-700">
                  {Number(it.quantity).toLocaleString("tr-TR")}
                </td>
                <td className="py-1.5 pr-2 align-top text-[13px] leading-tight text-slate-700">
                  {it.unit}
                </td>
                {hasTermin ? (
                  <td className="py-1.5 align-top text-[13px] leading-tight text-slate-700">
                    {it.requiredByDate ? terminDate(it.requiredByDate) : "—"}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > MAX_VISIBLE_ITEMS ? (
        <Link
          href={detailHref}
          className={cn(
            "mt-1 inline-block rounded text-[12px] font-medium text-blue-600 hover:underline",
            IHALE_VIEW_FOCUS,
          )}
        >
          Tümünü gör ({total} kalem)
        </Link>
      ) : null}
    </div>
  );
}
