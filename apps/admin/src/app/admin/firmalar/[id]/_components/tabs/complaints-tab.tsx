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
import { useAdminComplaints } from "@/hooks/use-admin-companies";
import { safeFormat } from "@/lib/date";

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
  const query = useAdminComplaints(undefined, companyId);
  const items = query.data?.items ?? [];

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
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-admin-text-muted py-8 text-center"
              >
                {query.isLoading
                  ? "Yükleniyor..."
                  : query.isError
                    ? "Veri alınamadı"
                    : "Bu firmayla ilgili şikayet yok"}
              </TableCell>
            </TableRow>
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
    </div>
  );
}
