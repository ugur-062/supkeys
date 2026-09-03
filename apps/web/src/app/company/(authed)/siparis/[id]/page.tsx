"use client";

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
import { formatMoney } from "@/components/ui/money";
import { Iban } from "@/components/ui/iban";
import { MetaTag, StatusBadge } from "@/components/ui/status-badge";
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
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { formatDate } from "@/lib/format-date";
import { canActOnOrder } from "@/lib/orders/can-act-on-order";
import { orderStatusMeta, orderSteps } from "@/lib/orders/order-status";
import { routeLabel } from "@/lib/company/terms";
import { extractErrorMessage } from "@/lib/tenders/error";
import { subscribeRealtime } from "@/lib/realtime";
import { CURRENCY_SYMBOL } from "@/lib/tenders/labels";
import { sellerShipsGoods } from "@rothern/shared";
import { LcStepPanel } from "./_components/lc-step-panel";
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
import { Banknote, Building2, Gavel, Truck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

// Adımlar TEK kaynaktan (order-status.orderSteps) — liste kartıyla aynı yazım.
const stepsFor = orderSteps;
const STEPS = stepsFor(true);

// Legacy CREATED siparişler ACCEPTED hizasında gösterilir.
function stepIndexFor(status: CompanyOrderStatus): number {
  if (status === "CREATED") return 1;
  return STEPS.findIndex((s) => s.key === status);
}

/** Özet kartındaki tek satır — sol etiket, sağ değer. */
function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-zinc-500">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-zinc-900">
        {children}
      </dd>
    </div>
  );
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user } = useCompanyAuth();
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
      <div className="space-y-4" aria-hidden>
        <div className="h-8 w-1/3 animate-pulse rounded bg-zinc-100" />
        <div className="h-12 animate-pulse rounded-xl bg-zinc-100" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="h-28 animate-pulse rounded-2xl bg-zinc-100" />
            <div className="h-64 animate-pulse rounded-2xl bg-zinc-100" />
          </div>
          <div className="h-56 animate-pulse rounded-2xl bg-zinc-100" />
        </div>
      </div>
    );
  if (!o)
    return <Text className="text-sm text-zinc-500">Sipariş bulunamadı.</Text>;

  const isSeller = o.role === "seller";
  // F7: aksiyon butonları tarafın işlem rolünü ister (assertOrderRole aynası) —
  // etiket-only Kurucu/Yönetici sayfayı SALT-OKUNUR görür (Faz R gözetimi).
  const canAct = canActOnOrder(o.role, user?.roles);
  const curSym =
    CURRENCY_SYMBOL[(o.currency as keyof typeof CURRENCY_SYMBOL) ?? "TRY"] ??
    "₺";
  // Teslim şekli: satıcı taşır mı (gönder) yoksa alıcı toplar mı (teslime hazır)?
  const sellerShips = sellerShipsGoods(o.deliveryTerm);
  const steps = stepsFor(sellerShips);
  const stepIndex = stepIndexFor(o.status);
  const terminal = o.status === "REJECTED" || o.status === "CANCELLED";
  const statusMeta = orderStatusMeta(o.status, sellerShips);
  const ordersHref = isSeller
    ? "/company/satis/siparisler"
    : "/company/satinalma/siparisler";

  // Satıcının onaylamadığı ödeme kaydı varken sipariş TAMAMLANAMAZ
  // (server-side de reddeder) — buton yerine bekleme mesajı gösterilir.
  const paymentAwaitingConfirmation = Number(o.paymentTotals?.pending ?? 0) > 0;
  // Tam ödeme onaylı mı? INV-MONEY-1 (F1): backend Decimal `remaining ≤ 0` oku,
  // epsilon YOK (eski `confirmed + 0.01 >= amount` 1 kuruş eksikte açıyordu).
  const confirmedPaid = Number(o.paymentTotals?.confirmed ?? 0);
  const remainingDue = Number(o.paymentTotals?.remaining ?? 0);
  // Denetim P3 #6: `paymentTotals.remaining` bekleyen (onaysız) bildirimi de
  // düşer (S4/Madde 16 — "kalan bildirilebilir tutar"). "Borç kapandı mı"
  // sinyali YALNIZ backend'in `paymentSettled` alanıdır (liste ucuyla aynı
  // helper); yoksa onaylı toplamdan türetilir.
  const fullyPaid = orderFullyPaid(o.paymentTotals, o.amount, o.paymentSettled);
  // Faz 3 gönderim kilidi (S3/S5): akreditifte satıcı kabulü, peşinde eşik
  // ödemesi olmadan satıcı GÖNDEREMEZ (backend de reddeder — UI önden kilitler).
  const isLc = o.paymentCategory === "LETTER_OF_CREDIT";
  const advanceDue = Number(o.advanceDue ?? 0);
  const advanceMet = isAdvanceMet(advanceDue, confirmedPaid);
  const shipUnlocked = (!isLc || !!o.lcAcceptedAt) && advanceMet;
  // Denetim P3 #5: ayıp ihbarlı DISPUTED'ta sevk/tamamlama API'de KAPALI
  // (TTK-23) — A1-DISPUTED (defectNotifiedAt yok) ise açık kalır.
  const defectDisputed = o.status === "DISPUTED" && !!o.defectNotifiedAt;
  // Vesaik mukabili: alıcı tam ödeme onaylanmadan teslim alamaz (receive kapısı).
  const cadGate =
    !isSeller &&
    o.paymentTiming === "BEFORE_DELIVERY" &&
    o.paymentCategory === "CASH_AGAINST_DOCS" &&
    !fullyPaid;
  // Sonraki ana aksiyon (modal açar).
  const next =
    isSeller &&
    // A1: DISPUTED'dan da sevk edilebilir (mal bulundu → ihtilaf çözülür).
    (o.status === "ACCEPTED" ||
      o.status === "CREATED" ||
      o.status === "DISPUTED") &&
    !defectDisputed &&
    !paymentAwaitingConfirmation &&
    shipUnlocked
      ? {
          // Madde 17: satıcının adımı artık "Siparişi Tamamla" (fatura no).
          label: "Siparişi Tamamla",
          modal: "ship" as const,
        }
      : !isSeller && o.status === "IN_DELIVERY" && !cadGate
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
    !defectDisputed &&
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
    // Yazdırmayı EBEVEYN tetikler — üretilen HTML'de inline <script> yok (strict
    // CSP script-src'i about:blank popup'ta miras alınan nonce'suz inline'ı
    // bloklardı). Harici kaynak yok (sistem fontu, resim yok) → close sonrası
    // içerik hazır; focus+print güvenilir çalışır.
    w.focus();
    w.print();
  };

  // P2 (denetim §5): durum makinesinin AÇIKLAMA metni — birincil aksiyonun
  // kendisi sticky ActionBar'da (tek yerde); burası "sıradaki adım" anlatısı.
  const nextStepHint = !canAct ? (
    <Text className="text-sm text-zinc-500">
      Bu adımlar {isSeller ? "Satışçı" : "Satın Almacı"} rolü gerektirir —
      salt görüntüleme modundasınız.
    </Text>
  ) : o.status === "PENDING" && isSeller ? (
    <div className="space-y-3">
      {/* İlan teminat şartlıysa bilgi notu — belge yüklemesi yok, teminat
          platform dışında alıcıya iletilir (sipariş belgeleri kaldırıldı). */}
      {o.requireGuaranteeLetter ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Bu ilanda <strong>teminat mektubu şartı</strong> var — teslimat
          garantisi olarak teminat mektubunu alıcıya doğrudan iletin.
        </div>
      ) : null}
      <Text className="text-sm text-zinc-600">
        Bu siparişi üstteki çubuktan onayla ya da reddet.
      </Text>
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
      ) : paymentAwaitingConfirmation ? (
        <Text className="text-sm text-amber-700">
          Ödeme bildirildi — satıcının onayı bekleniyor (onaylı:{" "}
          {formatMoney(confirmedPaid, o.currency)}).
        </Text>
      ) : isLc ? (
        <Text className="text-sm text-amber-700">
          Ödeme akreditif kapsamında banka kanalından yapılır — satıcı ödemeyi
          aldığında Akreditif bölümünden işaretler.
        </Text>
      ) : (
        <Text className="text-sm text-amber-700">
          Ödeme bekliyor — kalan {formatMoney(remainingDue, o.currency)}
          {o.paymentDueDate ? ` · Vade ${formatDate(o.paymentDueDate)}` : ""}.
          Ödemeler bölümünden kaydedebilirsiniz.
        </Text>
      )}
    </div>
  ) : advanceGate ? (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      Bu siparişte <strong>peşin ödeme şartı</strong> var — gönderim için{" "}
      <strong>{formatMoney(advanceDue, o.currency)}</strong> peşin tahsilat
      onaylanmalı (onaylı: {formatMoney(confirmedPaid, o.currency)}). Alıcı
      ödemeyi bildirip siz onayladıktan sonra gönderebilirsiniz.
    </div>
  ) : isSeller &&
    isLc &&
    !o.lcAcceptedAt &&
    (o.status === "ACCEPTED" || o.status === "CREATED") ? (
    <Text className="text-sm text-zinc-500">
      Akreditif adımları solda — kabul edildikten sonra gönderebilirsiniz.
    </Text>
  ) : isSeller && defectDisputed ? (
    <Text className="text-sm text-amber-700">
      Ayıp ihbarı açık — sevk/tamamlama adımı kapalı. Çözüm taraflar arasında;
      alıcı ihbarı geri çekerse adım yeniden açılır.
    </Text>
  ) : cadGate && o.status === "IN_DELIVERY" ? (
    <Text className="text-sm text-amber-700">
      Vesaik mukabili — teslim almadan önce kalan{" "}
      {formatMoney(remainingDue, o.currency)} tutarın ödenip satıcı tarafından
      onaylanması gerekir.
    </Text>
  ) : next ? (
    <Text className="text-sm text-zinc-600">
      {next.modal === "ship"
        ? sellerShips
          ? "Siparişi gönderdiğinde fatura no ile işaretle."
          : "Mal teslime hazır olduğunda fatura no ile işaretle — alıcı gelip alacak."
        : next.modal === "receive"
          ? "Malı teslim aldığında işaretle."
          : "Malı inceleyip kabul ettiğinizde tamamlayın — ödeme ayrı izlenir (borç açık olsa da tamamlayabilirsiniz)."}
    </Text>
  ) : !isSeller && o.status === "DELIVERED" && paymentAwaitingConfirmation ? (
    <Text className="text-sm text-amber-700">
      Ödeme kaydınız satıcının onayını bekliyor — satıcı onayladıktan sonra
      sipariş tamamlanır.
    </Text>
  ) : !isSeller && o.status === "DELIVERED" && !fullyPaid ? (
    <Text className="text-sm text-amber-700">
      {/* O3: vadeli/mal-mukabili siparişte vade gelecekteyse "şimdi öde"
          yerine vade tarihini göster (erken-ödemeye itme). */}
      {o.paymentDueDate && new Date(o.paymentDueDate) > new Date()
        ? `Ödeme vadesi: ${formatDate(o.paymentDueDate)} — kalan tutarı o tarihte Ödemeler bölümünden ödeyebilirsiniz. Satıcı onayladığında sipariş tamamlanır.`
        : "Kalan ödemenizi Ödemeler bölümünden kaydedin — satıcı onayladığında sipariş otomatik tamamlanır."}
    </Text>
  ) : isSeller && !terminal && paymentAwaitingConfirmation ? (
    <Text className="text-sm text-amber-700">
      Alıcı ödeme bildirdi — Ödemeler bölümünden onaylayın veya reddedin. Onay
      bekleyen ödeme varken sonraki adıma geçilmez.
    </Text>
  ) : (
    <Text className="text-sm text-zinc-500">
      Karşı tarafın işlemi bekleniyor…
    </Text>
  );

  return (
    <div className="space-y-5">
      {/* Başlık */}
      <div className="space-y-2">
        <Link
          href={ordersHref}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          {routeLabel(ordersHref) ?? "Siparişlerim"}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {o.number ? (
            <span className="tabular-nums text-xs font-medium tracking-wide text-zinc-400">
              {o.number}
            </span>
          ) : null}
          <MetaTag>{isSeller ? "Satış siparişi" : "Alış siparişi"}</MetaTag>
        </div>
        <Heading>{o.listingTitle ?? "Sipariş"}</Heading>
      </div>

      {/* P2 (denetim §5): sticky ActionBar — solda durum, sağda durum makinesine
          göre TEK birincil aksiyon + ikincil aksiyonlar. Kritik aksiyonun sayfa
          dibinde (y≈1148px) kalması biter; mobil dahil ilk ekranda durur. */}
      <div className="sticky top-16 z-20 rounded-xl border border-zinc-950/10 bg-white/90 px-3 py-2 shadow-sm backdrop-blur sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <StatusBadge tone={statusMeta.tone}>{statusMeta.label}</StatusBadge>
          <div className="flex flex-wrap items-center gap-2">
            {/* A2: onaylı ödeme varken iptal backend'de zaten engelli (CO cancel
                CONFIRMED guard) → buton görünüp 400 vermesin; gizle + not göster. */}
            {canAct &&
            !isSeller &&
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
                  className="!text-red-600 data-hover:!bg-red-50"
                  onClick={() => setModal("cancel")}
                  disabled={cancel.isPending}
                >
                  Siparişi İptal Et
                </Button>
              )
            ) : null}
            {/* A1: satıcı ACCEPTED siparişte iptal TALEBİ açar (açık talep yoksa).
                Alıcı onaylar → CANCELLED, reddeder → DISPUTED. */}
            {canAct &&
            isSeller &&
            o.status === "ACCEPTED" &&
            !pendingCancelRequest ? (
              <Button
                plain
                className="!text-red-600 data-hover:!bg-red-50"
                onClick={() => setModal("cancelRequest")}
                disabled={requestCancel.isPending}
              >
                İptal Talebi
              </Button>
            ) : null}
            {/* TTK 23: alıcı, teslimden 8 gün içinde ayıp ihbar edebilir. */}
            {canAct && canRaiseDefect ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">
                  Muayene süresi: {defectDaysLeft} gün
                </span>
                <Button
                  plain
                  className="!text-red-600 data-hover:!bg-red-50"
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
            {canAct && o.status === "PENDING" && isSeller ? (
              <>
                <Button
                  plain
                  className="!text-red-600 data-hover:!bg-red-50"
                  onClick={() => setModal("reject")}
                  disabled={reject.isPending}
                >
                  Reddet
                </Button>
                <Button
                  onClick={() => setModal("accept")}
                  disabled={accept.isPending}
                >
                  Kabul Et
                </Button>
              </>
            ) : canAct && next ? (
              <Button
                onClick={() => setModal(next.modal)}
                disabled={
                  ship.isPending || receive.isPending || complete.isPending
                }
              >
                {next.label}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* P2 (denetim §5): 2/3 kolon iskeleti — solda akış, sağda sticky özet. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {/* Durum akışı */}
          <section className="card p-5">
            {terminal ? (
              <StatusBadge
                tone={o.status === "REJECTED" ? "failed" : "neutral"}
              >
                {o.status === "REJECTED" ? "Satıcı reddetti" : "İptal edildi"}
              </StatusBadge>
            ) : (
              <div className="flex items-start gap-2">
                {steps.map((s, i) => {
                  const done = i < stepIndex || o.status === "COMPLETED";
                  const current = o.status !== "COMPLETED" && i === stepIndex;
                  return (
                    <div key={s.key} className="flex flex-1 items-start gap-2">
                      <div
                        className="flex min-w-0 flex-col items-center gap-2"
                        aria-current={current ? "step" : undefined}
                      >
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
                            <span className="text-xs font-bold">
                              {i + 1}
                            </span>
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

          {/* Bağlı ihale + karşı taraf (eski panel paritesi) */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className="card p-5">
              <div className="mb-3 flex items-center gap-2">
                <Gavel className="h-4 w-4 text-zinc-500" />
                <h2 className="text-sm font-semibold text-zinc-900">
                  Bağlı Satın Alma Talebi
                </h2>
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
                          {o.listingType === "ALIM"
                            ? "Satın alma talebi"
                            : "satış ilanı"}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <Button outline href={`/company/ilan/${o.listingId}`}>
                    Satın Alma Talebine Git
                  </Button>
                </div>
              ) : (
                <Text className="text-sm text-zinc-500">
                  Bağlı ihale kaydı yok (silinmiş olabilir).
                </Text>
              )}
            </section>

            <section className="card p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-zinc-500" />
                  <h2 className="text-sm font-semibold text-zinc-900">
                    {isSeller ? "Alıcı Firma" : "Satıcı Firma"}
                  </h2>
                </div>
                <Button
                  outline
                  href={`/company/mesajlar?with=${o.counterpartyCompanyId}&portal=${isSeller ? "satis" : "satinalma"}`}
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
                    <dd className="text-zinc-900">
                      {o.counterpartyProfile.city}
                    </dd>
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
                    <dd className="text-zinc-900">
                      {o.counterpartyProfile.phone}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>
          </div>

          {/* Teslimat adresi — award anındaki snapshot (ALIM: ilanın adresi,
              SATIS: kazanan alıcının teklifte seçtiği adres). */}
          {o.deliveryAddress ? (
            <section className="card p-5">
              <div className="mb-3 flex items-center gap-2">
                <Truck className="h-4 w-4 text-zinc-500" />
                <h2 className="text-sm font-semibold text-zinc-900">
                  Teslimat Adresi
                </h2>
              </div>
              <p className="text-sm text-zinc-900">
                <span className="font-medium">{o.deliveryAddress.title}</span>{" "}
                — {o.deliveryAddress.addressLine}
                {o.deliveryAddress.district
                  ? `, ${o.deliveryAddress.district}`
                  : ""}
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

          {/* Sipariş kalemleri */}
          {o.items.length > 0 ? (
            <section>
              <Table dense>
                <TableHead>
                  <TableRow>
                    <TableHeader>Kalem</TableHeader>
                    <TableHeader className="text-right">Miktar</TableHeader>
                    <TableHeader className="text-right">
                      Teslim Tarihi
                    </TableHeader>
                    <TableHeader className="text-right">
                      Birim Fiyat
                    </TableHeader>
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
                        {itemDeliveryLabel(
                          it.deliveryDate,
                          o.expectedDeliveryDate,
                          it.deliveryTime,
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-zinc-600">
                        {formatMoney(it.unitPrice, o.currency)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold tabular-nums text-zinc-900">
                        {formatMoney(
                          Number(it.unitPrice) * Number(it.quantity),
                          o.currency,
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          ) : null}

          {/* Banka & Fatura */}
          {o.bankAccountHolder || o.bankIban || o.invoiceNumber ? (
            <section className="card p-5">
              <div className="mb-3 flex items-center gap-2">
                <Banknote className="h-4 w-4 text-zinc-500" />
                <h2 className="text-sm font-semibold text-zinc-900">
                  Ödeme &amp; Fatura
                </h2>
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
                    <dd className="text-zinc-900">
                      <Iban value={o.bankIban} />
                    </dd>
                  </div>
                ) : null}
                {o.invoiceNumber ? (
                  <div>
                    <dt className="text-xs text-zinc-500">Fatura No</dt>
                    <dd className="font-medium text-zinc-900">
                      {o.invoiceNumber}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          <OrderCancelRequestPanel order={o} />
          <OrderDefectPanel order={o} />

          {/* Akreditif adımları (yalnız LC siparişte) */}
          <LcStepPanel order={o} />

          {/* Ödeme */}
          <OrderPaymentsCard order={o} />

          {/* Sipariş geçmişi */}
          <OrderTimeline order={o} />

          {/* Değerlendirme — ÇİFT YÖNLÜ: alıcı satıcıyı, satıcı alıcıyı puanlar */}
          {o.status === "COMPLETED" && canAct ? (
            <OrderReviewCard
              orderId={id}
              targetName={o.counterparty}
              title={
                isSeller ? "Müşteri Değerlendirme" : "Tedarikçi Değerlendirme"
              }
            />
          ) : null}
        </div>

        {/* Sağ kolon — sticky özet: taraf, tutar, ödeme durumu, vade. */}
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-32">
          <section className="card p-5">
            <h2 className="text-sm font-semibold text-zinc-900">Özet</h2>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-zinc-900">
              {formatMoney(o.amount, o.currency)}
            </p>
            <dl className="mt-4 space-y-2.5 border-t border-zinc-950/5 pt-4">
              <SummaryRow label={isSeller ? "Alıcı" : "Satıcı"}>
                <span className="block truncate">{o.counterparty}</span>
              </SummaryRow>
              <SummaryRow label="Kalem">{o.items.length} kalem</SummaryRow>
              <SummaryRow label="Sipariş tarihi">
                {formatDate(o.createdAt)}
              </SummaryRow>
              <SummaryRow label="Onaylı ödeme">
                <span className="font-mono tabular-nums">
                  {formatMoney(confirmedPaid, o.currency)}
                </span>
              </SummaryRow>
              <SummaryRow label="Kalan">
                <span
                  className={`font-mono tabular-nums ${
                    remainingDue > 0 ? "text-amber-700" : "text-emerald-700"
                  }`}
                >
                  {formatMoney(remainingDue, o.currency)}
                </span>
              </SummaryRow>
              {o.paymentDueDate ? (
                <SummaryRow label="Ödeme vadesi">
                  {formatDate(o.paymentDueDate)}
                </SummaryRow>
              ) : null}
            </dl>
          </section>

          {/* Sıradaki adım — aksiyonun kendisi ActionBar'da, anlatısı burada. */}
          <section className="card p-5">
            <h2 className="mb-2 text-sm font-semibold text-zinc-900">
              Sıradaki Adım
            </h2>
            {nextStepHint}
          </section>
        </aside>
      </div>

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
        description={`${o.number ?? "Sipariş"} teslim alındı olarak işaretlenecek ve sipariş otomatik tamamlanacak. Ödeme borcu (varsa) ayrı izlenmeye devam eder.`}
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
