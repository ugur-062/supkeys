"use client";

import { AdminShell } from "@/components/layout/admin-shell";
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import { useEmailLogs } from "@/hooks/use-email-logs";
import { EMAIL_STATUS_ORDER } from "@/lib/email-logs/status";
import type { EmailLogStatus } from "@/lib/email-logs/types";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { DetailDrawer } from "./detail-drawer";
import { EmailLogsTable } from "./email-logs-table";
import { FiltersBar } from "./filters-bar";
import { Pagination } from "./pagination";

const VALID_STATUSES = new Set<string>(EMAIL_STATUS_ORDER);

function parseStatus(value: string | null): EmailLogStatus | "" {
  if (value && VALID_STATUSES.has(value)) {
    return value as EmailLogStatus;
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

function EmailLogsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const status = parseStatus(searchParams.get("status"));
  const template = searchParams.get("template") ?? "";
  const toEmail = searchParams.get("toEmail") ?? "";
  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("pageSize"));

  const queryParams = useMemo(
    () => ({
      status: status || undefined,
      template: template || undefined,
      toEmail: toEmail || undefined,
      page,
      pageSize,
    }),
    [status, template, toEmail, page, pageSize],
  );

  const list = useEmailLogs(queryParams);

  const updateUrl = useCallback(
    (next: {
      status?: EmailLogStatus | "";
      template?: string;
      toEmail?: string;
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
      if (next.template !== undefined) apply("template", next.template);
      if (next.toEmail !== undefined) apply("toEmail", next.toEmail);
      if (next.pageSize !== undefined) apply("pageSize", next.pageSize);
      if (next.page !== undefined) {
        if (next.page <= 1) params.delete("page");
        else params.set("page", String(next.page));
      }

      const qs = params.toString();
      router.replace(qs ? `/admin/email-logs?${qs}` : "/admin/email-logs");
    },
    [router, searchParams],
  );

  const handleClear = () => {
    updateUrl({ status: "", template: "", toEmail: "", page: 1 });
  };

  const items = list.data?.items ?? [];
  const pagination = list.data?.pagination;

  return (
    <AdminShell>
      <div className="space-y-5 max-w-6xl">
        <div className="space-y-1">
          <h1 className="font-display font-bold text-3xl text-admin-text">
            E-posta Logları
          </h1>
          <p className="text-admin-text-muted">
            Sistem tarafından gönderilen tüm e-postaların kaydı.
          </p>
        </div>

        <FiltersBar
          toEmail={toEmail}
          status={status}
          template={template}
          onToEmailChange={(v) => updateUrl({ toEmail: v, page: 1 })}
          onStatusChange={(v) => updateUrl({ status: v, page: 1 })}
          onTemplateChange={(v) => updateUrl({ template: v, page: 1 })}
          onClear={handleClear}
        />

        <div className="admin-card overflow-hidden">
          <EmailLogsTable
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
              onPageChange={(p) => updateUrl({ page: p })}
            />
          )}
        </div>
      </div>

      <DetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />
    </AdminShell>
  );
}

export function EmailLogsView() {
  return (
    <RequireAdminAuth>
      <EmailLogsContent />
    </RequireAdminAuth>
  );
}
