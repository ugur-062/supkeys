"use client";

import { AdminShell } from "@/components/layout/admin-shell";
import {
  EmptyState,
  ListSkeleton,
  ResultCount,
  SearchInput,
  SortDropdown,
} from "@/components/list";
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import {
  useAdminSuppliers,
  type AdminSupplierListItem,
} from "@/hooks/use-admin-suppliers";
import { useListFilters } from "@/hooks/use-list-filters";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Truck } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "En Yeni" },
  { value: "createdAt:asc", label: "En Eski" },
  { value: "companyName:asc", label: "İsim (A → Z)" },
  { value: "companyName:desc", label: "İsim (Z → A)" },
];

const MEMBERSHIP_OPTIONS = [
  { value: "", label: "Tüm Üyelikler" },
  { value: "STANDARD", label: "Standard" },
  { value: "PREMIUM", label: "Premium" },
];

const SELECT_CLASS = cn(
  "px-3 py-2 text-sm rounded-lg appearance-none bg-white cursor-pointer",
  "border border-surface-border text-admin-text",
  "focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500",
);

interface SupplierFilters {
  search?: string;
  membership?: string;
  sort?: string;
  page?: number;
  [key: string]: string | number | boolean | undefined;
}

function SuppliersView() {
  const { filters, setFilters, clearFilters, activeFilterCount } =
    useListFilters<SupplierFilters>({ sort: "createdAt:desc" });

  const list = useAdminSuppliers({
    search: filters.search,
    membership:
      filters.membership === "STANDARD" || filters.membership === "PREMIUM"
        ? filters.membership
        : undefined,
    sort: filters.sort,
    page: filters.page,
    pageSize: 20,
  });

  const items = list.data?.items ?? [];
  const total = list.data?.pagination.total ?? 0;
  const isFiltered = activeFilterCount > 0;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="font-display font-bold text-2xl md:text-3xl text-admin-text">
          Tedarikçiler
        </h1>
        <p className="text-sm text-admin-text-muted mt-1">
          Sistemdeki tüm tedarikçi firmalar.
        </p>
      </div>

      <div className="admin-card">
        <div className="p-4 border-b border-surface-border space-y-3">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <SearchInput
              value={filters.search ?? ""}
              onChange={(v) => setFilters({ search: v })}
              placeholder="Firma adı, VKN veya kullanıcı e-postası..."
              className="w-full md:w-96"
            />
            <select
              className={SELECT_CLASS}
              value={filters.membership ?? ""}
              onChange={(e) => setFilters({ membership: e.target.value })}
            >
              {MEMBERSHIP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <SortDropdown
              value={filters.sort ?? "createdAt:desc"}
              onChange={(v) => setFilters({ sort: v })}
              options={SORT_OPTIONS}
            />
            <ResultCount
              total={total}
              isFiltered={isFiltered}
              unit="tedarikçi"
              className="md:ml-auto"
            />
          </div>
          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-brand-600 hover:underline font-semibold"
            >
              Filtreleri Temizle ({activeFilterCount})
            </button>
          ) : null}
        </div>

        {list.isLoading && !list.data ? (
          <ListSkeleton rows={5} />
        ) : items.length === 0 ? (
          isFiltered ? (
            <EmptyState
              icon={Truck}
              variant="no-results"
              title="Filtre eşleşmedi"
              description="Aramanızla eşleşen tedarikçi yok."
              action={
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-sm text-brand-600 hover:underline font-semibold"
                >
                  Filtreleri temizle
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={Truck}
              variant="no-data"
              title="Henüz tedarikçi yok"
              description="Sisteme kayıt olan ilk tedarikçi burada listelenecek."
            />
          )
        ) : (
          <SuppliersTable items={items} />
        )}

        {list.data && list.data.pagination.totalPages > 1 ? (
          <div className="px-4 py-3 border-t border-surface-border flex items-center justify-between text-sm">
            <span className="text-admin-text-muted">
              Sayfa {list.data.pagination.page} /{" "}
              {list.data.pagination.totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={(filters.page ?? 1) <= 1}
                onClick={() =>
                  setFilters({ page: Math.max(1, (filters.page ?? 1) - 1) })
                }
                className="px-3 py-1.5 text-sm rounded-lg border border-surface-border bg-white hover:bg-surface-subtle disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Önceki
              </button>
              <button
                type="button"
                disabled={
                  (filters.page ?? 1) >= list.data.pagination.totalPages
                }
                onClick={() =>
                  setFilters({
                    page: Math.min(
                      list.data!.pagination.totalPages,
                      (filters.page ?? 1) + 1,
                    ),
                  })
                }
                className="px-3 py-1.5 text-sm rounded-lg border border-surface-border bg-white hover:bg-surface-subtle disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sonraki
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SuppliersTable({ items }: { items: AdminSupplierListItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-subtle border-b border-surface-border">
          <tr>
            <th className="text-left px-4 py-3 font-semibold text-admin-text-muted text-xs uppercase tracking-wider">
              Tedarikçi
            </th>
            <th className="text-left px-4 py-3 font-semibold text-admin-text-muted text-xs uppercase tracking-wider">
              VKN
            </th>
            <th className="text-left px-4 py-3 font-semibold text-admin-text-muted text-xs uppercase tracking-wider">
              Üyelik
            </th>
            <th className="text-right px-4 py-3 font-semibold text-admin-text-muted text-xs uppercase tracking-wider">
              Alıcı
            </th>
            <th className="text-right px-4 py-3 font-semibold text-admin-text-muted text-xs uppercase tracking-wider">
              Teklif
            </th>
            <th className="text-right px-4 py-3 font-semibold text-admin-text-muted text-xs uppercase tracking-wider">
              Sipariş
            </th>
            <th className="text-left px-4 py-3 font-semibold text-admin-text-muted text-xs uppercase tracking-wider">
              Kayıt
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr
              key={s.id}
              className="border-b border-surface-border last:border-0 hover:bg-surface-subtle transition-colors"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/admin/suppliers/${s.id}`}
                  className="flex items-center gap-2.5 group"
                >
                  <div className="h-9 w-9 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <Truck className="h-4 w-4 text-purple-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-admin-text group-hover:text-brand-700 truncate">
                      {s.companyName}
                    </p>
                    {s.city ? (
                      <p className="text-xs text-admin-text-muted">{s.city}</p>
                    ) : null}
                  </div>
                </Link>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-admin-text-muted">
                {s.taxNumber}
              </td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border",
                    s.membership === "PREMIUM"
                      ? "bg-warning-50 text-warning-700 border-warning-200"
                      : "bg-slate-50 text-slate-700 border-slate-200",
                  )}
                >
                  {s.membership}
                </span>
                {s.isBlocked ? (
                  <span className="ml-1 inline-flex px-2 py-0.5 rounded-md text-xs font-semibold bg-danger-50 text-danger-700 border border-danger-200">
                    Engelli
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-right text-sm font-medium">
                {s._count.tenantRelations}
              </td>
              <td className="px-4 py-3 text-right text-sm font-medium">
                {s._count.bids}
              </td>
              <td className="px-4 py-3 text-right text-sm font-medium">
                {s._count.orders}
              </td>
              <td className="px-4 py-3 text-xs text-admin-text-muted whitespace-nowrap">
                {format(new Date(s.createdAt), "d MMM yyyy", { locale: tr })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminSuppliersPage() {
  return (
    <RequireAdminAuth>
      <AdminShell>
        <Suspense fallback={null}>
          <SuppliersView />
        </Suspense>
      </AdminShell>
    </RequireAdminAuth>
  );
}
