"use client";

import { PanelCard } from "@/components/supplier/panel-card";
import {
  useSupplierTenderStats,
  useSupplierTenders,
} from "@/hooks/use-supplier-tenders";
import { cn } from "@/lib/utils";
import {
  Award,
  Briefcase,
  CheckCircle2,
  FileText,
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

type TabKey = "active" | "past" | "all";

const VALID_TABS: TabKey[] = ["active", "past", "all"];

function parseTab(v: string | null): TabKey {
  if (v && (VALID_TABS as string[]).includes(v)) return v as TabKey;
  return "active";
}

function parsePage(v: string | null): number {
  const n = v ? parseInt(v, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
  icon: typeof Briefcase;
  label: string;
  count?: number | string;
}

function FilterButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: FilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 text-sm transition-colors",
        active
          ? "bg-brand-50 text-brand-700 font-semibold"
          : "text-slate-600 hover:bg-slate-50",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 flex-shrink-0",
          active ? "text-brand-600" : "text-slate-400",
        )}
      />
      <span className="flex-1">{label}</span>
      {count !== undefined ? (
        <span
          className={cn(
            "text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded",
            active
              ? "bg-brand-100 text-brand-700"
              : "bg-slate-100 text-slate-600",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function SupplierIhalelerView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const search = searchParams.get("search") ?? "";
  const sort = searchParams.get("sort") ?? "bidsCloseAt:asc";
  const page = parsePage(searchParams.get("page"));

  const stats = useSupplierTenderStats();

  const queryParams = useMemo(
    () => ({
      filter: tab,
      search: search || undefined,
      sort,
      page,
      pageSize: PAGE_SIZE,
    }),
    [tab, search, sort, page],
  );

  const list = useSupplierTenders(queryParams);

  const updateUrl = useCallback(
    (next: { tab?: TabKey; search?: string; sort?: string; page?: number }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.tab !== undefined) {
        if (next.tab === "active") params.delete("tab");
        else params.set("tab", next.tab);
        params.delete("page");
      }
      if (next.search !== undefined) {
        if (next.search === "") params.delete("search");
        else params.set("search", next.search);
        params.delete("page");
      }
      if (next.sort !== undefined) {
        params.set("sort", next.sort);
        params.delete("page");
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sol sidebar — filtreler */}
        <aside className="lg:col-span-3">
          <PanelCard padding="sm" className="lg:sticky lg:top-4">
            <div className="relative mb-4">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => updateUrl({ search: e.target.value })}
                placeholder="İhale ara..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
              />
            </div>

            <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
              Durum
            </h3>
            <div className="space-y-1">
              <FilterButton
                active={tab === "active"}
                onClick={() => updateUrl({ tab: "active" })}
                icon={Briefcase}
                label="Aktif"
                count={stats.data?.activeInvitations ?? "—"}
              />
              <FilterButton
                active={tab === "past"}
                onClick={() => updateUrl({ tab: "past" })}
                icon={Award}
                label="Geçmiş"
              />
              <FilterButton
                active={tab === "all"}
                onClick={() => updateUrl({ tab: "all" })}
                icon={Inbox}
                label="Tümü"
              />
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100">
              <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
                Sıralama
              </h3>
              <select
                value={sort}
                onChange={(e) => updateUrl({ sort: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none bg-white"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </PanelCard>
        </aside>

        {/* Sağ — kart grid */}
        <main className="lg:col-span-9">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-slate-500">
              {list.isLoading
                ? "Yükleniyor…"
                : `${totalCount.toLocaleString("tr-TR")} ihale${search || tab !== "active" ? " (filtrelenmiş)" : ""}`}
            </p>
          </div>

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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </main>
      </div>
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
