"use client";

import { TableStateRow } from "@/components/list/table-state";
import { Badge } from "@/components/catalyst/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { AdminShell } from "@/components/layout/admin-shell";
import { PageHeader, Pagination } from "@/components/list";
import { useAuditLogs } from "@/hooks/use-audit-logs";
import { safeFormat } from "@/lib/date";
import { useState } from "react";

/**
 * Güvenlik görünümü — başarısız giriş denemeleri (firma + admin portalları).
 * Kaynak: audit log action=auth.login_failed (IP + user-agent kayıtlı).
 */
function GuvenlikView() {
  const [page, setPage] = useState(1);
  const query = useAuditLogs({ action: "auth.login_failed", page, pageSize: 100 });
  const items = query.data?.items ?? [];
  const pg = query.data?.pagination;

  // Brute-force deseni: bu sayfadaki (son 100 kayıt) en çok deneme yapan
  // IP'ler ve en çok hedeflenen e-postalar.
  const topOf = (key: (r: (typeof items)[number]) => string | null) => {
    const counts = new Map<string, number>();
    for (const r of items) {
      const v = key(r);
      if (!v) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .filter(([, n]) => n >= 2);
  };
  const topIps = topOf((r) => r.ip);
  const topEmails = topOf((r) => r.actorEmail);

  return (
    <div className="max-w-[1100px] space-y-6">
      <PageHeader
        title="Güvenlik"
        description="Başarısız giriş denemeleri — şüpheli giriş etkinliği takibi."
      />

      {topIps.length > 0 || topEmails.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="admin-card px-5 py-4">
            <h3 className="text-admin-text text-sm font-semibold">
              En çok deneme yapan IP&apos;ler
              <span className="text-admin-text-muted ml-1 text-xs font-normal">
                (son {items.length} kayıt)
              </span>
            </h3>
            <ul className="mt-2 space-y-1">
              {topIps.length === 0 ? (
                <li className="text-admin-text-muted text-xs">
                  Tekrarlayan IP yok
                </li>
              ) : (
                topIps.map(([ip, n]) => (
                  <li key={ip} className="flex justify-between text-sm">
                    <span className="text-admin-text font-mono text-xs">
                      {ip}
                    </span>
                    <Badge color={n >= 5 ? "red" : "amber"}>{n} deneme</Badge>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className="admin-card px-5 py-4">
            <h3 className="text-admin-text text-sm font-semibold">
              En çok hedeflenen hesaplar
              <span className="text-admin-text-muted ml-1 text-xs font-normal">
                (son {items.length} kayıt)
              </span>
            </h3>
            <ul className="mt-2 space-y-1">
              {topEmails.length === 0 ? (
                <li className="text-admin-text-muted text-xs">
                  Tekrarlayan hedef yok
                </li>
              ) : (
                topEmails.map(([email, n]) => (
                  <li key={email} className="flex justify-between text-sm">
                    <span className="text-admin-text text-xs">{email}</span>
                    <Badge color={n >= 5 ? "red" : "amber"}>{n} deneme</Badge>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="admin-card overflow-hidden">
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>Zaman</TableHeader>
              <TableHeader>Portal</TableHeader>
              <TableHeader>E-posta</TableHeader>
              <TableHeader>Sebep</TableHeader>
              <TableHeader>IP</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 ? (
              <TableStateRow
                colSpan={5}
                loading={query.isLoading}
                empty="Başarısız giriş denemesi kaydı yok"
              />
            ) : (
              items.map((r) => {
                const meta = (r.metadata ?? {}) as {
                  portal?: string;
                  reason?: string;
                };
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-admin-text-muted text-xs whitespace-nowrap">
                      {safeFormat(r.createdAt, "d MMM yyyy HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        color={r.actorType === "admin" ? "red" : "blue"}
                      >
                        {meta.portal ?? r.actorType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-admin-text text-sm">
                      {r.actorEmail ?? "—"}
                    </TableCell>
                    <TableCell className="text-admin-text-muted font-mono text-xs">
                      {meta.reason ?? "—"}
                    </TableCell>
                    <TableCell className="text-admin-text-muted font-mono text-xs">
                      {r.ip ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {pg && pg.totalPages > 1 ? (
          <Pagination
            page={pg.page}
            totalPages={pg.totalPages}
            total={pg.total}
            pageSize={pg.pageSize}
            onPageChange={setPage}
          />
        ) : null}
      </div>
    </div>
  );
}

export default function AdminGuvenlikPage() {
  return (
    <AdminShell>
      <GuvenlikView />
    </AdminShell>
  );
}
