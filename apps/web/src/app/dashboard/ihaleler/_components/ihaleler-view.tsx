"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTenderStats, useTenders } from "@/hooks/use-tenant-tenders";
import type { TenderStatus } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Plus, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TenderStatsCards } from "./stats-cards";
import { TendersTable } from "./tenders-table";

type TabKey =
  | "all"
  | "DRAFT"
  | "OPEN_FOR_BIDS"
  | "IN_AWARD"
  | "AWARDED"
  | "CANCELLED";

const VALID_TABS: TabKey[] = [
  "all",
  "DRAFT",
  "OPEN_FOR_BIDS",
  "IN_AWARD",
  "AWARDED",
  "CANCELLED",
];

function parseTab(value: string | null): TabKey {
  if (value && (VALID_TABS as string[]).includes(value)) {
    return value as TabKey;
  }
  return "all";
}

function parsePage(value: string | null): number {
  const n = value ? parseInt(value, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

const PAGE_SIZE = 20;

const TRIGGER_CLASSES = cn(
  "group inline-flex items-center px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
  "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50",
  "data-[state=active]:border-brand-600 data-[state=active]:text-brand-700 data-[state=active]:bg-brand-50/30",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 rounded-t-md",
);

function TabBadge({ count }: { count: number | null }) {
  if (count === null) {
    return (
      <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-400">
        —
      </span>
    );
  }
  return (
    <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-600 group-data-[state=active]:bg-brand-100 group-data-[state=active]:text-brand-700">
      {count}
    </span>
  );
}

export function IhalelerView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const search = searchParams.get("search") ?? "";
  const page = parsePage(searchParams.get("page"));

  const stats = useTenderStats();

  // Tab → status filter map
  // "CANCELLED" tab içinde CANCELLED + CLOSED_NO_AWARD bir arada gösterilir;
  // backend tek status filtreliyor, ikisini ayrı çekip union yerine sadece
  // CANCELLED'ı status query'sinde gönderelim, KPI badge'inde toplam
  // sayıyı kullanıyoruz. CLOSED_NO_AWARD'ı da görebilmek için "all" sekmesine
  // yönlendirme tercih edilebilir; V1 için CANCELLED tab'ında sadece
  // cancelled gösteriliyor ve closedNoAward "İptal/Kapalı" KPI'sında.
  const statusFilter: TenderStatus | undefined =
    tab === "all" ? undefined : (tab as TenderStatus);

  const queryParams = useMemo(
    () => ({
      status: statusFilter,
      search: search || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [statusFilter, search, page],
  );

  const list = useTenders(queryParams);

  const updateUrl = useCallback(
    (next: { tab?: TabKey; search?: string; page?: number }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.tab !== undefined) {
        if (next.tab === "all") params.delete("tab");
        else params.set("tab", next.tab);
        params.delete("page");
      }
      if (next.search !== undefined) {
        if (next.search === "") params.delete("search");
        else params.set("search", next.search);
      }
      if (next.page !== undefined) {
        if (next.page <= 1) params.delete("page");
        else params.set("page", String(next.page));
      }
      const qs = params.toString();
      router.replace(qs ? `/dashboard/ihaleler?${qs}` : "/dashboard/ihaleler");
    },
    [router, searchParams],
  );

  const handleTabChange = (value: string) => {
    updateUrl({ tab: value as TabKey, search: "", page: 1 });
  };

  // Search debounce
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => {
    setSearchInput(search);
  }, [search]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== search) updateUrl({ search: searchInput, page: 1 });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const handleClear = () => {
    setSearchInput("");
    updateUrl({ search: "", page: 1 });
  };

  const items = list.data?.items ?? [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-3xl text-brand-900">
            İhaleler
          </h1>
          <p className="text-slate-600 mt-1">
            Tedarik süreçlerinizi yönetin — açın, davet gönderin, kazandırın.
          </p>
        </div>
        <Button variant="primary" disabled title="Yakında — E.2'de aktif olacak">
          <Plus className="h-4 w-4" />
          Yeni İhale Aç
          <span className="ml-1 px-1.5 py-0.5 bg-warning-100 text-warning-700 text-[10px] rounded-md font-semibold uppercase tracking-wide">
            Yakında
          </span>
        </Button>
      </div>

      <TenderStatsCards />

      <TabsPrimitive.Root
        value={tab}
        onValueChange={handleTabChange}
        className="space-y-4"
      >
        <TabsPrimitive.List
          className="border-b border-surface-border flex gap-1 overflow-x-auto"
          aria-label="İhale sekmeleri"
        >
          <TabsPrimitive.Trigger value="all" className={TRIGGER_CLASSES}>
            Tümü
            <TabBadge count={stats.data?.total ?? null} />
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="DRAFT" className={TRIGGER_CLASSES}>
            Taslak
            <TabBadge count={stats.data?.draft ?? null} />
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger
            value="OPEN_FOR_BIDS"
            className={TRIGGER_CLASSES}
          >
            Yayında
            <TabBadge count={stats.data?.openForBids ?? null} />
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="IN_AWARD" className={TRIGGER_CLASSES}>
            Kazandırma
            <TabBadge count={stats.data?.inAward ?? null} />
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="AWARDED" className={TRIGGER_CLASSES}>
            Tamamlandı
            <TabBadge count={stats.data?.awarded ?? null} />
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="CANCELLED" className={TRIGGER_CLASSES}>
            İptal/Kapalı
            <TabBadge
              count={
                stats.data
                  ? stats.data.cancelled + stats.data.closedNoAward
                  : null
              }
            />
          </TabsPrimitive.Trigger>
        </TabsPrimitive.List>

        <TabsPrimitive.Content value={tab} className="space-y-4 outline-none">
          <div className="card p-3 flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                type="search"
                placeholder="İhale adı veya numarası ara…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={handleClear}
              disabled={!search}
            >
              <X className="w-4 h-4" />
              Temizle
            </Button>
          </div>

          <div className="card overflow-hidden">
            <TendersTable
              items={items}
              isLoading={list.isLoading}
              isError={list.isError}
              pageSize={PAGE_SIZE}
              onRetry={() => list.refetch()}
            />
          </div>
        </TabsPrimitive.Content>
      </TabsPrimitive.Root>
    </div>
  );
}
