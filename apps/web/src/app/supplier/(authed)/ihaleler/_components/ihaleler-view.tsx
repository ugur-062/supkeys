"use client";

import { PanelCard } from "@/components/supplier/panel-card";
import {
  useSupplierTenderCategoryOptions,
  useSupplierTenderStats,
  useSupplierTenderTenants,
  useSupplierTenders,
} from "@/hooks/use-supplier-tenders";
import type { TenderDateRange } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import {
  Briefcase,
  Building2,
  CalendarRange,
  CheckCircle2,
  FileText,
  FolderTree,
  Inbox,
  Mail,
  Package,
  Search,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { TenderCard } from "./tender-card";

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: "bidsCloseAt:asc", label: "Yakın Biten" },
  { value: "bidsCloseAt:desc", label: "Uzak Biten" },
  { value: "createdAt:desc", label: "En Yeni" },
];

const RANGE_OPTIONS: { value: TenderDateRange; label: string }[] = [
  { value: "all", label: "Tüm Zamanlar" },
  { value: "7d", label: "Son 7 Gün" },
  { value: "30d", label: "Son 30 Gün" },
  { value: "3m", label: "Son 3 Ay" },
  { value: "6m", label: "Son 6 Ay" },
  { value: "12m", label: "Son 1 Yıl" },
];

type TabKey = "active" | "past" | "all";

const VALID_TABS: TabKey[] = ["active", "past", "all"];

const STATUS_OPTIONS: { value: TabKey; label: string }[] = [
  { value: "active", label: "Aktif" },
  { value: "past", label: "Geçmiş" },
  { value: "all", label: "Tümü" },
];

function parseTab(v: string | null): TabKey {
  if (v && (VALID_TABS as string[]).includes(v)) return v as TabKey;
  return "active";
}

function parseRange(v: string | null): TenderDateRange {
  const ranges: TenderDateRange[] = ["7d", "30d", "3m", "6m", "12m", "all"];
  if (v && (ranges as string[]).includes(v)) return v as TenderDateRange;
  return "all";
}

function parsePage(v: string | null): number {
  const n = v ? parseInt(v, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function SupplierIhalelerView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const search = searchParams.get("search") ?? "";
  const sort = searchParams.get("sort") ?? "bidsCloseAt:asc";
  const range = parseRange(searchParams.get("range"));
  const tenantId = searchParams.get("tenantId") ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";
  const page = parsePage(searchParams.get("page"));

  const stats = useSupplierTenderStats();
  const tenants = useSupplierTenderTenants();
  const categoryOptions = useSupplierTenderCategoryOptions();

  const queryParams = useMemo(
    () => ({
      filter: tab,
      search: search || undefined,
      sort,
      range,
      tenantId: tenantId || undefined,
      categoryId: categoryId || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [tab, search, sort, range, tenantId, categoryId, page],
  );

  const list = useSupplierTenders(queryParams);

  const updateUrl = useCallback(
    (next: {
      tab?: TabKey;
      search?: string;
      sort?: string;
      range?: TenderDateRange;
      tenantId?: string;
      categoryId?: string;
      page?: number;
    }) => {
      const params = new URLSearchParams(searchParams.toString());
      const setOrDelete = (
        key: string,
        value: string | undefined,
        deleteOn: string,
      ) => {
        if (value === undefined) return;
        if (value === deleteOn) params.delete(key);
        else params.set(key, value);
        params.delete("page");
      };
      if (next.tab !== undefined) setOrDelete("tab", next.tab, "active");
      if (next.search !== undefined) setOrDelete("search", next.search, "");
      if (next.sort !== undefined) {
        params.set("sort", next.sort);
        params.delete("page");
      }
      if (next.range !== undefined) setOrDelete("range", next.range, "all");
      if (next.tenantId !== undefined)
        setOrDelete("tenantId", next.tenantId, "");
      if (next.categoryId !== undefined)
        setOrDelete("categoryId", next.categoryId, "");
      if (next.page !== undefined) {
        if (next.page <= 1) params.delete("page");
        else params.set("page", String(next.page));
      }
      const qs = params.toString();
      router.replace(qs ? `/supplier/ihaleler?${qs}` : "/supplier/ihaleler");
    },
    [router, searchParams],
  );

  const items = list.data?.items ?? [];
  const totalCount = list.data?.pagination.total ?? 0;
  const totalPages = list.data?.pagination.totalPages ?? 1;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="font-display font-bold text-3xl text-brand-900">
          İhaleler
        </h1>
        <p className="text-slate-600 mt-1 text-sm">
          Bağlı olduğunuz alıcı firmaların ihalelerine teklif verin.
        </p>
      </header>

      {/* Mini KPI özeti */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi
          label="Aktif Davet"
          value={stats.data?.activeInvitations ?? 0}
          icon={Mail}
          accent="bg-blue-50 text-blue-600"
          loading={stats.isLoading}
        />
        <MiniKpi
          label="Verilen Teklif"
          value={stats.data?.submittedBids ?? 0}
          icon={FileText}
          accent="bg-violet-50 text-violet-600"
          loading={stats.isLoading}
        />
        <MiniKpi
          label="Kazanılan"
          value={stats.data?.wonTenders ?? 0}
          icon={CheckCircle2}
          accent="bg-emerald-50 text-emerald-600"
          loading={stats.isLoading}
        />
        <MiniKpi
          label="Devam Eden Sipariş"
          value={stats.data?.ongoingOrders ?? 0}
          icon={Package}
          accent="bg-amber-50 text-amber-600"
          loading={stats.isLoading}
        />
      </div>

      {/* Toolbar — arama + 5 dropdown yatay */}
      <PanelCard padding="sm">
        <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-3">
          <div className="relative flex-1 min-w-0 md:max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => updateUrl({ search: e.target.value })}
              placeholder="İhale ara..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
            />
          </div>

          <IconSelect
            icon={Briefcase}
            value={tab}
            onChange={(v) => updateUrl({ tab: v as TabKey })}
            options={STATUS_OPTIONS}
            ariaLabel="Durum filtresi"
          />
          <IconSelect
            icon={CalendarRange}
            value={range}
            onChange={(v) => updateUrl({ range: v as TenderDateRange })}
            options={RANGE_OPTIONS}
            ariaLabel="Tarih aralığı"
          />
          <IconSelect
            icon={Building2}
            value={tenantId}
            onChange={(v) => updateUrl({ tenantId: v })}
            options={[
              { value: "", label: "Tüm Alıcılar" },
              ...(tenants.data ?? []).map((t) => ({
                value: t.id,
                label: `${t.name} (${t.tenderCount})`,
              })),
            ]}
            ariaLabel="Alıcı filtresi"
            loading={tenants.isLoading}
          />
          <IconSelect
            icon={FolderTree}
            value={categoryId}
            onChange={(v) => updateUrl({ categoryId: v })}
            options={[
              { value: "", label: "Tüm Kategoriler" },
              ...(categoryOptions.data ?? []).map((c) => ({
                value: c.id,
                label: `${c.breadcrumb} (${c.tenderCount})`,
              })),
            ]}
            ariaLabel="Kategori filtresi"
            loading={categoryOptions.isLoading}
          />
          <select
            value={sort}
            onChange={(e) => updateUrl({ sort: e.target.value })}
            aria-label="Sıralama"
            className="w-full md:w-auto md:min-w-[160px] px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none bg-white cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <p className="text-xs text-slate-500 whitespace-nowrap md:ml-auto">
            {list.isLoading
              ? "Yükleniyor…"
              : `${totalCount.toLocaleString("tr-TR")} ihale${
                  search ||
                  tab !== "active" ||
                  range !== "all" ||
                  tenantId ||
                  categoryId
                    ? " (filtrelenmiş)"
                    : ""
                }`}
          </p>
        </div>
      </PanelCard>

      {/* Kart grid */}
      {list.isError ? (
        <PanelCard className="text-center py-12">
          <p className="text-brand-900 font-medium mb-2">Veri alınamadı</p>
          <button
            type="button"
            onClick={() => list.refetch()}
            className="text-sm text-brand-700 hover:underline"
          >
            Tekrar dene
          </button>
        </PanelCard>
      ) : list.isLoading ? (
        <CardGridSkeleton />
      ) : items.length === 0 ? (
        <EmptyState tab={tab} hasSearch={!!search} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map((t) => (
              <TenderCard key={t.id} tender={t} />
            ))}
          </div>

          {totalPages > 1 ? (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => updateUrl({ page: page - 1 })}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Önceki
              </button>
              <span className="text-sm text-slate-600 px-3">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => updateUrl({ page: page + 1 })}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Sonraki
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function IconSelect({
  icon: Icon,
  value,
  onChange,
  options,
  ariaLabel,
  loading,
}: {
  icon: typeof Briefcase;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  ariaLabel: string;
  loading?: boolean;
}) {
  return (
    <div className="relative w-full md:w-auto">
      <Icon className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        disabled={loading}
        className={cn(
          "pl-9 pr-8 py-2 text-sm rounded-lg appearance-none bg-white cursor-pointer w-full md:w-auto md:min-w-[160px]",
          "border border-slate-200 text-brand-900",
          "focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500",
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function MiniKpi({
  label,
  value,
  icon: Icon,
  accent,
  loading,
}: {
  label: string;
  value: number;
  icon: typeof Briefcase;
  accent: string;
  loading: boolean;
}) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm p-3 flex items-center gap-3">
      <div
        className={cn(
          "h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0",
          accent,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">
          {label}
        </p>
        <p className="text-xl font-bold text-brand-900 tabular-nums leading-tight">
          {loading ? "…" : value}
        </p>
      </div>
    </div>
  );
}

function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="bg-white border border-slate-200/80 rounded-2xl p-5 animate-pulse"
        >
          <div className="h-3 bg-slate-200 rounded w-24 mb-2" />
          <div className="h-5 bg-slate-200 rounded w-full mb-3" />
          <div className="h-3 bg-slate-200 rounded w-3/4 mb-4" />
          <div className="flex gap-3">
            <div className="h-5 bg-slate-200 rounded w-16" />
            <div className="h-5 bg-slate-200 rounded w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ tab, hasSearch }: { tab: TabKey; hasSearch: boolean }) {
  return (
    <PanelCard className="text-center py-16">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
        <Inbox className="h-5 w-5 text-slate-400" />
      </div>
      <p className="font-semibold text-brand-900">
        {hasSearch
          ? "Aramayla eşleşen ihale yok"
          : tab === "active"
            ? "Henüz aktif davet yok"
            : tab === "past"
              ? "Geçmiş ihale yok"
              : "Hiç ihale yok"}
      </p>
      <p className="text-sm text-slate-500 mt-1">
        {hasSearch
          ? "Farklı bir terim deneyin"
          : tab === "active"
            ? "Yeni davetler buradan listelenir"
            : "—"}
      </p>
    </PanelCard>
  );
}
