"use client";

import { TableStateRow } from "@/components/list/table-state";
import { AuditLogRow } from "@/components/audit/audit-log-row";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { Pagination } from "@/components/list";
import { useAuditLogs } from "@/hooks/use-audit-logs";
import { useState } from "react";

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
            <TableStateRow
                colSpan={4}
                loading={query.isLoading}
                error={query.isError}
                onRetry={() => void query.refetch()}
                empty="Bu firmayla ilgili denetim kaydı yok"
              />
          ) : (
            // Genel Denetim Kaydı'yla aynı satır: etiketli eylem/aktör/detay (O-047).
            items.map((r) => (
              <AuditLogRow key={r.id} item={r} showEntity={false} />
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
