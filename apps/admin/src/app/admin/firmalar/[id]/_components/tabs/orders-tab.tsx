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
import { useAdminCompanyOrders } from "@/hooks/use-admin-inspection";
import { safeFormat } from "@/lib/date";
import { fmtMoney, ORDER_STATUS } from "@/lib/status-labels";
import Link from "next/link";

/** Siparişler — firma alıcı VEYA satıcı; satır → tam inceleme sayfası. */
export function OrdersTab({ companyId }: { companyId: string }) {
  const query = useAdminCompanyOrders(companyId);
  const items = query.data ?? [];

  return (
    <div className="admin-card overflow-hidden">
      <Table dense>
        <TableHead>
          <TableRow>
            <TableHeader>Sipariş</TableHeader>
            <TableHeader>Rol</TableHeader>
            <TableHeader>Karşı taraf</TableHeader>
            <TableHeader>Tutar</TableHeader>
            <TableHeader>Durum</TableHeader>
            <TableHeader>Tarih</TableHeader>
            <TableHeader className="text-right">İşlem</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.length === 0 ? (
            <TableStateRow
                colSpan={7}
                loading={query.isLoading}
                error={query.isError}
                onRetry={() => void query.refetch()}
                empty="Sipariş yok"
              />
          ) : (
            items.map((o) => {
              const meta = ORDER_STATUS[o.status] ?? {
                label: o.status,
                color: "zinc" as const,
              };
              return (
                <TableRow key={o.id}>
                  <TableCell className="text-admin-text font-mono text-xs">
                    <Link
                      href={`/admin/siparisler/${o.id}`}
                      className="hover:underline"
                    >
                      {o.number ?? o.id.slice(0, 10)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge color={o.role === "buyer" ? "blue" : "green"}>
                      {o.role === "buyer" ? "Alıcı" : "Satıcı"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-admin-text text-sm">
                    {o.role === "buyer" ? o.sellerName : o.buyerName}
                  </TableCell>
                  <TableCell className="text-admin-text text-sm tabular-nums">
                    {fmtMoney(o.amount, o.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge color={meta.color}>{meta.label}</Badge>
                  </TableCell>
                  <TableCell className="text-admin-text-muted text-xs whitespace-nowrap">
                    {safeFormat(o.createdAt, "d MMM yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/siparisler/${o.id}`}
                      className="inline-flex items-center rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-700"
                    >
                      İncele
                    </Link>
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
