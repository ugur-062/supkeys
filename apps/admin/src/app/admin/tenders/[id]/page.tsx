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
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import { Button } from "@/components/ui/button";
import {
  TENDER_CANCELLABLE,
  useAdminCancelTender,
  useAdminTenderDetail,
  type AdminAttachment,
} from "@/hooks/use-admin-interventions";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { ChevronLeft, Paperclip } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";

const TENDER_STATUS: Record<string, { label: string; color: "zinc" | "blue" | "amber" | "green" | "red" }> = {
  DRAFT: { label: "Taslak", color: "zinc" },
  IN_APPROVAL: { label: "Onayda", color: "amber" },
  OPEN_FOR_BIDS: { label: "Tekliflere Açık", color: "blue" },
  IN_AWARD: { label: "Kazandırma", color: "amber" },
  AWARDED: { label: "Kazandırıldı", color: "green" },
  CLOSED_NO_AWARD: { label: "Kapandı", color: "zinc" },
  CANCELLED: { label: "İptal", color: "red" },
};

const BID_STATUS: Record<string, string> = {
  DRAFT: "Taslak",
  SUBMITTED: "Gönderildi",
  WITHDRAWN: "Geri Çekildi",
  REJECTED: "Reddedildi",
  AWARDED_PARTIAL: "Kısmi Kazandı",
  AWARDED_FULL: "Tam Kazandı",
  LOST: "Kaybetti",
};

function fmtAmount(v: string | null, currency: string) {
  if (v == null) return "—";
  return `${Number(v).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function fmtDate(v: string | null) {
  return v ? format(new Date(v), "d MMM yyyy HH:mm", { locale: tr }) : "—";
}

function TenderDetail() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : null;
  const query = useAdminTenderDetail(id);
  const cancel = useAdminCancelTender(query.data?.tenant.id ?? "");

  if (query.isLoading || !query.data) {
    return (
      <div className="space-y-4 max-w-[1100px]">
        <div className="h-6 w-40 bg-slate-200 rounded animate-pulse" />
        <div className="h-32 bg-slate-200 rounded-2xl animate-pulse" />
      </div>
    );
  }

  const t = query.data;
  const meta = TENDER_STATUS[t.status] ?? { label: t.status, color: "zinc" as const };

  const onCancel = () => {
    const reason = window.prompt("İptal sebebi (en az 10 karakter):");
    if (!reason || reason.trim().length < 10) {
      if (reason !== null) toast.error("Sebep en az 10 karakter olmalı");
      return;
    }
    cancel.mutate(
      { tenderId: t.id, reason: reason.trim() },
      {
        onSuccess: () => toast.success("İhale iptal edildi"),
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Hata"),
      },
    );
  };

  return (
    <div className="space-y-6 max-w-[1100px]">
      <Link
        href={`/admin/tenants/${t.tenant.id}`}
        className="text-sm text-admin-text-muted hover:text-brand-600 inline-flex items-center gap-1"
      >
        <ChevronLeft className="h-4 w-4" />
        {t.tenant.name}
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="font-mono text-sm text-admin-text-muted">
              {t.tenderNumber}
            </code>
            <Badge color={meta.color}>{meta.label}</Badge>
            {t.visibility === "PUBLIC" ? <Badge color="green">Herkese Açık</Badge> : null}
          </div>
          <h1 className="text-2xl font-display font-bold text-admin-text mt-1">
            {t.title}
          </h1>
          {t.description ? (
            <p className="text-sm text-admin-text-muted mt-1 max-w-2xl">
              {t.description}
            </p>
          ) : null}
        </div>
        {TENDER_CANCELLABLE.includes(t.status) ? (
          <Button type="button" variant="danger" disabled={cancel.isPending} onClick={onCancel}>
            İhaleyi İptal Et
          </Button>
        ) : null}
      </div>

      {/* Meta */}
      <div className="admin-card p-5 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <Meta label="Oluşturan" value={`${t.createdBy.firstName} ${t.createdBy.lastName}`} />
        <Meta label="Para Birimi" value={t.primaryCurrency} />
        <Meta label="Tür" value={t.type === "ENGLISH_AUCTION" ? "Açık Eksiltme" : "Teklif Toplama"} />
        <Meta label="Açılış" value={fmtDate(t.publishedAt ?? t.createdAt)} />
        <Meta label="Teklif Kapanış" value={fmtDate(t.bidsCloseAt)} />
        <Meta label="Ödeme" value={`${t.paymentTerm}${t.paymentDays ? ` (${t.paymentDays}g)` : ""}`} />
        {t.awardedAt ? <Meta label="Kazandırma" value={fmtDate(t.awardedAt)} /> : null}
        {t.cancelledAt ? <Meta label="İptal" value={`${fmtDate(t.cancelledAt)} · ${t.cancelReason ?? ""}`} /> : null}
        {t.categories.length > 0 ? (
          <Meta label="Kategoriler" value={t.categories.map((c) => c.nameTr).join(", ")} />
        ) : null}
      </div>

      {/* Kalemler */}
      <Section title={`Kalemler (${t.items.length})`}>
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>Kalem</TableHeader>
              <TableHeader>Miktar</TableHeader>
              <TableHeader>Hedef Birim Fiyat</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {t.items.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="text-admin-text">{i.name}</TableCell>
                <TableCell>{String(i.quantity)} {i.unit}</TableCell>
                <TableCell>{fmtAmount(i.targetUnitPrice, t.primaryCurrency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      {/* Teklifler — admin tüm teklifleri görür */}
      <Section title={`Teklifler (${t.bids.length}) — tüm tedarikçiler`}>
        {t.bids.length === 0 ? (
          <p className="text-sm text-admin-text-muted px-1 py-2">Henüz teklif yok</p>
        ) : (
          <Table dense>
            <TableHead>
              <TableRow>
                <TableHeader>Tedarikçi</TableHeader>
                <TableHeader>Tutar</TableHeader>
                <TableHeader>Durum</TableHeader>
                <TableHeader>Gönderim</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {t.bids.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="text-admin-text">{b.supplier.companyName}</TableCell>
                  <TableCell className="font-semibold">{fmtAmount(b.totalAmount, b.currency)}</TableCell>
                  <TableCell>
                    {BID_STATUS[b.status] ?? b.status}
                    {b.version > 1 ? ` · v${b.version}` : ""}
                  </TableCell>
                  <TableCell className="text-xs text-admin-text-muted">{fmtDate(b.submittedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      {/* Davetler */}
      <Section title={`Davetler (${t.invitations.length})`}>
        {t.invitations.length === 0 ? (
          <p className="text-sm text-admin-text-muted px-1 py-2">Davet yok</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {t.invitations.map((inv, idx) => (
              <span key={idx} className="inline-flex items-center gap-1 rounded-lg border border-surface-border px-2 py-1 text-xs">
                {inv.supplier.companyName}
                <Badge color={inv.status === "ACCEPTED" ? "green" : inv.status === "DECLINED" ? "red" : "zinc"}>
                  {inv.status}
                </Badge>
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* Dosyalar — ihale + teklif belgeleri (uyuşmazlık) */}
      {t.attachments.length > 0 ||
      t.bids.some((b) => b.attachments.length > 0) ? (
        <Section title="Dosyalar">
          {t.attachments.length > 0 ? (
            <div className="mb-3">
              <p className="text-xs font-semibold text-admin-text-muted mb-1">
                İhale belgeleri
              </p>
              <div className="space-y-1">
                {t.attachments.map((a) => (
                  <AttachmentLink key={a.id} att={a} />
                ))}
              </div>
            </div>
          ) : null}
          {t.bids
            .filter((b) => b.attachments.length > 0)
            .map((b) => (
              <div key={b.id} className="mb-3">
                <p className="text-xs font-semibold text-admin-text-muted mb-1">
                  Teklif belgesi — {b.supplier.companyName}
                </p>
                <div className="space-y-1">
                  {b.attachments.map((a) => (
                    <AttachmentLink key={a.id} att={a} />
                  ))}
                </div>
              </div>
            ))}
        </Section>
      ) : null}

      {/* Siparişler */}
      {t.orders.length > 0 ? (
        <Section title={`Siparişler (${t.orders.length})`}>
          <div className="space-y-1">
            {t.orders.map((o) => (
              <Link
                key={o.id}
                href={`/admin/orders/${o.id}`}
                className="flex items-center justify-between rounded-lg border border-surface-border px-3 py-2 text-sm hover:bg-zinc-50"
              >
                <span className="font-mono text-admin-text">{o.orderNumber}</span>
                <span className="text-admin-text-muted">
                  {o.supplier.companyName} · {fmtAmount(o.totalAmount, o.currency)}
                </span>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentLink({ att }: { att: AdminAttachment }) {
  return (
    <a
      href={att.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 text-sm text-brand-600 hover:underline"
    >
      <Paperclip className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="truncate">{att.filename}</span>
      <span className="text-xs text-admin-text-muted flex-shrink-0">
        ({fmtSize(att.fileSize)})
      </span>
    </a>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-admin-text-muted font-semibold">
        {label}
      </p>
      <p className="text-admin-text mt-0.5">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="admin-card overflow-hidden">
      <div className="px-5 py-3 border-b border-surface-border">
        <h3 className="font-bold text-admin-text text-sm">{title}</h3>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

export default function AdminTenderDetailPage() {
  return (
    <RequireAdminAuth>
      <AdminShell>
        <TenderDetail />
      </AdminShell>
    </RequireAdminAuth>
  );
}
