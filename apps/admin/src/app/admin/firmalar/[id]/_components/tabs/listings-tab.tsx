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
import { useAdminCompanyListings } from "@/hooks/use-admin-inspection";
import { safeFormat } from "@/lib/date";
import { LISTING_STATUS } from "@/lib/status-labels";
import Link from "next/link";

/** İlanlar — firmanın tüm ihaleleri; satır → tam inceleme sayfası. */
export function ListingsTab({ companyId }: { companyId: string }) {
  const query = useAdminCompanyListings(companyId);
  const items = query.data ?? [];

  return (
    <div className="admin-card overflow-hidden">
      <Table dense>
        <TableHead>
          <TableRow>
            <TableHeader>İlan</TableHeader>
            <TableHeader>Tip</TableHeader>
            <TableHeader>Durum</TableHeader>
            <TableHeader>Teklif</TableHeader>
            <TableHeader>Kapanış</TableHeader>
            <TableHeader className="text-right">İşlem</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.length === 0 ? (
            <TableStateRow
                colSpan={6}
                loading={query.isLoading}
                error={query.isError}
                onRetry={() => void query.refetch()}
                empty="İlan yok"
              />
          ) : (
            items.map((l) => {
              const meta = LISTING_STATUS[l.status] ?? {
                label: l.status,
                color: "zinc" as const,
              };
              return (
                <TableRow key={l.id}>
                  <TableCell className="text-admin-text font-medium">
                    <Link
                      href={`/admin/ilanlar/${l.id}`}
                      className="hover:underline"
                    >
                      {l.title}
                    </Link>
                    <span className="text-admin-text-muted block font-mono text-[11px]">
                      {l.number ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge color={l.type === "ALIM" ? "blue" : "green"}>
                      {l.type === "ALIM" ? "Alım" : "Satış"}
                    </Badge>
                    {l.format === "ENGLISH_AUCTION" ? (
                      <Badge color="amber" className="ml-1.5">
                        Eksiltme
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge color={meta.color}>{meta.label}</Badge>
                  </TableCell>
                  <TableCell className="text-admin-text text-sm tabular-nums">
                    {l.bidCount}
                    <span className="text-admin-text-muted text-xs">
                      {" "}
                      / {l.invitationCount} davet
                    </span>
                  </TableCell>
                  <TableCell className="text-admin-text-muted text-xs whitespace-nowrap">
                    {l.closesAt
                      ? safeFormat(l.closesAt, "d MMM yyyy HH:mm")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/ilanlar/${l.id}`}
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
