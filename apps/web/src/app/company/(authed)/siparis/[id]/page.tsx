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
  useRequestCancel,
  useRaiseDefectNotice,
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
import { sellerShipsGoods } from "@rothern/shared";
import { OrderDocumentsSection } from "./_components/order-documents-section";
import { LcStepPanel } from "./_components/lc-step-panel";
import { OrderRevisionPanel } from "./_components/order-revision-panel";
import { OrderCancelRequestPanel } from "./_components/order-cancel-request-panel";
import { OrderDefectPanel } from "./_components/order-defect-panel";
import {
  AcceptOrderModal,
  NoteModal,
  ReasonModal,
  ShipOrderModal,
} from "./_components/order-action-modals";
import { OrderReviewCard } from "./_components/order-review-card";
import { orderFullyPaid, isAdvanceMet } from "./_components/payment-status";
import { OrderTimeline } from "./_components/order-timeline";
import { buildOrderPrintHtml, itemDeliveryLabel } from "./_components/order-print";
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

// Orta adım etiketi teslim şekline göre değişir (sellerShips): satıcı taşıyorsa
// "Gönderildi", alıcı topluyorsa "Teslime Hazır".
function stepsFor(sellerShips: boolean) {
  return [
    { key: "PENDING", label: "Onay" },
    { key: "ACCEPTED", label: "Onaylandı" },
    { key: "IN_DELIVERY", label: sellerShips ? "Gönderildi" : "Teslime Hazır" },
    { key: "DELIVERED", label: "Teslim alındı" },
    { key: "COMPLETED", label: "Tamamlandı" },
  ] as const;
}
const STEPS = stepsFor(true);

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
  DISPUTED: { label: "İhtilaflı", color: "amber" },
};

// Legacy CREATED siparişler ACCEPTED hizasında gösterilir.
function stepIndexFor(status: CompanyOrderStatus): number {
  if (status === "CREATED") return 1;
  return STEPS.findIndex((s) => s.key === status);
}

/** Kalem teslim tarihi etiketi — kalem-özel tarih varsa onu, yoksa order-level
 *  tarihe düşer (o zaman "genel" işaretiyle); ikisi de yoksa "—". */
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
  const requestCancel = useRequestCancel(id);
  const raiseDefect = useRaiseDefectNotice(id);
  const [modal, setModal] = useState<
    | "accept"
    | "reject"
    | "cancel"
    | "cancelRequest"
    | "defectNotice"
    | "ship"
    | "receive"
    | "complete"
    | null
  >(null);

  // WS: bu siparişin odasına abone ol — karşı tarafın adımı anında düşer.
  useEffect(() => subscribeRealtime("order", id), [id]);

  if (isLoading)
    return (
      <div className="mx-auto max-w-4xl space-y-4" aria-hidden>
        <div className="h-8 w-1/3 animate-pulse rounded bg-zinc-100" />
        <div className="h-28 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-20 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-zinc-100" />
      </div>
    );
  if (!o)
    return <Text className="text-sm text-zinc-500">Sipariş bulunamadı.</Text>;

  const isSeller = o.role === "seller";
  const curSym =
    CURRENCY_SYMBOL[(o.currency as keyof typeof CURRENCY_SYMBOL) ?? "TRY"] ??
    "₺";
  // Teslim şekli: satıcı taşır mı (gönder) yoksa alıcı toplar mı (teslime hazır)?
  const sellerShips = sellerShipsGoods(o.deliveryTerm);
  const steps = stepsFor(sellerShips);
  const stepIndex = stepIndexFor(o.status);
  const terminal = o.status === "REJECTED" || o.status === "CANCELLED";
  const statusMeta =
    o.status === "IN_DELIVERY"
      ? {
          label: sellerShips ? "Gönderildi" : "Teslime hazır",
          color: "indigo" as const,
        }
      : (STATUS_META[o.status] ?? {
          label: o.status,
          color: "zinc" as const,
        });
  const ordersHref = isSeller
    ? "/company/satis/siparisler"
    : "/company/satinalma/siparisler";

  // Satıcının onaylamadığı ödeme kaydı varken sipariş TAMAMLANAMAZ
  // (server-side de reddeder) — buton yerine bekleme mesajı gösterilir.
  const paymentAwaitingConfirmation = Number(o.paymentTotals?.pending ?? 0) > 0;
  // Tam ödeme onaylı mı? INV-MONEY-1 (F1): backend Decimal `remaining ≤ 0` oku,
  // epsilon YOK (eski `confirmed + 0.01 >= amount` 1 kuruş eksikte açıyordu).
  const confirmedPaid = Number(o.paymentTotals?.confirmed ?? 0);
  const fullyPaid = orderFullyPaid(o.paymentTotals, o.amount);
  // Faz 3 gönderim kilidi (S3/S5): akreditifte satıcı kabulü, peşinde eşik
  // ödemesi olmadan satıcı GÖNDEREMEZ (backend de reddeder — UI önden kilitler).
  const isLc = o.paymentCategory === "LETTER_OF_CREDIT";
  const advanceDue = Number(o.advanceDue ?? 0);
  const advanceMet = isAdvanceMet(advanceDue, confirmedPaid);
  const shipUnlocked = (!isLc || !!o.lcAcceptedAt) && advanceMet;
  // Sonraki ana aksiyon (modal açar).
  const next =
    isSeller &&
    // A1: DISPUTED'dan da sevk edilebilir (mal bulundu → ihtilaf çözülür).
    (o.status === "ACCEPTED" ||
      o.status === "CREATED" ||
      o.status === "DISPUTED") &&
    !paymentAwaitingConfirmation &&
    shipUnlocked
      ? {
          label: sellerShips ? "Siparişi Gönder" : "Teslime Hazırla",
          modal: "ship" as const,
        }
      : !isSeller && o.status === "IN_DELIVERY"
        ? { label: "Teslim Aldım", modal: "receive" as const }
        : // YAŞAM DÖNGÜSÜ AYRIMI: Tamamla = malın KABULÜ (operasyonel), ödemeden
          // BAĞIMSIZ. Vadeli siparişte alıcı kabul edip tamamlar; borç ayrı izlenir.
          !isSeller && o.status === "DELIVERED"
          ? { label: "Siparişi Tamamla", modal: "complete" as const }
          : null;
  // Peşin eşiği bekleniyor mu (satıcı, gönderim öncesi)? Kilit mesajı için.
  const advanceGate =
    isSeller &&
    !isLc &&
    (o.status === "ACCEPTED" ||
      o.status === "CREATED" ||
      o.status === "DISPUTED") &&
    !advanceMet &&
    !paymentAwaitingConfirmation;

  // A1: açık satıcı iptal talebi = ACCEPTED && cancelRequestedAt dolu.
  const pendingCancelRequest =
    o.status === "ACCEPTED" && !!o.cancelRequestedAt;

  // TTK 23: ayıp ihbarı penceresi — teslimden (deliveredAt) itibaren N gün.
  // DELIVERED ve COMPLETED'da açık (TTK ödemeye bakmaz). Açık ihbar varsa kapalı.
  const defectWindowMs = (o.defectNoticeWindowDays ?? 8) * 86_400_000;
  const defectDeadline = o.deliveredAt
    ? new Date(o.deliveredAt).getTime() + defectWindowMs
    : 0;
  const defectDaysLeft = defectDeadline
    ? Math.max(0, Math.ceil((defectDeadline - Date.now()) / 86_400_000))
    : 0;
  const canRaiseDefect =
    !isSeller &&
    (o.status === "DELIVERED" || o.status === "COMPLETED") &&
    !!o.deliveredAt &&
    Date.now() < defectDeadline &&
    !o.defectNotifiedAt;

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
    run(
      ship.mutateAsync(input),
      sellerShips ? "Sipariş gönderildi" : "Teslime hazır işaretlendi",
      "İşlem başarısız",
    );
  const doReceive = (note?: string) =>
    run(receive.mutateAsync({ note }), "Teslim alındı", "İşlem başarısız");
  const doComplete = (note?: string) =>
    run(complete.mutateAsync({ note }), "Sipariş tamamlandı", "İşlem başarısız");
  const doReject = (reason: string) =>
    run(reject.mutateAsync(reason), "Sipariş reddedildi", "İşlem başarısız");
  const doCancel = (reason: string) =>
    run(cancel.mutateAsync(reason), "Sipariş iptal edildi", "İptal edilemedi");
  const doRequestCancel = (reason: string) =>
    run(
      requestCancel.mutateAsync(reason),
      "İptal talebi gönderildi — alıcının onayına düştü",
      "Talep gönderilemedi",
    );
  const doRaiseDefect = (reason: string) =>
    run(
      raiseDefect.mutateAsync(reason),
      "Ayıp ihbarı kaydedildi — sipariş ihtilaflı",
      "Ayıp ihbarı gönderilemedi",
    );

  const handlePrint = () => {
    if (!o) return;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    // GÜVENLİK: HTML string'i saf builder üretir + karşı-taraf alanlarını
    // escapeHtml'den geçirir (stored XSS kapandı). Bkz. order-print.ts.
    w.document.write(
      buildOrderPrintHtml(o, {
        isSeller,
        curSym,
        statusLabel: statusMeta.label,
      }),
    );
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
          {/* A2: onaylı ödeme varken iptal backend'de zaten engelli (CO cancel
              CONFIRMED guard) → buton görünüp 400 vermesin; gizle + not göster. */}
          {!isSeller &&
          (o.status === "PENDING" ||
            o.status === "ACCEPTED" ||
            o.status === "CREATED") ? (
            confirmedPaid > 0 ? (
              <span className="text-xs text-zinc-400">
                Onaylı ödeme bulunan sipariş iptal edilemez — iade için destek.
              </span>
            ) : (
              <Button
                plain
                onClick={() => setModal("cancel")}
                disabled={cancel.isPending}
              >
                Siparişi İptal Et
              </Button>
            )
          ) : null}
          {/* A1: satıcı ACCEPTED siparişte iptal TALEBİ açar (açık talep yoksa).
              Alıcı onaylar → CANCELLED, reddeder → DISPUTED. */}
          {isSeller && o.status === "ACCEPTED" && !pendingCancelRequest ? (
            <Button
              plain
              onClick={() => setModal("cancelRequest")}
              disabled={requestCancel.isPending}
            >
              İptal Talebi
            </Button>
          ) : null}
          {/* TTK 23: alıcı, teslimden 8 gün içinde ayıp ihbar edebilir. */}
          {canRaiseDefect ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">
                Muayene süresi: {defectDaysLeft} gün
              </span>
              <Button
                plain
                onClick={() => setModal("defectNotice")}
                disabled={raiseDefect.isPending}
              >
                Ayıp İhbarı
              </Button>
            </div>
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
            <span className="tabular-nums text-xs font-medium tracking-wide text-zinc-400">
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
                      {o.listingType === "ALIM" ? "Alış ihalesi" : "Satış ihalesi"}
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
                {o.counterpartyProfile.rothernId ? (
                  <span className="ml-2 font-mono text-xs text-zinc-400">
                    {o.counterpartyProfile.rothernId}
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
          <div className="flex items-start gap-2">
            {steps.map((s, i) => {
              const done =
                i < stepIndex || o.status === "COMPLETED";
              const current = o.status !== "COMPLETED" && i === stepIndex;
              return (
                <div key={s.key} className="flex flex-1 items-start gap-2">
                  <div className="flex min-w-0 flex-col items-center gap-1.5">
                    <div
                      className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition ${
                        done
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : current
                            ? "border-blue-500 bg-blue-50 text-blue-700 ring-4 ring-blue-500/15"
                            : "border-zinc-200 bg-white text-zinc-300"
                      }`}
                    >
                      {done ? (
                        <CheckCircleIcon className="size-5" aria-hidden />
                      ) : (
                        <span className="text-[11px] font-bold">{i + 1}</span>
                      )}
                    </div>
                    <span
                      className={`whitespace-nowrap text-center text-xs ${
                        done
                          ? "text-emerald-700"
                          : current
                            ? "font-semibold text-blue-700"
                            : "text-zinc-400"
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                  {i < steps.length - 1 ? (
                    <div
                      className={`mt-3.5 h-0.5 flex-1 rounded-full ${
                        i < stepIndex || o.status === "COMPLETED"
                          ? "bg-emerald-400"
                          : "bg-zinc-200"
                      }`}
                    />
                  ) : null}
                </div>
              );
            })}
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
                <TableHeader className="text-right">Teslim Tarihi</TableHeader>
                <TableHeader className="text-right">Birim Fiyat</TableHeader>
                <TableHeader className="text-right">Tutar</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {o.items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-medium text-zinc-900">
                    {it.name}
                    {it.note ? (
                      <span className="block text-xs font-normal text-zinc-400">
                        {it.note}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right text-zinc-600">
                    {Number(it.quantity).toLocaleString("tr-TR")} {it.unit}
                  </TableCell>
                  <TableCell className="text-right text-zinc-600">
                    {itemDeliveryLabel(it.deliveryDate, o.expectedDeliveryDate)}
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
          <div className="space-y-3">
            {/* İlan teminat şartlıysa: teminat yüklenmeden onay backend'de reddedilir. */}
            {o.requireGuaranteeLetter ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Bu ilanda <strong>teminat mektubu şartı</strong> var — siparişi
                onaylamadan önce aşağıdaki Belgeler bölümünden{" "}
                <strong>teminat mektubu</strong> yüklemeniz zorunlu (teslimat
                garantisi).
              </div>
            ) : null}
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
          </div>
        ) : o.status === "PENDING" && !isSeller ? (
          <Text className="text-sm text-zinc-500">
            Satıcının siparişi onaylaması bekleniyor…
          </Text>
        ) : o.status === "COMPLETED" ? (
          <div className="space-y-1">
            <Text className="text-sm text-emerald-700">
              ✓ Sipariş tamamlandı (mal teslim edildi ve kabul edildi).
            </Text>
            {/* YAŞAM DÖNGÜSÜ AYRIMI: operasyonel bitiş ≠ ödeme; borç ayrı. */}
            {fullyPaid ? (
              <Text className="text-sm text-emerald-700">Ödeme tamamlandı.</Text>
            ) : (
              <Text className="text-sm text-amber-700">
                Ödeme bekliyor — kalan{" "}
                {Number(o.paymentTotals?.remaining ?? 0).toLocaleString("tr-TR")}{" "}
                {curSym}
                {o.paymentDueDate
                  ? ` · Vade ${new Date(o.paymentDueDate).toLocaleDateString("tr-TR")}`
                  : ""}
                . Ödemeler bölümünden kaydedebilirsiniz.
              </Text>
            )}
          </div>
        ) : advanceGate ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Bu siparişte <strong>peşin ödeme şartı</strong> var — gönderim için{" "}
            <strong>
              {advanceDue.toLocaleString("tr-TR")} {curSym}
            </strong>{" "}
            peşin tahsilat onaylanmalı (onaylı:{" "}
            {confirmedPaid.toLocaleString("tr-TR")} {curSym}). Alıcı ödemeyi
            bildirip siz onayladıktan sonra gönderebilirsiniz.
          </div>
        ) : isSeller &&
          isLc &&
          !o.lcAcceptedAt &&
          (o.status === "ACCEPTED" || o.status === "CREATED") ? (
          <Text className="text-sm text-zinc-500">
            Akreditif adımları aşağıda — kabul edildikten sonra
            gönderebilirsiniz.
          </Text>
        ) : next ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Text className="text-sm text-zinc-600">
              {next.modal === "ship"
                ? sellerShips
                  ? "Siparişi gönderdiğinde fatura no ile işaretle."
                  : "Mal teslime hazır olduğunda fatura no ile işaretle — alıcı gelip alacak."
                : next.modal === "receive"
                  ? "Malı teslim aldığında işaretle."
                  : "Malı inceleyip kabul ettiğinde tamamla — ödeme ayrı izlenir (borç açık olsa da tamamlayabilirsin)."}
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
            sonra sipariş tamamlanır.
          </Text>
        ) : !isSeller && o.status === "DELIVERED" && !fullyPaid ? (
          <Text className="text-sm text-amber-700">
            {/* O3: vadeli/mal-mukabili siparişte vade gelecekteyse "şimdi öde"
                yerine vade tarihini göster (erken-ödemeye itme). */}
            {o.paymentDueDate && new Date(o.paymentDueDate) > new Date()
              ? `Ödeme vadesi: ${new Date(o.paymentDueDate).toLocaleDateString("tr-TR")} — kalan tutarı o tarihte aşağıdaki Ödemeler bölümünden ödeyebilirsiniz. Satıcı onayladığında sipariş tamamlanır.`
              : "Kalan ödemenizi aşağıdaki Ödemeler bölümünden kaydedin — satıcı onayladığında sipariş otomatik tamamlanır."}
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

      {/* Sipariş revizyon müzakeresi (satıcı öner / alıcı karar) */}
      <OrderCancelRequestPanel order={o} />
      <OrderDefectPanel order={o} />

      <OrderRevisionPanel order={o} />

      {/* Akreditif adımları (yalnız LC siparişte) */}
      <LcStepPanel order={o} />

      {/* Ödeme */}
      <OrderPaymentsCard order={o} />

      <OrderDocumentsSection order={o} />

      {/* Değerlendirme — ÇİFT YÖNLÜ: alıcı satıcıyı, satıcı alıcıyı puanlar */}
      {o.status === "COMPLETED" ? (
        <OrderReviewCard
          orderId={id}
          targetName={o.counterparty}
          title={isSeller ? "Müşteri Değerlendirme" : "Tedarikçi Değerlendirme"}
        />
      ) : null}

      {/* Modallar */}
      <AcceptOrderModal
        open={modal === "accept"}
        onClose={close}
        onSubmit={doAccept}
        pending={accept.isPending}
        // S1: LC/vesaik mukabilinde ödeme banka kanalından → banka hesabı opsiyonel.
        bankOptional={isLc || o.paymentCategory === "CASH_AGAINST_DOCS"}
      />
      <ShipOrderModal
        open={modal === "ship"}
        onClose={close}
        onSubmit={doShip}
        pending={ship.isPending}
        sellerShips={sellerShips}
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
      <ReasonModal
        open={modal === "cancelRequest"}
        onClose={close}
        onSubmit={doRequestCancel}
        pending={requestCancel.isPending}
        title="İptal Talebi Aç"
        description="Neden sevk edemiyorsunuz? Gerekçe alıcıya iletilir; alıcı onaylarsa sipariş iptal olur, reddederse ihtilaflı olarak işaretlenir."
        confirmLabel="İptal Talebi Gönder"
        minLength={10}
      />
      <ReasonModal
        open={modal === "defectNotice"}
        onClose={close}
        onSubmit={doRaiseDefect}
        pending={raiseDefect.isPending}
        title="Ayıp İhbarı (TTK 23)"
        description="Teslim aldığınız maldaki ayıbı açıklayın. İhbar kaydedilir ve uyuşmazlıkta delil olur; sipariş ihtilaflı duruma geçer. Çözüm satıcıyla aranızdadır — platform hakem değildir."
        confirmLabel="Ayıp İhbarı Gönder"
        minLength={10}
      />
    </div>
  );
}
