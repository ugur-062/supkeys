"use client";

import { AdminShell } from "@/components/layout/admin-shell";
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import { useDemoRequests } from "@/hooks/use-demo-requests";
import { DEMO_REQUEST_STATUS_ORDER } from "@/lib/demo-requests/status";
import type { DemoRequestStatus } from "@/lib/demo-requests/types";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { DemoRequestsTable } from "./demo-requests-table";
import { DetailDrawer } from "./detail-drawer";
import { FiltersBar } from "./filters-bar";
import { Pagination } from "./pagination";
import { StatsCards } from "./stats-cards";

const VALID_STATUSES = new Set<string>(DEMO_REQUEST_STATUS_ORDER);

function parseStatus(value: string | null): DemoRequestStatus | "" {
  if (value && VALID_STATUSES.has(value)) {
    return value as DemoRequestStatus;
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

function DemoRequestsContent() {
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

  const list = useDemoRequests(queryParams);

  const updateUrl = useCallback(
    (next: {
      status?: DemoRequestStatus | "";
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
      router.replace(qs ? `/admin/demo-requests?${qs}` : "/admin/demo-requests");
    },
    [router, searchParams],
  );

  const handleSearchChange = (value: string) => {
    updateUrl({ search: value, page: 1 });
  };
  const handleStatusChange = (value: DemoRequestStatus | "") => {
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
            Demo Talepleri
          </h1>
          <p className="text-admin-text-muted">
            Landing page üzerinden gelen talepleri buradan yönet.
          </p>
        </div>

        <StatsCards />

        <FiltersBar
          search={search}
          status={status}
          onSearchChange={handleSearchChange}
          onStatusChange={handleStatusChange}
          onClear={handleClear}
        />

        <div className="admin-card overflow-hidden">
          <DemoRequestsTable
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

      <DetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />
    </AdminShell>
  );
}

export function DemoRequestsView() {
  return (
    <RequireAdminAuth>
      <DemoRequestsContent />
    </RequireAdminAuth>
  );
}
