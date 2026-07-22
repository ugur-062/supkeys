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
import { useAdminCompanies } from "@/hooks/use-admin-companies";
import { countryFlag, countryName } from "@/lib/country";
import { safeFormat } from "@/lib/date";
import Link from "next/link";
import { useState } from "react";

const PAGE_SIZE = 25;

/** Bekleme süresi rozeti — SLA görselleştirmesi (3+ gün amber, 7+ gün red). */
function waitBadge(updatedAt: string) {
  const days = Math.floor(
    (Date.now() - new Date(updatedAt).getTime()) / 86_400_000,
  );
  const color = days >= 7 ? "red" : days >= 3 ? "amber" : "zinc";
  const label = days === 0 ? "bugün" : `${days} gün`;
  return <Badge color={color}>{label}</Badge>;
}

/**
 * Başvuru kabul kuyruğu — 6/6 belge yüklemiş, inceleme bekleyen (PENDING)
 * firmalar EN-ESKİ-ÖNCE. Satır → firma detayının Belgeler sekmesi.
 */
function BasvurularView() {
  const [page, setPage] = useState(1);
  // Faz Y: kuyruk = ilk-doğrulama PENDING'leri + VERIFIED kalıp belge
  // güncellemesi (revizyon) bekleyenler — status filtresi tek başına yetmez.
  const query = useAdminCompanies({
    queue: "kyc",
    sort: "oldest",
    page,
    pageSize: PAGE_SIZE,
  });
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-[1100px] space-y-6">
      <PageHeader
        title="Başvurular"
        description="Belgelerini tamamlamış, inceleme bekleyen firmalar — en eski başvuru önce."
      />

      <div className="admin-card overflow-hidden">
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>Firma</TableHeader>
              <TableHeader>Ülke</TableHeader>
              <TableHeader>Başvuru</TableHeader>
              <TableHeader>Bekleme</TableHeader>
              <TableHeader className="text-right">İşlem</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 ? (
              <TableStateRow
                colSpan={5}
                loading={query.isLoading}
                error={query.isError}
                onRetry={() => void query.refetch()}
                empty="Kuyruk boş — bekleyen başvuru yok"
              />
            ) : (
              items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-admin-text font-medium">
                    <Link
                      href={`/admin/firmalar/${c.id}?tab=belgeler&from=queue`}
                      className="hover:underline"
                    >
                      {c.name}
                    </Link>
                    <span className="text-admin-text-muted block font-mono text-xs">
                      {c.rothernId ?? "—"}
                    </span>
                    {c.pendingRevisionCount > 0 ? (
                      <Badge color="purple" className="mt-1">
                        Belge Güncellemesi ({c.pendingRevisionCount})
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell
                    className="text-admin-text text-sm whitespace-nowrap"
                    title={countryName(c.country)}
                  >
                    {countryFlag(c.country)} {c.country}
                    {c.country !== "TR" ? (
                      <Badge color="blue" className="ml-2">
                        Yabancı
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-admin-text-muted text-xs whitespace-nowrap">
                    {safeFormat(c.updatedAt, "d MMM yyyy HH:mm")}
                  </TableCell>
                  <TableCell>{waitBadge(c.updatedAt)}</TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/firmalar/${c.id}?tab=belgeler&from=queue`}
                      className="inline-flex items-center rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-700"
                    >
                      İncele
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}

export default function AdminBasvurularPage() {
  return (
    <AdminShell>
      <BasvurularView />
    </AdminShell>
  );
}
