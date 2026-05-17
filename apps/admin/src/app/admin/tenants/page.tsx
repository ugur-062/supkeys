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
  useAdminTenants,
  type AdminTenantListItem,
} from "@/hooks/use-admin-tenants";
import { useListFilters } from "@/hooks/use-list-filters";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { AlertTriangle, Building2, Clock, Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "En Yeni" },
  { value: "createdAt:asc", label: "En Eski" },
  { value: "name:asc", label: "İsim (A → Z)" },
  { value: "name:desc", label: "İsim (Z → A)" },
  { value: "membershipEndAt:asc", label: "Üyelik Bitişi (yakın → uzak)" },
  { value: "membershipEndAt:desc", label: "Üyelik Bitişi (uzak → yakın)" },
];

function membershipStatus(endAt: string | null): {
  label: string;
  className: string;
  icon: typeof Clock | null;
  daysLeft: number | null;
} {
  if (!endAt) {
    return {
      label: "Sınırsız",
      className: "bg-slate-100 text-slate-600 border-slate-200",
      icon: null,
      daysLeft: null,
    };
  }
  const end = new Date(endAt);
  const days = Math.ceil((end.getTime() - Date.now()) / (24 * 3600 * 1000));
  if (days < 0) {
    return {
      label: `${Math.abs(days)} gün önce doldu`,
      className: "bg-danger-100 text-danger-800 border-danger-300 font-bold",
      icon: AlertTriangle,
      daysLeft: days,
    };
  }
  if (days <= 7) {
    return {
      label: `${days} gün kaldı`,
      className: "bg-danger-50 text-danger-700 border-danger-200",
      icon: AlertTriangle,
      daysLeft: days,
    };
  }
  if (days <= 30) {
    return {
      label: `${days} gün kaldı`,
      className: "bg-warning-50 text-warning-700 border-warning-200",
      icon: Clock,
      daysLeft: days,
    };
  }
  return {
    label: `${days} gün kaldı`,
    className: "bg-success-50 text-success-700 border-success-200",
    icon: null,
    daysLeft: days,
  };
}

interface TenantFilters {
  search?: string;
  sort?: string;
  page?: number;
  [key: string]: string | number | boolean | undefined;
}

function TenantsView() {
  const { filters, setFilters, clearFilters, activeFilterCount } =
    useListFilters<TenantFilters>({ sort: "createdAt:desc" });

  const list = useAdminTenants({
    search: filters.search,
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
          Müşteri Firmaları
        </h1>
        <p className="text-sm text-admin-text-muted mt-1">
          Sisteme kayıtlı tüm tenant'lar.
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
            <SortDropdown
              value={filters.sort ?? "createdAt:desc"}
              onChange={(v) => setFilters({ sort: v })}
              options={SORT_OPTIONS}
            />
            <ResultCount
              total={total}
              isFiltered={isFiltered}
              unit="tenant"
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
              icon={Building2}
              variant="no-results"
              title="Filtre eşleşmedi"
              description="Aramanızla eşleşen tenant yok."
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
              icon={Building2}
              variant="no-data"
              title="Henüz tenant yok"
              description="Sisteme kayıt olan ilk tenant burada listelenecek."
            />
          )
        ) : (
          <TenantsTable items={items} />
        )}

        {list.data && list.data.pagination.totalPages > 1 ? (
          <div className="px-4 py-3 border-t border-surface-border flex items-center justify-between text-sm">
            <span className="text-admin-text-muted">
              Sayfa {list.data.pagination.page} / {list.data.pagination.totalPages}
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

function TenantsTable({ items }: { items: AdminTenantListItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-subtle border-b border-surface-border">
          <tr>
            <th className="text-left px-4 py-3 font-semibold text-admin-text-muted text-xs uppercase tracking-wider">
              Firma
            </th>
            <th className="text-left px-4 py-3 font-semibold text-admin-text-muted text-xs uppercase tracking-wider">
              VKN
            </th>
            <th className="text-left px-4 py-3 font-semibold text-admin-text-muted text-xs uppercase tracking-wider">
              Yetkili
            </th>
            <th className="text-right px-4 py-3 font-semibold text-admin-text-muted text-xs uppercase tracking-wider">
              Kullanıcı
            </th>
            <th className="text-right px-4 py-3 font-semibold text-admin-text-muted text-xs uppercase tracking-wider">
              İhale
            </th>
            <th className="text-right px-4 py-3 font-semibold text-admin-text-muted text-xs uppercase tracking-wider">
              Sipariş
            </th>
            <th className="text-left px-4 py-3 font-semibold text-admin-text-muted text-xs uppercase tracking-wider">
              Üyelik Bitişi
            </th>
            <th className="text-left px-4 py-3 font-semibold text-admin-text-muted text-xs uppercase tracking-wider">
              Kayıt
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr
              key={t.id}
              className="border-b border-surface-border last:border-0 hover:bg-surface-subtle transition-colors"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/admin/tenants/${t.id}`}
                  className="flex items-center gap-2.5 group"
                >
                  <div className="h-9 w-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-4 w-4 text-brand-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-admin-text group-hover:text-brand-700 truncate">
                      {t.name}
                    </p>
                    {t.city ? (
                      <p className="text-xs text-admin-text-muted">{t.city}</p>
                    ) : null}
                  </div>
                </Link>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-admin-text-muted">
                {t.taxNumber ?? "—"}
              </td>
              <td className="px-4 py-3">
                {t.users[0] ? (
                  <div>
                    <p className="font-medium text-admin-text text-sm">
                      {t.users[0].firstName} {t.users[0].lastName}
                    </p>
                    <p className="text-xs text-admin-text-muted truncate max-w-[200px]">
                      {t.users[0].email}
                    </p>
                  </div>
                ) : (
                  <span className="text-admin-text-muted text-xs">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <span className="inline-flex items-center gap-1 text-sm">
                  <Users className="h-3.5 w-3.5 text-slate-400" />
                  {t._count.users}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-sm font-medium">
                {t._count.tenders}
              </td>
              <td className="px-4 py-3 text-right text-sm font-medium">
                {t._count.orders}
              </td>
              <td className="px-4 py-3">
                <MembershipCell endAt={t.membershipEndAt} />
              </td>
              <td className="px-4 py-3 text-xs text-admin-text-muted whitespace-nowrap">
                {format(new Date(t.createdAt), "d MMM yyyy", { locale: tr })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MembershipCell({ endAt }: { endAt: string | null }) {
  const status = membershipStatus(endAt);
  const Icon = status.icon;
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          "inline-flex items-center gap-1 self-start rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
          status.className,
        )}
      >
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {status.label}
      </span>
      {endAt ? (
        <span className="text-[11px] text-admin-text-muted whitespace-nowrap">
          {format(new Date(endAt), "d MMM yyyy", { locale: tr })}
        </span>
      ) : null}
    </div>
  );
}

export default function AdminTenantsPage() {
  return (
    <RequireAdminAuth>
      <AdminShell>
        <Suspense fallback={null}>
          <TenantsView />
        </Suspense>
      </AdminShell>
    </RequireAdminAuth>
  );
}
