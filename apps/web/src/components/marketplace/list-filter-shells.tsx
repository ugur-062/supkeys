"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { FilterShellCore } from "./filter-shell";
import {
  activeCompanyFilterCount,
  buildCompanyFilterQuery,
  clearCompanyFilters,
  parseCompanyFilters,
} from "@/lib/public/company-filter-params";
import {
  activeListingFilterCount,
  buildListingFilterQuery,
  clearListingFilters,
  parseListingFilters,
} from "@/lib/public/listing-filter-params";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";

/**
 * Talep ve firma dizinlerinin süzgeç kabukları (PROMPT 4): ürün dizinindeki
 * `FilterShell` ile aynı çekirdek (`FilterShellCore` — URL durumu,
 * geçiş, mobil çekmece), yalnız şema ve yol farklı. Durum istemcide
 * `useSearchParams`tan okunur; sunucu bileşeni aynı URL'yi parse eder.
 */
export function ListingFilterShell({ total, drawer, children }: { total: number; drawer: ReactNode; children: ReactNode }) {
  const sp = useSearchParams();
  const state = parseListingFilters(sp ?? new URLSearchParams());
  return (
    <FilterShellCore
      state={state}
      toUrl={(next) => `${MARKETPLACE_ROUTES.demands}${buildListingFilterQuery(next)}`}
      clearState={clearListingFilters}
      total={total}
      activeCount={activeListingFilterCount(state)}
      drawer={drawer}
    >
      {children}
    </FilterShellCore>
  );
}

export function CompanyFilterShell({ total, drawer, children }: { total: number; drawer: ReactNode; children: ReactNode }) {
  const sp = useSearchParams();
  const state = parseCompanyFilters(sp ?? new URLSearchParams());
  return (
    <FilterShellCore
      state={state}
      toUrl={(next) => `${MARKETPLACE_ROUTES.companies}${buildCompanyFilterQuery(next)}`}
      clearState={clearCompanyFilters}
      total={total}
      activeCount={activeCompanyFilterCount(state)}
      drawer={drawer}
    >
      {children}
    </FilterShellCore>
  );
}
