"use client";

import { Pagination } from "@/components/list";
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
import { useAdminComplaints } from "@/hooks/use-admin-companies";
import { safeFormat } from "@/lib/date";
import { useState } from "react";

const STATUS_META: Record<
  string,
  { label: string; color: "amber" | "green" | "zinc" }
> = {
  OPEN: { label: "Açık", color: "amber" },
  RESOLVED: { label: "Çözüldü", color: "green" },
  DISMISSED: { label: "Reddedildi", color: "zinc" },
};

/** Şikayetler — firma hem "hakkında" hem "şikayet eden" olarak. */
export function ComplaintsTab({ companyId }: { companyId: string }) {
  // Sayfalı (derin denetim LU-11): API varsayılan 25 kayıt döndürür; sayfa
  // olmadan 25'i aşan firmada en eski (çözülmüş) şikayetler sessizce kesilirdi.
  const [page, setPage] = useState(1);
  const query = useAdminComplaints(undefined, companyId, undefined, page);
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pageSize = query.data?.pageSize ?? 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="admin-card overflow-hidden">
      <Table dense>
        <TableHead>
          <TableRow>
            <TableHeader>Şikayet Eden</TableHeader>
            <TableHeader>Hakkında</TableHeader>
            <TableHeader>Konu</TableHeader>
            <TableHeader>Durum</TableHeader>
            <TableHeader>Tarih</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.length === 0 ? (
            <TableStateRow
                colSpan={5}
                loading={query.isLoading}
                error={query.isError}
                onRetry={() => void query.refetch()}
                empty="Bu firmayla ilgili şikayet yok"
              />
          ) : (
            items.map((r) => {
              const meta = STATUS_META[r.status] ?? STATUS_META.OPEN;
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-admin-text text-sm">
                    {r.complainant.name}
                  </TableCell>
                  <TableCell className="text-admin-text text-sm">
                    {r.against.name}
                  </TableCell>
                  <TableCell className="text-admin-text max-w-[320px] text-sm">
                    <span className="font-medium">{r.reason}</span>
                    {r.detail ? (
                      <span className="text-admin-text-muted block truncate text-xs">
                        {r.detail}
                      </span>
                    ) : null}
                    {r.adminNote ? (
                      <span className="text-admin-text-muted block truncate text-xs">
                        Not: {r.adminNote}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge color={meta.color}>{meta.label}</Badge>
                  </TableCell>
                  <TableCell className="text-admin-text-muted text-xs whitespace-nowrap">
                    {safeFormat(r.createdAt, "d MMM yyyy")}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      {totalPages > 1 ? (
        <Pagination
          page={query.data?.page ?? page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
