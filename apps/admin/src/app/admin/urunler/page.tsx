"use client";

import { TableStateRow } from "@/components/list/table-state";
import { Badge } from "@/components/catalyst/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/catalyst/table";
import { AdminShell } from "@/components/layout/admin-shell";
import { PageHeader, Pagination, SearchInput } from "@/components/list";
import { useAdminProducts, useAdminProductStats, type ProductReviewStatus } from "@/hooks/use-admin-products";
import { safeFormat } from "@/lib/date";
import { PRODUCT_REVIEW_STATUS } from "@/lib/status-labels";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const PAGE_SIZE = 25;
type Tab = "PENDING" | "REJECTED" | "APPROVED" | "ALL";

/** Bekleme rozeti — SLA (1+ gün amber, 3+ gün kırmızı; ürün kuyruğu KYC'den hızlı akmalı). */
function waitBadge(iso: string | null) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  const color = days >= 3 ? "red" : days >= 1 ? "amber" : "zinc";
  return <Badge color={color}>{days === 0 ? "bugün" : `${days} gün`}</Badge>;
}

/**
 * ÜRÜN ONAY KUYRUĞU (2026-09-09): her ürün vitrine çıkmadan burada incelenir.
 * Bekleyenler EN ESKİ ÖNCE; yayındaki ürünün içerik düzenlemesi de buraya
 * düşer (vitrinde kalır — rozet "yayında · yeniden inceleme").
 */
function UrunlerView() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>((sp?.get("status") as Tab | null) ?? "PENDING");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const query = useAdminProducts({ status: tab, q: q || undefined, page, pageSize: PAGE_SIZE });
  const stats = useAdminProductStats();
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "PENDING", label: "Onay bekleyen", count: stats.data?.pending },
    { key: "REJECTED", label: "Reddedilen", count: stats.data?.rejected },
    { key: "APPROVED", label: "Yayında" },
    { key: "ALL", label: "Tümü" },
  ];

  return (
    <div className="max-w-[1100px] space-y-6">
      <PageHeader
        title="Ürünler"
        description="Vitrine çıkmak isteyen ürünler — en eski gönderim önce. Onaylanan ürün anında yayına girer; reddedilen gerekçesiyle firmaya döner."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-1 rounded-xl bg-zinc-100 p-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => {
                setTab(t.key);
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                tab === t.key ? "bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-950/5" : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              {t.label}
              {t.count != null ? <span className="ml-1.5 text-xs font-medium tabular-nums text-zinc-400">{t.count}</span> : null}
            </button>
          ))}
        </div>
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Ürün ya da firma ara" />
      </div>

      <div className="admin-card overflow-hidden">
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>Ürün</TableHeader>
              <TableHeader>Firma</TableHeader>
              <TableHeader>Kategori</TableHeader>
              <TableHeader>Durum</TableHeader>
              <TableHeader>Gönderim</TableHeader>
              <TableHeader>Bekleme</TableHeader>
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
                empty={tab === "PENDING" ? "Kuyruk boş — onay bekleyen ürün yok" : "Kayıt yok"}
              />
            ) : (
              items.map((p) => {
                const meta = PRODUCT_REVIEW_STATUS[p.reviewStatus] ?? { label: p.reviewStatus, color: "zinc" as const };
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-admin-text font-medium">
                      <Link href={`/admin/urunler/${p.id}`} className="flex items-center gap-3 hover:underline">
                        {p.cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.cover} alt="" className="size-10 shrink-0 rounded-md object-cover ring-1 ring-zinc-950/10" />
                        ) : (
                          <span className="size-10 shrink-0 rounded-md bg-zinc-100 ring-1 ring-zinc-950/10" aria-hidden />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate">{p.name}</span>
                          <span className="text-admin-text-muted block text-xs">{p.imageCount} görsel</span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-admin-text text-sm">
                      <Link href={`/admin/firmalar/${p.company.id}`} className="hover:underline">
                        {p.company.name}
                      </Link>
                      <span className="text-admin-text-muted block text-xs">{p.company.city ?? "—"} · {p.company.tier}</span>
                    </TableCell>
                    <TableCell className="text-admin-text-muted text-xs">{p.categoryName ?? "—"}</TableCell>
                    <TableCell>
                      <Badge color={meta.color}>{meta.label}</Badge>
                      {p.reviewStatus === "PENDING" && p.isPublic ? (
                        <span className="text-admin-text-muted mt-1 block text-[11px]">yayında · yeniden inceleme</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-admin-text-muted text-xs whitespace-nowrap">
                      {p.submittedAt ? safeFormat(p.submittedAt, "d MMM yyyy HH:mm") : "—"}
                    </TableCell>
                    <TableCell>{p.reviewStatus === "PENDING" ? waitBadge(p.submittedAt) : null}</TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/admin/urunler/${p.id}`}
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
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>
    </div>
  );
}

export default function AdminUrunlerPage() {
  return (
    <AdminShell>
      <Suspense fallback={null}>
        <UrunlerView />
      </Suspense>
    </AdminShell>
  );
}
