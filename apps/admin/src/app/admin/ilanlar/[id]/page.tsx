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
import { Button } from "@/components/ui/button";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import {
  useAdminListingDetail,
  useListingIntervention,
} from "@/hooks/use-admin-inspection";
import { safeFormat } from "@/lib/date";
import {
  BID_STATUS,
  fmtMoney,
  LISTING_STATUS,
  ORDER_STATUS,
} from "@/lib/status-labels";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

function ListingInspection({ id }: { id: string }) {
  const { data: l, isLoading, isError, refetch } = useAdminListingDetail(id);
  const act = useListingIntervention(id);
  const [dialog, setDialog] = useState<"close" | "extend" | "reopen" | null>(
    null,
  );

  const err = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Hata");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="text-admin-text-muted h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (isError || !l) {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="text-admin-text-muted text-sm">İlan yüklenemedi.</p>
        <Button variant="secondary" onClick={() => void refetch()}>
          Tekrar dene
        </Button>
      </div>
    );
  }

  const meta = LISTING_STATUS[l.status] ?? {
    label: l.status,
    color: "zinc" as const,
  };
  const canReopen =
    l.status === "CLOSED" && !l.awardedAt && l.orders.length === 0;

  return (
    <div className="max-w-[1100px] space-y-6">
      {/* Başlık + müdahale */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href={`/admin/firmalar/${l.company.id}?tab=ilanlar`}
            className="text-admin-text-muted hover:text-admin-text mb-2 inline-flex items-center gap-1 text-xs font-medium"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {l.company.name}
          </Link>
          <h1 className="text-admin-text text-2xl font-bold">{l.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge color={meta.color}>{meta.label}</Badge>
            <Badge color={l.type === "ALIM" ? "blue" : "green"}>
              {l.type === "ALIM" ? "Alım" : "Satış"}
            </Badge>
            {l.isSealedBid ? <Badge color="zinc">Kapalı zarf</Badge> : null}
            <span className="text-admin-text-muted font-mono text-xs">
              {l.number ?? "—"}
            </span>
            {l.closesAt ? (
              <span className="text-admin-text-muted text-xs">
                Kapanış: {safeFormat(l.closesAt, "d MMM yyyy HH:mm")}
              </span>
            ) : null}
          </div>
          {l.cancelReason ? (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">
              Kapatma gerekçesi: {l.cancelReason}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {l.status === "OPEN" ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDialog("extend")}
              >
                Süre Uzat
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setDialog("close")}
              >
                İlanı Kapat
              </Button>
            </>
          ) : null}
          {canReopen ? (
            <Button size="sm" onClick={() => setDialog("reopen")}>
              Yeniden Aç
            </Button>
          ) : null}
        </div>
      </div>

      {/* Kapalı-zarf uyarısı — adminin gördüğünü taraflar görmez */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-800">
        Aşağıdaki teklif tutarlarını yalnız platform yönetimi görür — kapalı
        zarf kuralı taraflar arasında geçerlidir. Bu bilgiyi teklifçilerle
        paylaşmayın.
      </div>

      {/* Teklifler */}
      <section className="admin-card overflow-hidden">
        <div className="border-surface-border border-b px-5 py-3.5">
          <h3 className="text-admin-text text-sm font-semibold">
            Teklifler ({l.bids.length})
          </h3>
        </div>
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>Teklifçi</TableHeader>
              <TableHeader>Tutar</TableHeader>
              <TableHeader>Durum</TableHeader>
              <TableHeader>Versiyon/Tur</TableHeader>
              <TableHeader>Gönderim</TableHeader>
              <TableHeader>Eleme gerekçesi</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {l.bids.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-admin-text-muted py-8 text-center"
                >
                  Teklif yok
                </TableCell>
              </TableRow>
            ) : (
              l.bids.map((b) => {
                const bm = BID_STATUS[b.status] ?? {
                  label: b.status,
                  color: "zinc" as const,
                };
                return (
                  <TableRow key={b.id}>
                    <TableCell className="text-admin-text text-sm font-medium">
                      <Link
                        href={`/admin/firmalar/${b.bidderCompany.id}`}
                        className="hover:underline"
                      >
                        {b.bidderCompany.name}
                      </Link>
                      {b.isBuyNow ? (
                        <Badge color="amber" className="ml-1.5">
                          Hemen Al
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-admin-text text-sm font-semibold tabular-nums">
                      {fmtMoney(b.amount, b.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge color={bm.color}>{bm.label}</Badge>
                    </TableCell>
                    <TableCell className="text-admin-text-muted text-xs">
                      v{b.version} / tur {b.round}
                    </TableCell>
                    <TableCell className="text-admin-text-muted text-xs whitespace-nowrap">
                      {b.submittedAt
                        ? safeFormat(b.submittedAt, "d MMM HH:mm")
                        : "taslak"}
                    </TableCell>
                    <TableCell className="text-admin-text-muted max-w-[200px] truncate text-xs">
                      {b.eliminationReason ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </section>

      {/* Kalemler + Davetliler + Siparişler */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="admin-card overflow-hidden">
          <div className="border-surface-border border-b px-5 py-3.5">
            <h3 className="text-admin-text text-sm font-semibold">
              Kalemler ({l.items.length})
            </h3>
          </div>
          <Table dense>
            <TableHead>
              <TableRow>
                <TableHeader>#</TableHeader>
                <TableHeader>Kalem</TableHeader>
                <TableHeader>Miktar</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {l.items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="text-admin-text-muted text-xs">
                    {i.lineNo}
                  </TableCell>
                  <TableCell className="text-admin-text text-sm">
                    {i.name}
                  </TableCell>
                  <TableCell className="text-admin-text-muted text-xs">
                    {Number(i.quantity).toLocaleString("tr-TR")} {i.unit}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <section className="admin-card overflow-hidden">
          <div className="border-surface-border border-b px-5 py-3.5">
            <h3 className="text-admin-text text-sm font-semibold">
              Davetliler ({l.invitations.length}) · Siparişler (
              {l.orders.length})
            </h3>
          </div>
          <div className="divide-surface-border divide-y">
            {l.invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between px-5 py-2.5"
              >
                <Link
                  href={`/admin/firmalar/${inv.invitedCompany.id}`}
                  className="text-admin-text text-sm hover:underline"
                >
                  {inv.invitedCompany.name}
                </Link>
                <span className="text-admin-text-muted text-xs">
                  {safeFormat(inv.createdAt, "d MMM")}
                </span>
              </div>
            ))}
            {l.orders.map((o) => {
              const om = ORDER_STATUS[o.status] ?? {
                label: o.status,
                color: "zinc" as const,
              };
              return (
                <div
                  key={o.id}
                  className="flex items-center justify-between px-5 py-2.5"
                >
                  <Link
                    href={`/admin/siparisler/${o.id}`}
                    className="text-admin-text font-mono text-xs hover:underline"
                  >
                    {o.number ?? o.id.slice(0, 10)}
                  </Link>
                  <span className="flex items-center gap-2">
                    <span className="text-admin-text text-xs tabular-nums">
                      {fmtMoney(o.amount, o.currency)}
                    </span>
                    <Badge color={om.color}>{om.label}</Badge>
                  </span>
                </div>
              );
            })}
            {l.invitations.length === 0 && l.orders.length === 0 ? (
              <p className="text-admin-text-muted px-5 py-6 text-center text-sm">
                Davet / sipariş yok
              </p>
            ) : null}
          </div>
        </section>
      </div>

      {/* Müdahale dialog'ları */}
      <PromptDialog
        open={dialog === "close"}
        title="İlanı Kapat (moderasyon)"
        label="Gerekçe (en az 10 karakter — ilan sahibine bildirilir)"
        placeholder="Örn. şikayet üzerine incelemeye alındı"
        required
        confirmLabel="Kapat"
        onConfirm={(v) => {
          act.mutate(
            { action: "close", reason: (v || "").trim() },
            {
              onSuccess: () => toast.success("İlan kapatıldı"),
              onError: err,
            },
          );
          setDialog(null);
        }}
        onClose={() => setDialog(null)}
      />
      <PromptDialog
        open={dialog === "extend"}
        title="Süre Uzat"
        label="Yeni kapanış (yalnız uzatma — kısaltma yapılamaz)"
        type="datetime-local"
        required
        confirmLabel="Uzat"
        onConfirm={(v) => {
          if (!v) return;
          act.mutate(
            { action: "extend", closesAt: new Date(v).toISOString() },
            {
              onSuccess: () => toast.success("Süre uzatıldı"),
              onError: err,
            },
          );
          setDialog(null);
        }}
        onClose={() => setDialog(null)}
      />
      <PromptDialog
        open={dialog === "reopen"}
        title="İlanı Yeniden Aç"
        label="Yeni kapanış tarihi"
        type="datetime-local"
        required
        confirmLabel="Yeniden Aç"
        onConfirm={(v) => {
          if (!v) return;
          act.mutate(
            { action: "reopen", closesAt: new Date(v).toISOString() },
            {
              onSuccess: () => toast.success("İlan yeniden açıldı"),
              onError: err,
            },
          );
          setDialog(null);
        }}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}

export default function AdminListingPage() {
  const params = useParams<{ id: string }>();
  return (
    <AdminShell>
      {params?.id ? <ListingInspection id={params.id} /> : null}
    </AdminShell>
  );
}
