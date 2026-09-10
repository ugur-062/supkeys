"use client";

import { PanelCompanyCard } from "@/components/company/market/panel-company-index";
import { MarketGridSkeleton } from "@/components/company/market/market-list-layout";
import { useCompanySearch } from "@/hooks/use-company-directory";
import { marketCompaniesPath } from "@/lib/company/panel-market";
import type { PortalKey } from "@/lib/company/portals";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

/**
 * ANASAYFA FİRMA LİSTESİ (2026-09-10, kullanıcı kararı): hero'daki kapsam
 * pili "Firma"ya alınınca hero'nun altındaki ürün/talep bölümleri yerine
 * BU liste çizilir — "firma tuşuna basınca firmalar listelensin". Dizinin
 * ilk sayfası, dizinle AYNI kart (`PanelCompanyCard`); süzgeç ve sayfalama
 * dizin sayfasında ("Tümünü gör"). Uç `company/directory` iki portalda da
 * açık (buy:view | sell:view).
 */
export function HomeCompanyList({ portal }: { portal: PortalKey }) {
  // Dizinin ilk sayfası (sunucu sayfa boyu); anasayfada ilk 12 satır yeter.
  const result = useCompanySearch({});
  const data = result.data;
  const total = data?.total ?? 0;
  const all = marketCompaniesPath(portal);
  return (
    <section aria-labelledby="home-company-list-title" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="home-company-list-title" className="text-xl font-semibold tracking-tight text-zinc-950">
            Firmalar
          </h2>
          {data ? <span className="tnum text-sm text-zinc-500">{total.toLocaleString("tr-TR")} firma</span> : null}
        </span>
        <Link
          href={all}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-700 hover:text-zinc-950"
        >
          Tümünü gör
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      {result.isLoading ? (
        <MarketGridSkeleton count={4} variant="company" />
      ) : !data || data.items.length === 0 ? (
        <p className="text-sm text-zinc-500">Henüz listelenen firma yok.</p>
      ) : (
        <ul className="space-y-4">
          {data.items.slice(0, 12).map((c) => (
            <li key={c.slug}>
              <PanelCompanyCard company={c} portal={portal} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
