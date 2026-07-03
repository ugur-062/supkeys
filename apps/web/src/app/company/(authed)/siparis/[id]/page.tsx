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
  useCompleteOrder,
  useOrder,
  useReceiveOrder,
  useRejectOrder,
  useShipOrder,
  type CompanyOrderStatus,
} from "@/hooks/use-company-orders";
import { extractErrorMessage } from "@/lib/tenders/error";
import { subscribeRealtime } from "@/lib/realtime";
import { CURRENCY_SYMBOL } from "@/lib/tenders/labels";
import { OrderDocumentsSection } from "./_components/order-documents-section";
import {
  AcceptOrderModal,
  NoteModal,
  ReasonModal,
  ShipOrderModal,
} from "./_components/order-action-modals";
import { OrderReviewCard } from "./_components/order-review-card";
import { OrderTimeline } from "./_components/order-timeline";
import { ArrowLeftIcon, CheckCircleIcon } from "@heroicons/react/20/solid";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Banknote,
  Building2,
  CalendarClock,
  Gavel,
  Layers,
  Truck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const STEPS = [
  { key: "PENDING", label: "Onay" },
  { key: "ACCEPTED", label: "Onaylandı" },
  { key: "IN_DELIVERY", label: "Gönderildi" },
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
  IN_DELIVERY: { label: "Gönderildi", color: "indigo" },
  DELIVERED: { label: "Ödeme bekleniyor", color: "cyan" },
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
  const ship = useShipOrder(id);
  const receive = useReceiveOrder(id);
  const complete = useCompleteOrder(id);
  const accept = useAcceptOrder(id);
  const reject = useRejectOrder(id);
  const cancel = useCancelOrder(id);
  const [modal, setModal] = useState<
    "accept" | "reject" | "cancel" | "ship" | "receive" | "complete" | null
  >(null);

  // WS: bu siparişin odasına abone ol — karşı tarafın adımı anında düşer.
  useEffect(() => subscribeRealtime("order", id), [id]);

  if (isLoading)
    return <Text className="text-sm text-zinc-500">Yükleniyor…</Text>;
  if (!o)
    return <Text className="text-sm text-zinc-500">Sipariş bulunamadı.</Text>;

  const isSeller = o.role === "seller";
  const curSym =
    CURRENCY_SYMBOL[(o.currency as keyof typeof CURRENCY_SYMBOL) ?? "TRY"] ??
    "₺";
  const stepIndex = stepIndexFor(o.status);
  const terminal = o.status === "REJECTED" || o.status === "CANCELLED";
  const statusMeta = STATUS_META[o.status] ?? {
    label: o.status,
    color: "zinc" as const,
  };
  const ordersHref = isSeller
    ? "/company/satis/siparisler"
    : "/company/satinalma/siparisler";

  // Satıcının onaylamadığı ödeme kaydı varken sipariş TAMAMLANAMAZ
  // (server-side de reddeder) — buton yerine bekleme mesajı gösterilir.
  const paymentAwaitingConfirmation = Number(o.paymentTotals?.pending ?? 0) > 0;
  // Sonraki ana aksiyon (modal açar).
  const next =
    isSeller &&
    (o.status === "ACCEPTED" || o.status === "CREATED") &&
    !paymentAwaitingConfirmation
      ? { label: "Kargoya Ver", modal: "ship" as const }
      : !isSeller && o.status === "IN_DELIVERY"
        ? { label: "Teslim Aldım", modal: "receive" as const }
        : !isSeller && o.status === "DELIVERED" && !paymentAwaitingConfirmation
          ? { label: "Siparişi Tamamla", modal: "complete" as const }
          : null;

  const close = () => setModal(null);
  const run = async (p: Promise<unknown>, ok: string, fallback: string) => {
    try {
      await p;
      toast.success(ok);
      close();
    } catch (err) {
      toast.error(extractErrorMessage(err, fallback));
    }
  };

  const doAccept = (input: Parameters<typeof accept.mutateAsync>[0]) =>
    run(accept.mutateAsync(input), "Sipariş onaylandı", "İşlem başarısız");
  const doShip = (input: Parameters<typeof ship.mutateAsync>[0]) =>
    run(ship.mutateAsync(input), "Sipariş kargoya verildi", "İşlem başarısız");
  const doReceive = (note?: string) =>
    run(receive.mutateAsync({ note }), "Teslim alındı", "İşlem başarısız");
  const doComplete = (note?: string) =>
    run(complete.mutateAsync({ note }), "Sipariş tamamlandı", "İşlem başarısız");
  const doReject = (reason: string) =>
    run(reject.mutateAsync(reason), "Sipariş reddedildi", "İşlem başarısız");
  const doCancel = (reason: string) =>
    run(cancel.mutateAsync(reason), "Sipariş iptal edildi", "İptal edilemedi");

  const handlePrint = () => {
    if (!o) return;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    const rows = (o.items ?? [])
      .map((it) => {
        const line = Number(it.quantity) * Number(it.unitPrice);
        return `<tr><td>${it.name}</td><td style="text-align:right">${Number(it.quantity).toLocaleString("tr-TR")} ${it.unit}</td><td style="text-align:right">${Number(it.unitPrice).toLocaleString("tr-TR")} ${curSym}</td><td style="text-align:right">${line.toLocaleString("tr-TR")} ${curSym}</td></tr>`;
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
<div class="tot">Toplam: ${Number(o.amount).toLocaleString("tr-TR")} ${curSym}</div>
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
            <Button
              plain
              onClick={() => setModal("cancel")}
              disabled={cancel.isPending}
            >
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
            value={`${Number(o.amount).toLocaleString("tr-TR")} ${curSym}`}
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

      {/* Bağlı ihale + karşı taraf (eski panel paritesi) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-950/10 bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <Gavel className="h-4 w-4 text-zinc-500" />
            <h3 className="text-sm font-semibold text-zinc-900">Bağlı İhale</h3>
          </div>
          {o.listingId ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900">
                  {o.listingTitle ?? "—"}
                </p>
                <p className="mt-0.5 font-mono text-xs text-zinc-500">
                  {o.listingNumber ?? "—"}
                  {o.listingType ? (
                    <span className="ml-2 font-sans">
                      {o.listingType === "ALIM" ? "Alım ihalesi" : "Satış ihalesi"}
                    </span>
                  ) : null}
                </p>
              </div>
              <Button outline href={`/company/ilan/${o.listingId}`}>
                İhaleye Git
              </Button>
            </div>
          ) : (
            <Text className="text-sm text-zinc-500">
              Bağlı ihale kaydı yok (silinmiş olabilir).
            </Text>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-950/10 bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-zinc-500" />
              <h3 className="text-sm font-semibold text-zinc-900">
                {isSeller ? "Alıcı Firma" : "Satıcı Firma"}
              </h3>
            </div>
            <Button
              outline
              href={`/company/${isSeller ? "satis" : "satinalma"}/mesajlar?with=${o.counterpartyCompanyId}`}
            >
              Mesaj Gönder
            </Button>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="col-span-2">
              <dt className="text-xs text-zinc-500">Firma</dt>
              <dd className="font-medium text-zinc-900">
                {o.counterparty}
                {o.counterpartyProfile.supkeysId ? (
                  <span className="ml-2 font-mono text-xs text-zinc-400">
                    {o.counterpartyProfile.supkeysId}
                  </span>
                ) : null}
              </dd>
            </div>
            {o.counterpartyProfile.city ? (
              <div>
                <dt className="text-xs text-zinc-500">Şehir</dt>
                <dd className="text-zinc-900">{o.counterpartyProfile.city}</dd>
              </div>
            ) : null}
            {o.counterpartyProfile.industry ? (
              <div>
                <dt className="text-xs text-zinc-500">Sektör</dt>
                <dd className="text-zinc-900">
                  {o.counterpartyProfile.industry}
                </dd>
              </div>
            ) : null}
            {o.counterpartyProfile.email ? (
              <div>
                <dt className="text-xs text-zinc-500">E-posta</dt>
                <dd className="truncate text-zinc-900">
                  {o.counterpartyProfile.email}
                </dd>
              </div>
            ) : null}
            {o.counterpartyProfile.phone ? (
              <div>
                <dt className="text-xs text-zinc-500">Telefon</dt>
                <dd className="text-zinc-900">{o.counterpartyProfile.phone}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      </div>

      {/* Teslimat adresi — award anındaki snapshot (ALIM: ilanın adresi,
          SATIS: kazanan alıcının teklifte seçtiği adres). */}
      {o.deliveryAddress ? (
        <section className="rounded-2xl border border-zinc-950/10 bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <Truck className="h-4 w-4 text-zinc-500" />
            <h3 className="text-sm font-semibold text-zinc-900">
              Teslimat Adresi
            </h3>
          </div>
          <p className="text-sm text-zinc-900">
            <span className="font-medium">{o.deliveryAddress.title}</span> —{" "}
            {o.deliveryAddress.addressLine}
            {o.deliveryAddress.district ? `, ${o.deliveryAddress.district}` : ""}
            {o.deliveryAddress.city ? `, ${o.deliveryAddress.city}` : ""}
            {o.deliveryAddress.postalCode
              ? ` ${o.deliveryAddress.postalCode}`
              : ""}
          </p>
          {o.deliveryAddress.contactName || o.deliveryAddress.phone ? (
            <p className="mt-1 text-xs text-zinc-500">
              {[o.deliveryAddress.contactName, o.deliveryAddress.phone]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
        </section>
      ) : null}

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
                    {Number(it.unitPrice).toLocaleString("tr-TR")} {curSym}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold text-zinc-900">
                    {(
                      Number(it.unitPrice) * Number(it.quantity)
                    ).toLocaleString("tr-TR")}{" "}
                    {curSym}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      {/* Banka & Fatura */}
      {o.bankAccountHolder || o.bankIban || o.invoiceNumber ? (
        <section className="rounded-2xl border border-zinc-950/10 bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <Banknote className="h-4 w-4 text-zinc-500" />
            <h3 className="text-sm font-semibold text-zinc-900">
              Ödeme &amp; Fatura
            </h3>
          </div>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            {o.bankAccountHolder ? (
              <div>
                <dt className="text-xs text-zinc-500">Hesap Sahibi</dt>
                <dd className="font-medium text-zinc-900">
                  {o.bankAccountHolder}
                </dd>
              </div>
            ) : null}
            {o.bankIban ? (
              <div>
                <dt className="text-xs text-zinc-500">IBAN</dt>
                <dd className="font-mono text-zinc-900">{o.bankIban}</dd>
              </div>
            ) : null}
            {o.invoiceNumber ? (
              <div>
                <dt className="text-xs text-zinc-500">Fatura No</dt>
                <dd className="font-medium text-zinc-900">{o.invoiceNumber}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      {/* Sipariş geçmişi */}
      <OrderTimeline order={o} />

      {/* Aksiyon */}
      <section className="rounded-2xl border border-zinc-950/10 bg-white p-5">
        {o.status === "PENDING" && isSeller ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Text className="text-sm text-zinc-600">
              Bu siparişi onayla ya da reddet.
            </Text>
            <div className="flex gap-2">
              <Button
                plain
                onClick={() => setModal("reject")}
                disabled={reject.isPending}
              >
                Reddet
              </Button>
              <Button onClick={() => setModal("accept")} disabled={accept.isPending}>
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
              {next.modal === "ship"
                ? "Malı kargoya verdiğinde fatura no ile işaretle."
                : next.modal === "receive"
                  ? "Malı teslim aldığında işaretle."
                  : "Teslim + ödeme tamamlandığında siparişi kapat."}
            </Text>
            <Button
              onClick={() => setModal(next.modal)}
              disabled={ship.isPending || receive.isPending || complete.isPending}
            >
              {next.label}
            </Button>
          </div>
        ) : !isSeller &&
          o.status === "DELIVERED" &&
          paymentAwaitingConfirmation ? (
          <Text className="text-sm text-amber-700">
            Ödeme kaydınız satıcının onayını bekliyor — satıcı onayladıktan
            sonra siparişi tamamlayabilirsiniz.
          </Text>
        ) : isSeller && !terminal && paymentAwaitingConfirmation ? (
          <Text className="text-sm text-amber-700">
            Alıcı ödeme bildirdi — aşağıdaki Ödemeler bölümünden onaylayın
            veya reddedin. Onay bekleyen ödeme varken sonraki adıma geçilmez.
          </Text>
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

      {/* Modallar */}
      <AcceptOrderModal
        open={modal === "accept"}
        onClose={close}
        onSubmit={doAccept}
        pending={accept.isPending}
      />
      <ShipOrderModal
        open={modal === "ship"}
        onClose={close}
        onSubmit={doShip}
        pending={ship.isPending}
      />
      <NoteModal
        open={modal === "receive"}
        onClose={close}
        onSubmit={doReceive}
        pending={receive.isPending}
        title="Teslim Aldım"
        description={`${o.number ?? "Sipariş"} teslim alındı olarak işaretleniyor.`}
        confirmLabel="Teslim Aldım"
      />
      <NoteModal
        open={modal === "complete"}
        onClose={close}
        onSubmit={doComplete}
        pending={complete.isPending}
        title="Siparişi Tamamla"
        description={`${o.number ?? "Sipariş"} tamamlanıyor.`}
        confirmLabel="Tamamla"
      />
      <ReasonModal
        open={modal === "reject"}
        onClose={close}
        onSubmit={doReject}
        pending={reject.isPending}
        title="Siparişi Reddet"
        description="Red gerekçesi alıcıya iletilir."
        confirmLabel="Siparişi Reddet"
        minLength={10}
      />
      <ReasonModal
        open={modal === "cancel"}
        onClose={close}
        onSubmit={doCancel}
        pending={cancel.isPending}
        title="Siparişi İptal Et"
        description="İptal gerekçesi satıcıya iletilir."
        confirmLabel="Siparişi İptal Et"
        minLength={10}
      />
    </div>
  );
}
