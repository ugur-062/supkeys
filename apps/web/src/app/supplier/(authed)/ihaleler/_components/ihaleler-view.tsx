"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useSupplierTenderStats,
  useSupplierTenders,
} from "@/hooks/use-supplier-tenders";
import { cn } from "@/lib/utils";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import {
  CheckCircle2,
  FileText,
  Mail,
  Package,
  Search,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SupplierTendersTable } from "./tenders-table";

type TabKey = "active" | "past" | "all";

const VALID_TABS: TabKey[] = ["active", "past", "all"];

function parseTab(value: string | null): TabKey {
  if (value && (VALID_TABS as string[]).includes(value)) return value as TabKey;
  return "active";
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

interface KpiCardProps {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}

function KpiCard({ label, value, icon: Icon, accent }: KpiCardProps) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div
        className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
          accent,
        )}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-slate-500 uppercase tracking-wide">
          {label}
        </div>
        <div className="text-2xl font-display font-bold text-brand-900">
          {value}
        </div>
      </div>
    </div>
  );
}

export function SupplierIhalelerView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const search = searchParams.get("search") ?? "";
  const page = parsePage(searchParams.get("page"));

  const stats = useSupplierTenderStats();
  const display = (n: number) => (stats.isLoading ? "…" : n.toString());

  const queryParams = useMemo(
    () => ({
      filter: tab,
      search: search || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [tab, search, page],
  );

  const list = useSupplierTenders(queryParams);

  const updateUrl = useCallback(
    (next: { tab?: TabKey; search?: string; page?: number }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.tab !== undefined) {
        if (next.tab === "active") params.delete("tab");
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
      router.replace(qs ? `/supplier/ihaleler?${qs}` : "/supplier/ihaleler");
    },
    [router, searchParams],
  );

  const handleTabChange = (v: string) => {
    updateUrl({ tab: v as TabKey, search: "", page: 1 });
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
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="font-display font-bold text-3xl text-brand-900">
          İhaleler
        </h1>
        <p className="text-slate-600 mt-1">
          Bağlı olduğunuz alıcı firmaların ihalelerine teklif verin.
        </p>
      </div>

      {/* Mini KPI özeti */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Aktif Davet"
          value={display(stats.data?.activeInvitations ?? 0)}
          icon={Mail}
          accent="bg-warning-50 text-warning-600"
        />
        <KpiCard
          label="Verilen Teklif"
          value={display(stats.data?.submittedBids ?? 0)}
          icon={FileText}
          accent="bg-brand-50 text-brand-600"
        />
        <KpiCard
          label="Kazanılan"
          value={display(stats.data?.wonTenders ?? 0)}
          icon={CheckCircle2}
          accent="bg-success-50 text-success-600"
        />
        <KpiCard
          label="Devam Eden Sipariş"
          value={display(stats.data?.ongoingOrders ?? 0)}
          icon={Package}
          accent="bg-indigo-50 text-indigo-600"
        />
      </div>

      <TabsPrimitive.Root
        value={tab}
        onValueChange={handleTabChange}
        className="space-y-4"
      >
        <TabsPrimitive.List
          className="border-b border-surface-border flex gap-1 overflow-x-auto"
          aria-label="İhale sekmeleri"
        >
          <TabsPrimitive.Trigger value="active" className={TRIGGER_CLASSES}>
            Aktif
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="past" className={TRIGGER_CLASSES}>
            Geçmiş
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="all" className={TRIGGER_CLASSES}>
            Tümü
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
            <SupplierTendersTable
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
