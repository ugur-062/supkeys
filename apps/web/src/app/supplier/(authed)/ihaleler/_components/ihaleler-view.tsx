"use client";

import { Input, InputGroup } from "@/components/catalyst/input";
import { Select } from "@/components/catalyst/select";
import { EmptyState, PageHeader, Pagination } from "@/components/list";
import { PanelCard } from "@/components/supplier/panel-card";
import {
  useSupplierTenderCategoryOptions,
  useSupplierTenderStats,
  useSupplierTenderTenants,
  useSupplierTenders,
} from "@/hooks/use-supplier-tenders";
import type { TenderDateRange } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import { MagnifyingGlassIcon } from "@heroicons/react/16/solid";
import {
  Briefcase,
  CheckCircle2,
  FileText,
  Inbox,
  Mail,
  Package,
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
      <PageHeader
        title="İhaleler"
        description="Bağlı olduğunuz alıcı firmaların ihalelerine teklif verin."
      />

      {/* Mini KPI özeti */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi
          label="Aktif Davet"
          value={stats.data?.activeInvitations ?? 0}
          icon={Mail}
          accent="bg-zinc-100 text-zinc-700"
          loading={stats.isLoading}
        />
        <MiniKpi
          label="Verilen Teklif"
          value={stats.data?.submittedBids ?? 0}
          icon={FileText}
          accent="bg-zinc-100 text-zinc-700"
          loading={stats.isLoading}
        />
        <MiniKpi
          label="Kazanılan"
          value={stats.data?.wonTenders ?? 0}
          icon={CheckCircle2}
          accent="bg-zinc-100 text-zinc-700"
          loading={stats.isLoading}
        />
        <MiniKpi
          label="Devam Eden Sipariş"
          value={stats.data?.ongoingOrders ?? 0}
          icon={Package}
          accent="bg-zinc-100 text-zinc-700"
          loading={stats.isLoading}
        />
      </div>

      {/* Toolbar — geniş arama üstte, filtreler altta */}
      <PanelCard padding="sm">
        <div className="space-y-3">
          {/* Üst satır: geniş arama + sıralama */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <InputGroup>
                <MagnifyingGlassIcon data-slot="icon" />
                <Input
                  value={search}
                  onChange={(e) => updateUrl({ search: e.target.value })}
                  placeholder="İhale ara..."
                />
              </InputGroup>
            </div>
            <Select
              value={sort}
              onChange={(e) => updateUrl({ sort: e.target.value })}
              aria-label="Sıralama"
              className="sm:w-44"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          {/* Alt satır: filtreler + sonuç sayısı */}
          <div className="flex flex-wrap items-center gap-2">
            <IconSelect
              value={tab}
              onChange={(v) => updateUrl({ tab: v as TabKey })}
              options={STATUS_OPTIONS}
              ariaLabel="Durum filtresi"
            />
            <IconSelect
              value={range}
              onChange={(v) => updateUrl({ range: v as TenderDateRange })}
              options={RANGE_OPTIONS}
              ariaLabel="Tarih aralığı"
            />
            <IconSelect
              value={tenantId}
              onChange={(v) => updateUrl({ tenantId: v })}
              options={[
                { value: "", label: "Tüm Müşteriler" },
                ...(tenants.data ?? []).map((t) => ({
                  value: t.id,
                  label: `${t.name} (${t.tenderCount})`,
                })),
              ]}
              ariaLabel="Müşteri filtresi"
              loading={tenants.isLoading}
            />
            <IconSelect
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
            <p className="ml-auto whitespace-nowrap text-xs text-zinc-500">
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
        </div>
      </PanelCard>

      {/* Kart grid */}
      {list.isError ? (
        <PanelCard className="text-center py-12">
          <p className="text-zinc-950 font-medium mb-2">Veri alınamadı</p>
          <button
            type="button"
            onClick={() => list.refetch()}
            className="text-sm text-zinc-700 hover:underline"
          >
            Tekrar dene
          </button>
        </PanelCard>
      ) : list.isLoading ? (
        <CardGridSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          variant={search ? "no-results" : "no-data"}
          title={
            search
              ? "Aramayla eşleşen ihale yok"
              : tab === "active"
                ? "Henüz aktif davet yok"
                : tab === "past"
                  ? "Geçmiş ihale yok"
                  : "Hiç ihale yok"
          }
          description={
            search
              ? "Farklı bir terim deneyin"
              : tab === "active"
                ? "Yeni davetler buradan listelenir"
                : undefined
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {items.map((t) => (
              <TenderCard key={t.id} tender={t} />
            ))}
          </div>

          {totalPages > 1 ? (
            <Pagination
              variant="bare"
              page={page}
              totalPages={totalPages}
              total={totalCount}
              pageSize={PAGE_SIZE}
              onPageChange={(p) => updateUrl({ page: p })}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function IconSelect({
  value,
  onChange,
  options,
  ariaLabel,
  loading,
}: {
  icon?: typeof Briefcase;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  ariaLabel: string;
  loading?: boolean;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      disabled={loading}
      className="w-full md:w-auto md:min-w-[160px]"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
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
    <div className="bg-white ring-1 ring-zinc-950/5 rounded-xl shadow-sm p-3 flex items-center gap-3">
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
        <p className="text-xl font-bold text-zinc-950 tabular-nums leading-tight">
          {loading ? "…" : value}
        </p>
      </div>
    </div>
  );
}

function CardGridSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="bg-white ring-1 ring-zinc-950/5 rounded-2xl p-5 animate-pulse"
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

