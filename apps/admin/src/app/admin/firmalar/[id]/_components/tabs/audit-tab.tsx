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
import { Pagination } from "@/components/list";
import { useAuditLogs } from "@/hooks/use-audit-logs";
import { safeFormat } from "@/lib/date";
import { useState } from "react";

const ACTOR_COLORS: Record<string, "amber" | "blue" | "green" | "zinc"> = {
  admin: "amber",
  tenant: "blue",
  supplier: "green",
  system: "zinc",
};

/** Denetim — bu firmaya (entity id) dokunan audit kayıtları. */
export function AuditTab({ companyId }: { companyId: string }) {
  const [page, setPage] = useState(1);
  const query = useAuditLogs({ search: companyId, page });
  const items = query.data?.items ?? [];
  const pg = query.data?.pagination;

  return (
    <div className="admin-card overflow-hidden">
      <Table dense>
        <TableHead>
          <TableRow>
            <TableHeader>Zaman</TableHeader>
            <TableHeader>Aktör</TableHeader>
            <TableHeader>Eylem</TableHeader>
            <TableHeader>Detay</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className="text-admin-text-muted py-8 text-center"
              >
                {query.isLoading
                  ? "Yükleniyor..."
                  : query.isError
                    ? "Veri alınamadı"
                    : "Bu firmayla ilgili denetim kaydı yok"}
              </TableCell>
            </TableRow>
          ) : (
            items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-admin-text-muted text-xs whitespace-nowrap">
                  {safeFormat(r.createdAt, "d MMM yyyy HH:mm")}
                </TableCell>
                <TableCell>
                  <Badge color={ACTOR_COLORS[r.actorType] ?? "zinc"}>
                    {r.actorType}
                  </Badge>
                  {r.actorEmail ? (
                    <span className="text-admin-text-muted ml-2 text-xs">
                      {r.actorEmail}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-admin-text font-mono text-xs">
                  {r.action}
                </TableCell>
                <TableCell className="text-admin-text-muted max-w-[300px] truncate text-xs">
                  {r.metadata ? JSON.stringify(r.metadata) : "—"}
                </TableCell>
              </TableRow>
            ))
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
  );
}
