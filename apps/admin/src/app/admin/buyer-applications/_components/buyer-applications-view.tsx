"use client";

import { AdminShell } from "@/components/layout/admin-shell";
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import { useBuyerApplications } from "@/hooks/use-buyer-applications";
import { APPLICATION_STATUS_ORDER } from "@/lib/applications/status";
import type { ApplicationStatus } from "@/lib/applications/types";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { BuyerApplicationsTable } from "./applications-table";
import { BuyerDetailDrawer } from "./detail-drawer";
import { FiltersBar } from "./filters-bar";
import { Pagination } from "./pagination";
import { BuyerStatsCards } from "./stats-cards";

const VALID_STATUSES = new Set<string>(APPLICATION_STATUS_ORDER);

function parseStatus(value: string | null): ApplicationStatus | "" {
  if (value && VALID_STATUSES.has(value)) {
    return value as ApplicationStatus;
  }
  return "";
}

function parsePage(value: string | null): number {
  const n = value ? parseInt(value, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parsePageSize(value: string | null): number {
  const n = value ? parseInt(value, 10) : 20;
  if (!Number.isFinite(n) || n < 1) return 20;
  return Math.min(n, 100);
}

function BuyerApplicationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const status = parseStatus(searchParams.get("status"));
  const search = searchParams.get("search") ?? "";
  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("pageSize"));

  const queryParams = useMemo(
    () => ({
      status: status || undefined,
      search: search || undefined,
      page,
      pageSize,
    }),
    [status, search, page, pageSize],
  );

  const list = useBuyerApplications(queryParams);

  const updateUrl = useCallback(
    (next: {
      status?: ApplicationStatus | "";
      search?: string;
      page?: number;
      pageSize?: number;
    }) => {
      const params = new URLSearchParams(searchParams.toString());

      const apply = (key: string, value: string | number | undefined) => {
        if (value === undefined) return;
        const str = String(value);
        if (str === "" || str === "0") params.delete(key);
        else params.set(key, str);
      };

      if (next.status !== undefined) apply("status", next.status);
      if (next.search !== undefined) apply("search", next.search);
      if (next.pageSize !== undefined) apply("pageSize", next.pageSize);
      if (next.page !== undefined) {
        if (next.page <= 1) params.delete("page");
        else params.set("page", String(next.page));
      }

      const qs = params.toString();
      router.replace(
        qs ? `/admin/buyer-applications?${qs}` : "/admin/buyer-applications",
      );
    },
    [router, searchParams],
  );

  const handleSearchChange = (value: string) => {
    updateUrl({ search: value, page: 1 });
  };
  const handleStatusChange = (value: ApplicationStatus | "") => {
    updateUrl({ status: value, page: 1 });
  };
  const handleClear = () => {
    updateUrl({ search: "", status: "", page: 1 });
  };
  const handlePageChange = (next: number) => {
    updateUrl({ page: next });
  };

  const items = list.data?.items ?? [];
  const pagination = list.data?.pagination;

  return (
    <AdminShell>
      <div className="space-y-5 max-w-6xl">
        <div className="space-y-1">
          <h1 className="font-display font-bold text-3xl text-admin-text">
            Alıcı Başvuruları
          </h1>
          <p className="text-admin-text-muted">
            Demo görüşmesi sonrası gönderilen davet üzerinden gelen kayıtları
            buradan inceleyin.
          </p>
        </div>

        <BuyerStatsCards />

        <FiltersBar
          search={search}
          status={status}
          onSearchChange={handleSearchChange}
          onStatusChange={handleStatusChange}
          onClear={handleClear}
        />

        <div className="admin-card overflow-hidden">
          <BuyerApplicationsTable
            items={items}
            isLoading={list.isLoading}
            isError={list.isError}
            pageSize={pageSize}
            onRetry={() => list.refetch()}
            onSelect={setSelectedId}
          />

          {pagination && (
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              pageSize={pagination.pageSize}
              onPageChange={handlePageChange}
            />
          )}
        </div>
      </div>

      <BuyerDetailDrawer
        id={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </AdminShell>
  );
}

export function BuyerApplicationsView() {
  return (
    <RequireAdminAuth>
      <BuyerApplicationsContent />
    </RequireAdminAuth>
  );
}
