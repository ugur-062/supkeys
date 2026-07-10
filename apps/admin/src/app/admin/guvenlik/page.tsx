"use client";

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
  const query = useAuditLogs({ action: "auth.login_failed", page });
  const items = query.data?.items ?? [];
  const pg = query.data?.pagination;

  return (
    <div className="max-w-[1100px] space-y-6">
      <PageHeader
        title="Güvenlik"
        description="Başarısız giriş denemeleri — brute-force / hesap ele geçirme takibi."
      />

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
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-admin-text-muted py-8 text-center"
                >
                  {query.isLoading
                    ? "Yükleniyor..."
                    : "🎉 Başarısız giriş denemesi yok"}
                </TableCell>
              </TableRow>
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
