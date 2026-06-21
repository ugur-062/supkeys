"use client";

import { Input, InputGroup } from "@/components/catalyst/input";
import {
  EmptyState,
  FilterSelect,
  PageHeader,
  Pagination,
} from "@/components/list";
import { PanelCard } from "@/components/supplier/panel-card";
import {
  useSupplierTenderCategoryOptions,
  useSupplierTenderTenants,
  useSupplierTenders,
} from "@/hooks/use-supplier-tenders";
import type { TenderDateRange } from "@/lib/tenders/types";
import { MagnifyingGlassIcon } from "@heroicons/react/16/solid";
import {
  ArrowUpDown,
  Building2,
  CalendarRange,
  Inbox,
  ListFilter,
  Tags,
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

      {/* Arama + filtreler — kutusuz, pill-tarzı */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
          <FilterSelect
            icon={ArrowUpDown}
            value={sort}
            onChange={(v) => updateUrl({ sort: v })}
            options={SORT_OPTIONS}
            ariaLabel="Sıralama"
            active={sort !== "bidsCloseAt:asc"}
            className="sm:min-w-[150px]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            icon={ListFilter}
            value={tab}
            onChange={(v) => updateUrl({ tab: v as TabKey })}
            options={STATUS_OPTIONS}
            ariaLabel="Durum filtresi"
            active={tab !== "active"}
          />
          <FilterSelect
            icon={CalendarRange}
            value={range}
            onChange={(v) => updateUrl({ range: v as TenderDateRange })}
            options={RANGE_OPTIONS}
            ariaLabel="Tarih aralığı"
            active={range !== "all"}
          />
          <FilterSelect
            icon={Building2}
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
            active={!!tenantId}
            disabled={tenants.isLoading}
          />
          <FilterSelect
            icon={Tags}
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
            active={!!categoryId}
            disabled={categoryOptions.isLoading}
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

