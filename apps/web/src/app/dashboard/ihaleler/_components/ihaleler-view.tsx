"use client";

import {
  FilterSelect,
  PageHeader,
  Pagination,
  ResultCount,
  SearchInput,
} from "@/components/list";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import {
  useTenderBuyers,
  useTenderStats,
  useTenders,
} from "@/hooks/use-tenant-tenders";
import type { TenderDateRange, TenderStatus } from "@/lib/tenders/types";
import {
  ArrowUpDown,
  Building2,
  CalendarRange,
  Plus,
  User as UserIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { TendersTable } from "./tenders-table";

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "En Yeni" },
  { value: "createdAt:asc", label: "En Eski" },
  { value: "bidsCloseAt:asc", label: "Yakın Biten" },
  { value: "bidsCloseAt:desc", label: "Uzak Biten" },
];

const RANGE_OPTIONS: { value: TenderDateRange; label: string }[] = [
  { value: "7d", label: "Son 7 Gün" },
  { value: "30d", label: "Son 30 Gün" },
  { value: "3m", label: "Son 3 Ay" },
  { value: "6m", label: "Son 6 Ay" },
  { value: "12m", label: "Son 1 Yıl" },
  { value: "all", label: "Tümü" },
];
const VALID_RANGES: TenderDateRange[] = ["7d", "30d", "3m", "6m", "12m", "all"];
const DEFAULT_RANGE: TenderDateRange = "3m";

function parseRange(value: string | null): TenderDateRange {
  if (value && (VALID_RANGES as string[]).includes(value)) {
    return value as TenderDateRange;
  }
  return DEFAULT_RANGE;
}

const STATUS_OPTIONS: { value: TabKey; label: string }[] = [
  { value: "all", label: "Tüm Durumlar" },
  { value: "DRAFT", label: "Taslak" },
  { value: "OPEN_FOR_BIDS", label: "Yayında" },
  { value: "IN_AWARD", label: "Kazandırma" },
  { value: "AWARDED", label: "Tamamlandı" },
  { value: "CANCELLED", label: "İptal/Kapalı" },
];


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

export function IhalelerView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const search = searchParams.get("search") ?? "";
  const sort = searchParams.get("sort") ?? "createdAt:desc";
  const range = parseRange(searchParams.get("range"));
  const createdById = searchParams.get("createdById") ?? "";
  const page = parsePage(searchParams.get("page"));
  // V2-6.5 RBAC — "Yeni İhale Aç" tender:create permission'a göre (default'ta BUYER'da var).
  const { has } = usePermissions();
  const canCreate = has("tender:create");

  const stats = useTenderStats();
  const buyers = useTenderBuyers();

  const statusFilter: TenderStatus | undefined =
    tab === "all" ? undefined : (tab as TenderStatus);

  const queryParams = useMemo(
    () => ({
      status: statusFilter,
      search: search || undefined,
      sort,
      range,
      createdById: createdById || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [statusFilter, search, sort, range, createdById, page],
  );

  const list = useTenders(queryParams);

  const updateUrl = useCallback(
    (next: {
      tab?: TabKey;
      search?: string;
      sort?: string;
      range?: TenderDateRange;
      createdById?: string;
      page?: number;
    }) => {
      const params = new URLSearchParams(searchParams.toString());
      const setOrDelete = (key: string, value: string | undefined, deleteOn: string | undefined = "") => {
        if (value === undefined) return;
        if (value === deleteOn) params.delete(key);
        else params.set(key, value);
        params.delete("page");
      };
      if (next.tab !== undefined) setOrDelete("tab", next.tab, "all");
      if (next.search !== undefined) setOrDelete("search", next.search, "");
      if (next.sort !== undefined) setOrDelete("sort", next.sort, undefined);
      if (next.range !== undefined) setOrDelete("range", next.range, DEFAULT_RANGE);
      if (next.createdById !== undefined) setOrDelete("createdById", next.createdById, "");
      if (next.page !== undefined) {
        if (next.page <= 1) params.delete("page");
        else params.set("page", String(next.page));
      }
      const qs = params.toString();
      router.replace(qs ? `/dashboard/ihaleler?${qs}` : "/dashboard/ihaleler");
    },
    [router, searchParams],
  );

  const items = list.data?.items ?? [];
  const totalCount = list.data?.pagination.total ?? 0;
  const isFiltered =
    Boolean(search) ||
    tab !== "all" ||
    range !== DEFAULT_RANGE ||
    Boolean(createdById);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="İhaleler"
        description="Tedarik süreçlerinizi yönetin — açın, davet gönderin, kazandırın."
        action={
          canCreate ? (
            <Link href="/dashboard/ihaleler/yeni">
              <Button variant="primary">
                <Plus className="h-4 w-4" />
                Yeni İhale Aç
              </Button>
            </Link>
          ) : (
            <Button
              variant="primary"
              disabled
              title="Bu işlem için Yönetici yetkisi gerekiyor"
            >
              <Plus className="h-4 w-4" />
              Yeni İhale Aç
            </Button>
          )
        }
      />

      {/* Arama + filtreler — kutusuz, pill-tarzı filtreler */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={(v) => updateUrl({ search: v })}
            placeholder="İhale adı veya numarası ara…"
            className="flex-1"
          />
          <FilterSelect
            icon={ArrowUpDown}
            value={sort}
            onChange={(v) => updateUrl({ sort: v })}
            options={SORT_OPTIONS}
            ariaLabel="Sıralama"
            active={sort !== "createdAt:desc"}
            className="sm:min-w-[150px]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            icon={Building2}
            value={tab}
            onChange={(v) => updateUrl({ tab: v as TabKey })}
            options={STATUS_OPTIONS.map((o) => ({
              value: o.value,
              label:
                o.value === "all"
                  ? `Tümü (${stats.data?.total ?? "—"})`
                  : `${o.label}${getCountSuffix(o.value, stats.data)}`,
            }))}
            ariaLabel="Durum filtresi"
            active={tab !== "all"}
          />
          <FilterSelect
            icon={CalendarRange}
            value={range}
            onChange={(v) => updateUrl({ range: v as TenderDateRange })}
            options={RANGE_OPTIONS}
            ariaLabel="Tarih aralığı"
            active={range !== DEFAULT_RANGE}
          />
          <FilterSelect
            icon={UserIcon}
            value={createdById}
            onChange={(v) => updateUrl({ createdById: v })}
            options={[
              { value: "", label: "Tüm Satın Almacılar" },
              ...(buyers.data ?? []).map((b) => ({
                value: b.id,
                label: `${b.firstName} ${b.lastName} (${b.tenderCount})`,
              })),
            ]}
            ariaLabel="Satın almacı filtresi"
            active={!!createdById}
            disabled={buyers.isLoading}
          />
          <ResultCount
            total={totalCount}
            isFiltered={isFiltered}
            unit="ihale"
            className="ml-auto"
          />
        </div>
      </div>

      <TendersTable
        items={items}
        isLoading={list.isLoading}
        isError={list.isError}
        pageSize={PAGE_SIZE}
        onRetry={() => list.refetch()}
      />

      {list.data && list.data.pagination.totalPages > 1 && (
        <Pagination
          variant="bare"
          page={list.data.pagination.page}
          totalPages={list.data.pagination.totalPages}
          total={list.data.pagination.total}
          pageSize={list.data.pagination.pageSize}
          onPageChange={(p) => updateUrl({ page: p })}
        />
      )}
    </div>
  );
}

function getCountSuffix(
  value: TabKey,
  stats: ReturnType<typeof useTenderStats>["data"],
): string {
  if (!stats) return "";
  const count =
    value === "DRAFT"
      ? stats.draft
      : value === "OPEN_FOR_BIDS"
        ? stats.openForBids
        : value === "IN_AWARD"
          ? stats.inAward
          : value === "AWARDED"
            ? stats.awarded
            : value === "CANCELLED"
              ? stats.cancelled + stats.closedNoAward
              : null;
  return count != null ? ` (${count})` : "";
}


