"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Heading } from "@/components/catalyst/heading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { Text } from "@/components/catalyst/text";
import { OrderPaymentsCard } from "@/components/orders/order-payments-card";
import {
  useAcceptOrder,
  useCancelOrder,
  useOrder,
  useOrderAction,
  useRejectOrder,
  type CompanyOrderStatus,
} from "@/hooks/use-company-orders";
import { extractErrorMessage } from "@/lib/tenders/error";
import { OrderDocumentsSection } from "./_components/order-documents-section";
import { OrderReviewCard } from "./_components/order-review-card";
import { ArrowLeftIcon, CheckCircleIcon } from "@heroicons/react/20/solid";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Building2, CalendarClock, Layers, Wallet } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";

const STEPS = [
  { key: "PENDING", label: "Onay" },
  { key: "ACCEPTED", label: "Onaylandı" },
  { key: "IN_DELIVERY", label: "Kargoda" },
  { key: "DELIVERED", label: "Teslim alındı" },
  { key: "COMPLETED", label: "Tamamlandı" },
] as const;

const STATUS_META: Record<
  CompanyOrderStatus,
  { label: string; color: React.ComponentProps<typeof Badge>["color"] }
> = {
  PENDING: { label: "Onay bekliyor", color: "amber" },
  ACCEPTED: { label: "Onaylandı", color: "blue" },
  CREATED: { label: "Yeni", color: "zinc" },
  IN_DELIVERY: { label: "Kargoda", color: "indigo" },
  DELIVERED: { label: "Teslim edildi", color: "cyan" },
  COMPLETED: { label: "Tamamlandı", color: "green" },
  REJECTED: { label: "Reddedildi", color: "red" },
  CANCELLED: { label: "İptal", color: "zinc" },
};

// Legacy CREATED siparişler ACCEPTED hizasında gösterilir.
function stepIndexFor(status: CompanyOrderStatus): number {
  if (status === "CREATED") return 1;
  return STEPS.findIndex((s) => s.key === status);
}

function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 bg-white p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-50">
        <Icon className="h-4 w-4 text-zinc-600" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className="truncate text-sm font-semibold text-zinc-900">{value}</p>
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: o, isLoading } = useOrder(id);
  const action = useOrderAction(id);
  const accept = useAcceptOrder(id);
  const reject = useRejectOrder(id);
  const cancel = useCancelOrder(id);

  if (isLoading)
    return <Text className="text-sm text-zinc-500">Yükleniyor…</Text>;
  if (!o)
    return <Text className="text-sm text-zinc-500">Sipariş bulunamadı.</Text>;

  const isSeller = o.role === "seller";
  const stepIndex = stepIndexFor(o.status);
  const terminal = o.status === "REJECTED" || o.status === "CANCELLED";
  const statusMeta = STATUS_META[o.status] ?? {
    label: o.status,
    color: "zinc" as const,
  };
  const ordersHref = isSeller
    ? "/company/satis/siparisler"
    : "/company/satinalma/siparisler";

  const next =
    isSeller && (o.status === "ACCEPTED" || o.status === "CREATED")
      ? { label: "Kargoya Ver", act: "ship" as const }
      : !isSeller && o.status === "IN_DELIVERY"
        ? { label: "Teslim Aldım", act: "receive" as const }
        : !isSeller && o.status === "DELIVERED"
          ? { label: "Siparişi Tamamla", act: "complete" as const }
          : null;

  const handle = async (act: "ship" | "receive" | "complete") => {
    try {
      await action.mutateAsync(act);
      toast.success("Sipariş güncellendi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };

  const handleAccept = async () => {
    try {
      await accept.mutateAsync();
      toast.success("Sipariş onaylandı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };

  const handleReject = async () => {
    const reason = window
      .prompt("Ret gerekçesi (zorunlu, en az 10 karakter):")
      ?.trim();
    if (!reason) return;
    if (reason.length < 10) {
      toast.error("Gerekçe en az 10 karakter olmalı");
      return;
    }
    try {
      await reject.mutateAsync(reason);
      toast.success("Sipariş reddedildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };

  const handleCancel = async () => {
    const reason = window
      .prompt("İptal gerekçesi (zorunlu, en az 10 karakter):")
      ?.trim();
    if (!reason) return;
    if (reason.length < 10) {
      toast.error("Gerekçe en az 10 karakter olmalı");
      return;
    }
    try {
      await cancel.mutateAsync(reason);
      toast.success("Sipariş iptal edildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İptal edilemedi"));
    }
  };

  const handlePrint = () => {
    if (!o) return;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    const rows = (o.items ?? [])
      .map((it) => {
        const line = Number(it.quantity) * Number(it.unitPrice);
        return `<tr><td>${it.name}</td><td style="text-align:right">${Number(it.quantity).toLocaleString("tr-TR")} ${it.unit}</td><td style="text-align:right">${Number(it.unitPrice).toLocaleString("tr-TR")} ₺</td><td style="text-align:right">${line.toLocaleString("tr-TR")} ₺</td></tr>`;
      })
      .join("");
    w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${o.number ?? "Sipariş"}</title>
<style>body{font-family:system-ui,Arial,sans-serif;color:#18181b;padding:32px;max-width:720px;margin:auto}
h1{font-size:20px;margin:0 0 4px}.muted{color:#71717a;font-size:13px}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
th,td{padding:8px;border-bottom:1px solid #e4e4e7}th{text-align:left;color:#71717a;font-size:11px;text-transform:uppercase}
.tot{text-align:right;font-size:16px;font-weight:700;margin-top:12px}
.meta{margin-top:8px;font-size:13px;line-height:1.7}</style></head>
<body>
<h1>Sipariş ${o.number ?? ""}</h1>
<div class="muted">Rothern · ${new Date(o.createdAt).toLocaleString("tr-TR")}</div>
<div class="meta">
<strong>${isSeller ? "Alıcı" : "Satıcı"}:</strong> ${o.counterparty}<br>
<strong>İhale:</strong> ${o.listingTitle ?? "—"} (${o.listingNumber ?? "—"})<br>
<strong>Durum:</strong> ${statusMeta.label}
</div>
<table><thead><tr><th>Kalem</th><th style="text-align:right">Miktar</th><th style="text-align:right">Birim</th><th style="text-align:right">Tutar</th></tr></thead>
<tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:#a1a1aa">Kalem yok</td></tr>'}</tbody></table>
<div class="tot">Toplam: ${Number(o.amount).toLocaleString("tr-TR")} ₺</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`);
    w.document.close();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={ordersHref}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Siparişler
        </Link>
        <div className="flex items-center gap-2">
          {!isSeller &&
          (o.status === "PENDING" ||
            o.status === "ACCEPTED" ||
            o.status === "CREATED") ? (
            <Button plain onClick={handleCancel} disabled={cancel.isPending}>
              Siparişi İptal Et
            </Button>
          ) : null}
          <Button outline onClick={handlePrint}>
            Yazdır / PDF
          </Button>
        </div>
      </div>

      {/* Başlık */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {o.number ? (
            <span className="font-mono text-xs font-medium tracking-wide text-zinc-400">
              {o.number}
            </span>
          ) : null}
          <Badge color={statusMeta.color}>{statusMeta.label}</Badge>
        </div>
        <Heading>{o.listingTitle ?? "Sipariş"}</Heading>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge color={isSeller ? "emerald" : "blue"}>
            {isSeller ? "Satış siparişi" : "Alış siparişi"}
          </Badge>
        </div>
      </div>

      {/* Meta şeridi */}
      <section>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-zinc-950/5 bg-zinc-950/[0.06] lg:grid-cols-4">
          <MetaItem
            icon={Building2}
            label={isSeller ? "Alıcı" : "Satıcı"}
            value={o.counterparty}
          />
          <MetaItem
            icon={Wallet}
            label="Tutar"
            value={`${Number(o.amount).toLocaleString("tr-TR")} ₺`}
          />
          <MetaItem
            icon={Layers}
            label="Kalem"
            value={`${o.items.length} kalem`}
          />
          <MetaItem
            icon={CalendarClock}
            label="Tarih"
            value={format(new Date(o.createdAt), "d MMM yyyy", { locale: tr })}
          />
        </dl>
      </section>

      {/* Durum akışı */}
      <section className="rounded-2xl border border-zinc-950/10 bg-white p-5">
        {terminal ? (
          <Badge color="red">
            {o.status === "REJECTED" ? "Satıcı reddetti" : "İptal edildi"}
          </Badge>
        ) : (
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex flex-1 items-center gap-2">
                <div className="flex flex-col items-center gap-1">
                  <CheckCircleIcon
                    className={`h-6 w-6 ${
                      i <= stepIndex ? "text-emerald-500" : "text-zinc-300"
                    }`}
                  />
                  <span
                    className={`text-center text-xs ${
                      i <= stepIndex ? "text-zinc-900" : "text-zinc-400"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 ? (
                  <div
                    className={`mb-5 h-0.5 flex-1 ${
                      i < stepIndex ? "bg-emerald-400" : "bg-zinc-200"
                    }`}
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Sipariş kalemleri */}
      {o.items.length > 0 ? (
        <section>
          <Table dense>
            <TableHead>
              <TableRow>
                <TableHeader>Kalem</TableHeader>
                <TableHeader className="text-right">Miktar</TableHeader>
                <TableHeader className="text-right">Birim Fiyat</TableHeader>
                <TableHeader className="text-right">Tutar</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {o.items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-medium text-zinc-900">
                    {it.name}
                  </TableCell>
                  <TableCell className="text-right text-zinc-600">
                    {Number(it.quantity).toLocaleString("tr-TR")} {it.unit}
                  </TableCell>
                  <TableCell className="text-right font-mono text-zinc-600">
                    {Number(it.unitPrice).toLocaleString("tr-TR")} ₺
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold text-zinc-900">
                    {(
                      Number(it.unitPrice) * Number(it.quantity)
                    ).toLocaleString("tr-TR")}{" "}
                    ₺
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      {/* Aksiyon */}
      <section className="rounded-2xl border border-zinc-950/10 bg-white p-5">
        {o.status === "PENDING" && isSeller ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Text className="text-sm text-zinc-600">
              Bu siparişi onayla ya da reddet.
            </Text>
            <div className="flex gap-2">
              <Button plain onClick={handleReject} disabled={reject.isPending}>
                Reddet
              </Button>
              <Button onClick={handleAccept} disabled={accept.isPending}>
                Kabul Et
              </Button>
            </div>
          </div>
        ) : o.status === "PENDING" && !isSeller ? (
          <Text className="text-sm text-zinc-500">
            Satıcının siparişi onaylaması bekleniyor…
          </Text>
        ) : o.status === "COMPLETED" ? (
          <Text className="text-sm text-emerald-700">✓ Sipariş tamamlandı.</Text>
        ) : next ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Text className="text-sm text-zinc-600">
              {next.act === "ship"
                ? "Malı kargoya verdiğinde işaretle."
                : next.act === "receive"
                  ? "Malı teslim aldığında işaretle."
                  : "Teslim + ödeme tamamlandığında siparişi kapat."}
            </Text>
            <Button onClick={() => handle(next.act)} disabled={action.isPending}>
              {next.label}
            </Button>
          </div>
        ) : (
          <Text className="text-sm text-zinc-500">
            Karşı tarafın işlemi bekleniyor…
          </Text>
        )}
      </section>

      {/* Ödeme */}
      <OrderPaymentsCard order={o} />

      <OrderDocumentsSection orderId={id} role={o.role} />

      {/* Değerlendirme — alıcı, tamamlanmış siparişte satıcıyı puanlar */}
      {!isSeller && o.status === "COMPLETED" ? (
        <OrderReviewCard orderId={id} targetName={o.counterparty} />
      ) : null}
    </div>
  );
}
