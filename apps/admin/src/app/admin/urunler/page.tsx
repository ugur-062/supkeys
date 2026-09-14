"use client";

import { TableStateRow } from "@/components/list/table-state";
import { Badge } from "@/components/catalyst/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/catalyst/table";
import { AdminShell } from "@/components/layout/admin-shell";
import { PageHeader, Pagination, SearchInput } from "@/components/list";
import {
  useAdminProducts,
  useAdminProductStats,
  useBulkApproveProducts,
  type ProductReviewStatus,
} from "@/hooks/use-admin-products";
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
  /**
   * TEK FİRMA KUYRUĞU — ücretsiz pakette ürün tavanı 50 (2026-09-14). Bir
   * firmanın ürünlerini sayfa sayfa avlamak yerine adına tıklayıp hepsini tek
   * görünüme toplamak, toplu onayın gerçek çalışma biçimi.
   */
  const [firma, setFirma] = useState<{ id: string; name: string } | null>(null);
  const [secili, setSecili] = useState<string[]>([]);
  const query = useAdminProducts({
    status: tab,
    q: q || undefined,
    companyId: firma?.id,
    page,
    pageSize: PAGE_SIZE,
  });
  const stats = useAdminProductStats();
  const toplu = useBulkApproveProducts();
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Seçim yalnız ONAY BEKLEYENDE anlamlı — yayındaki ürün yeniden onaylanmaz.
  const secilebilir = items.filter((p) => p.reviewStatus === "PENDING").map((p) => p.id);
  const seciliGecerli = secili.filter((id) => secilebilir.includes(id));
  const hepsiSecili = secilebilir.length > 0 && seciliGecerli.length === secilebilir.length;
  const sifirla = () => setSecili([]);

  const topluOnayla = async () => {
    if (seciliGecerli.length === 0) return;
    const r = await toplu.mutateAsync(seciliGecerli);
    sifirla();
    if (r.skipped.length > 0) {
      // Atlananları SESSİZCE yutmak, admin'in onayladığını sandığı ürünün
      // kuyrukta kalmasına yol açardı.
      window.alert(
        `${r.approved} ürün onaylandı. ${r.skipped.length} ürün atlandı: ` +
          r.skipped.map((x) => x.reason).join(", "),
      );
    }
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "PENDING", label: "Onay bekleyen", count: stats.data?.pending },
    { key: "REJECTED", label: "Düzeltme istenen", count: stats.data?.rejected },
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

      {firma ? (
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
          <span className="text-admin-text">
            Yalnız <strong>{firma.name}</strong> ürünleri
          </span>
          <button
            type="button"
            onClick={() => { setFirma(null); setPage(1); sifirla(); }}
            className="text-admin-text-muted text-xs font-semibold underline underline-offset-2 hover:text-zinc-900"
          >
            süzgeci kaldır
          </button>
        </div>
      ) : null}

      {seciliGecerli.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-900 bg-zinc-900 px-3 py-2 text-sm text-white">
          <span className="font-semibold tabular-nums">{seciliGecerli.length} ürün seçildi</span>
          <button
            type="button"
            disabled={toplu.isPending}
            onClick={() => void topluOnayla()}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 transition hover:bg-zinc-100 disabled:opacity-50"
          >
            {toplu.isPending ? "Onaylanıyor…" : "Seçilenleri onayla"}
          </button>
          <button type="button" onClick={sifirla} className="text-xs font-medium text-zinc-300 underline underline-offset-2">
            seçimi temizle
          </button>
          {toplu.isError ? (
            <span role="alert" className="text-xs text-rose-200">
              Onaylanamadı — tekrar deneyin
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="admin-card overflow-hidden">
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader className="w-10">
                {secilebilir.length > 0 ? (
                  <input
                    type="checkbox"
                    aria-label="Sayfadaki onay bekleyenlerin tümünü seç"
                    checked={hepsiSecili}
                    onChange={(e) => setSecili(e.target.checked ? secilebilir : [])}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                ) : null}
              </TableHeader>
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
                colSpan={8}
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
                    <TableCell>
                      {p.reviewStatus === "PENDING" ? (
                        <input
                          type="checkbox"
                          aria-label={`${p.name} seç`}
                          checked={seciliGecerli.includes(p.id)}
                          onChange={(e) =>
                            setSecili((prev) =>
                              e.target.checked
                                ? [...prev, p.id]
                                : prev.filter((x) => x !== p.id),
                            )
                          }
                          className="h-4 w-4 rounded border-zinc-300"
                        />
                      ) : null}
                    </TableCell>
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
                      <button
                        type="button"
                        title="Yalnız bu firmanın ürünlerini göster"
                        onClick={() => {
                          setFirma({ id: p.company.id, name: p.company.name });
                          setPage(1);
                          sifirla();
                        }}
                        className="text-left hover:underline"
                      >
                        {p.company.name}
                      </button>
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
