"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { useBidDeliveryTimeLabel, useFormatPaymentPlan, useNavLabel, useRoleLabel, useQuantityLabel, useUnitLabel, usePlaceLabel } from "@/i18n/domain";
import { formatNumber } from "@/i18n/format";
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
import { useFormatMoney } from "@/components/ui/money";
import { ErrorState } from "@/components/ui/error-state";
import { Iban } from "@/components/ui/iban";
import { AlternativeOfferNote } from "@/components/tenders/alternative-offer-note";
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
} from "@/hooks/use-company-orders";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { formatDate } from "@/lib/format-date";
import { canActOnOrder } from "@/lib/orders/can-act-on-order";
import { orderStageIndex, orderStatusMeta, orderSteps } from "@/lib/orders/order-status";
import { routeLabel } from "@/lib/company/terms";
import { errorToastedGlobally, extractErrorMessage } from "@/lib/tenders/error";
import { subscribeRealtime } from "@/lib/realtime";
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
import { buildOrderPrintHtml, itemDeliveryLabel, type OrderPrintLabels } from "./_components/order-print";
import { ArrowLeftIcon, CheckCircleIcon } from "@heroicons/react/20/solid";
import { Banknote, Building2, Gavel, Truck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

// Adımlar ve konum TEK kaynaktan (order-status) — liste kartıyla aynı.
const stepsFor = orderSteps;

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
  const t = useTranslations("web.panel.trade.siparisIdPage");
  const placeLabel = usePlaceLabel();
  const tn = useNavLabel();
  // Durum ve adım adları paylaşılan sözlükten (`web.domain.orderStatus|orderStep`);
  // `lib/orders/order-status` ton + konum kaynağı olarak kalır (anahtar yoksa TR adı).
  const tStatus = useTranslations("web.domain.orderStatus");
  const tStep = useTranslations("web.domain.orderStep");
  // Sıradaki-adım metni iptal paneli düğmelerinin GERÇEK adını söyler (tek kaynak).
  const tCancel = useTranslations("web.panel.trade.orderCancelRequestPanel");
  const tDefect = useTranslations("web.panel.trade.orderDefectPanel");
  const roleLabel = useRoleLabel();
  const unitLabel = useUnitLabel();
  const quantity = useQuantityLabel();
  const deliveryTimeLabel = useBidDeliveryTimeLabel();
  const formatPlan = useFormatPaymentPlan();
  const locale = useLocale() as Locale;
  const { money: formatMoney } = useFormatMoney();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user, company } = useCompanyAuth();
  const { data: o, isPending, isError, error, refetch } = useOrder(id);
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

  // `isPending`: çevrimdışı duraklayan sorguda `isLoading` false kalır ve
  // "Sipariş bulunamadı" çizilirdi (LİSTE DURUMLARI).
  if (isPending)
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
  // Arayüz testi O-092: "bulunamadı" YALNIZ gerçek 404'te; 500/ağ hatasında
  // ayrı hata dalı + "Tekrar dene" (kullanıcı siparişin silindiğini sanıyordu).
  const notFound =
    (error as { response?: { status?: number } } | null)?.response?.status === 404;
  if (!o && isError && !notFound)
    return <ErrorState onRetry={() => void refetch()} />;
  if (!o)
    return <Text className="text-sm text-zinc-500">{t("siparisBulunamadi")}</Text>;

  const isSeller = o.role === "seller";
  // F7: aksiyon butonları tarafın işlem rolünü ister (assertOrderRole aynası) —
  // etiket-only Kurucu/Yönetici sayfayı SALT-OKUNUR görür (Faz R gözetimi).
  const canAct = canActOnOrder(o.role, user);
  // Teslim şekli: satıcı taşır mı (gönder) yoksa alıcı toplar mı (teslime hazır)?
  const sellerShips = sellerShipsGoods(o.deliveryTerm);
  const steps = stepsFor(sellerShips);
  // O-030: ihtilafta gerçekleşmiş adımlar korunur, süren adım amber.
  const stage = orderStageIndex(o.status, o.disputePrevStatus);
  const terminal = o.status === "REJECTED" || o.status === "CANCELLED";
  const statusMeta = orderStatusMeta(o.status, sellerShips);
  const statusLabel = tStatus(statusMeta.labelKey as never);
  const stepLabel = (s: (typeof steps)[number]) => tStep(s.labelKey as never);
  // Yazdırma çıktısı da okuyucunun dilinde — saf builder etiketleri PARAMETRE alır.
  const printLabels: OrderPrintLabels = {
    order: t("print.siparis"),
    buyer: t("print.alici"),
    seller: t("print.satici"),
    // D-005: tedarikçiye "alım talebi" (satıcı terimi), alıcıya "satın alma talebi".
    request: isSeller ? t("print.alimTalebi") : t("print.satinAlmaTalebi"),
    status: t("print.durum"),
    item: t("print.kalem"),
    quantity: t("print.miktar"),
    delivery: t("print.teslim"),
    unit: t("print.birimFiyat"),
    amount: t("print.tutar"),
    noItems: t("print.kalemYok"),
    total: t("print.toplam"),
    general: t("print.genel"),
    alternative: t("print.muadil"),
    offered: t("print.teklifEdilen"),
    requested: t("print.istenen"),
    notSpecified: t("print.belirtilmedi"),
    deliveryAddress: t("print.teslimAdresi"),
    paymentTerms: t("print.odemeSarti"),
    invoiceNo: t("print.faturaNo"),
  };
  const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;
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
  // Özet "Kalan" = ONAYLI ödemeye göre borç (arayüz testi D-127): backend
  // `remaining` bekleyen bildirimi de düşer ("bildirilebilir kalan"), onaysız
  // tam bildirimde "Kalan 0,00" yeşil yazıyordu. Kuruş tamsayısında hesaplanır.
  const pendingPaid = Number(o.paymentTotals?.pending ?? 0);
  const outstanding = Math.max(
    0,
    (Math.round(Number(o.amount) * 100) - Math.round(confirmedPaid * 100)) / 100,
  );
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
          label: t("siparisiTamamla"),
          modal: "ship" as const,
        }
      : !isSeller && o.status === "IN_DELIVERY" && !cadGate
        ? { label: t("teslimAldim"), modal: "receive" as const }
        : // YAŞAM DÖNGÜSÜ AYRIMI: Tamamla = malın KABULÜ (operasyonel), ödemeden
          // BAĞIMSIZ. Vadeli siparişte alıcı kabul edip tamamlar; borç ayrı izlenir.
          !isSeller && o.status === "DELIVERED"
          ? { label: t("siparisiTamamla"), modal: "complete" as const }
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
      // D-255: 5xx/ağ hatasının genel toast'ı interceptor'da — ikinci toast yok.
      if (!errorToastedGlobally(err)) toast.error(extractErrorMessage(err, fallback));
    }
  };

  const doAccept = (input: Parameters<typeof accept.mutateAsync>[0]) =>
    run(accept.mutateAsync(input), t("siparisOnaylandi"), t("islemBasarisiz"));
  const doShip = (input: Parameters<typeof ship.mutateAsync>[0]) =>
    run(
      ship.mutateAsync(input),
      sellerShips ? t("siparisGonderildi") : t("teslimeHazirIsaretlendi"),
      t("islemBasarisiz"),
    );
  const doReceive = (note?: string) =>
    run(receive.mutateAsync({ note }), t("teslimAlindi"), t("islemBasarisiz"));
  const doComplete = (note?: string) =>
    run(complete.mutateAsync({ note }), t("siparisTamamlandi"), t("islemBasarisiz"));
  const doReject = (reason: string) =>
    run(reject.mutateAsync(reason), t("siparisReddedildi"), t("islemBasarisiz"));
  const doCancel = (reason: string) =>
    run(cancel.mutateAsync(reason), t("siparisIptalEdildi"), t("iptalEdilemedi"));
  const doRequestCancel = (reason: string) =>
    run(
      requestCancel.mutateAsync(reason),
      t("iptalTalebiGonderildiAlicininOnayina"),
      t("talepGonderilemedi"),
    );
  const doRaiseDefect = (reason: string) =>
    run(
      raiseDefect.mutateAsync(reason),
      t("ayipIhbariKaydedildiSiparisIhtilafli"),
      t("ayipIhbariGonderilemedi"),
    );

  const handlePrint = () => {
    if (!o) return;
    const w = window.open("", "_blank", "width=800,height=900");
    // D-111: açılır pencere engellendiyse sessizce bitmesin — kullanıcıya söyle.
    if (!w) {
      toast.error(t("yazdirmaPenceresiAcilamadi"));
      return;
    }
    const addr = o.deliveryAddress;
    const addrPlace = addr ? placeLabel(addr) : "";
    // GÜVENLİK: HTML string'i saf builder üretir + karşı-taraf alanlarını
    // escapeHtml'den geçirir (stored XSS kapandı). Bkz. order-print.ts.
    w.document.write(
      buildOrderPrintHtml(o, {
        isSeller,
        currency: o.currency ?? "TRY",
        statusLabel,
        labels: printLabels,
        locale,
        deliveryTimeLabel,
        quantityLabel: (n, u) => quantity(n, u),
        // D-111: iki taraf, teslim adresi ve ödeme şartı çıktıda da.
        ownCompanyName: company?.name ?? null,
        deliveryAddress: addr
          ? `${addr.title} — ${addr.addressLine}${addrPlace ? `, ${addrPlace}` : ""}`
          : null,
        paymentTerms: formatPlan(o),
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
  // Arayüz testi O-055: sonlanmış siparişte, peşin eşiğinde ve akreditif
  // adımlarında sıradaki adım ALICININ — "karşı taraf bekleniyor" denmez.
  const buyerPreShip =
    !isSeller &&
    (o.status === "ACCEPTED" ||
      o.status === "CREATED" ||
      (o.status === "DISPUTED" && !defectDisputed));
  const nextStepHint = terminal ? (
    <Text className="text-sm text-zinc-500">
      {o.status === "REJECTED"
        ? t("siparisReddedildiAdimYok")
        : t("siparisIptalEdildiAdimYok")}
    </Text>
  ) : !canAct ? (
    <Text className="text-sm text-zinc-500">
      {t("buAdimlarRoluGerektirir", {
        role: roleLabel(isSeller ? "SATISCI" : "SATIN_ALMACI"),
      })}
    </Text>
  ) : o.status === "PENDING" && isSeller ? (
    <div className="space-y-3">
      {/* İlan teminat şartlıysa bilgi notu — belge yüklemesi yok, teminat
          platform dışında alıcıya iletilir (sipariş belgeleri kaldırıldı). */}
      {o.requireGuaranteeLetter ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t.rich("buIlandaTeminatMektubuSarti", { strong })}
        </div>
      ) : null}
      <Text className="text-sm text-zinc-600">
        {t("buSiparisiUsttekiCubuktanOnayla")}
      </Text>
    </div>
  ) : o.status === "PENDING" && !isSeller ? (
    <Text className="text-sm text-zinc-500">
      {t("saticininSiparisiOnaylamasiBekleniyor")}
    </Text>
  ) : o.status === "COMPLETED" ? (
    <div className="space-y-1">
      <Text className="text-sm text-emerald-700">
        {t("siparisTamamlandiMalTeslimEdildi")}
      </Text>
      {/* YAŞAM DÖNGÜSÜ AYRIMI: operasyonel bitiş ≠ ödeme; borç ayrı. */}
      {fullyPaid ? (
        <Text className="text-sm text-emerald-700">{t("odemeTamamlandi")}</Text>
      ) : isSeller ? (
        // D-123: satıcıya alıcıya yönelik "kaydedebilirsiniz" / "satıcının
        // onayı bekleniyor" denmez — satıcının bakış açısıyla.
        <Text className="text-sm text-amber-700">
          {paymentAwaitingConfirmation
            ? t("saticiAliciOdemeBildirdiOnaylayin", {
                amount: formatMoney(confirmedPaid, o.currency),
              })
            : isLc
              ? t("saticiOdemeAkreditifIsaretleyin")
              : o.paymentDueDate
                ? t("saticiAlicininOdemesiBekleniyorVade", {
                    amount: formatMoney(remainingDue, o.currency),
                    date: formatDate(o.paymentDueDate, "short", locale),
                  })
                : t("saticiAlicininOdemesiBekleniyor", {
                    amount: formatMoney(remainingDue, o.currency),
                  })}
        </Text>
      ) : paymentAwaitingConfirmation ? (
        <Text className="text-sm text-amber-700">
          {t("odemeBildirildiSaticininOnayiBekleniyor", {
            amount: formatMoney(confirmedPaid, o.currency),
          })}
        </Text>
      ) : isLc ? (
        <Text className="text-sm text-amber-700">
          {t("odemeAkreditifKapsamindaBankaKanalindan")}
        </Text>
      ) : (
        <Text className="text-sm text-amber-700">
          {o.paymentDueDate
            ? t("odemeBekliyorKalanVade", {
                amount: formatMoney(remainingDue, o.currency),
                date: formatDate(o.paymentDueDate, "short", locale),
              })
            : t("odemeBekliyorKalan", {
                amount: formatMoney(remainingDue, o.currency),
              })}
        </Text>
      )}
    </div>
  ) : !isSeller && pendingCancelRequest ? (
    // Arayüz testi webB-07 NEW-1: açık satıcı iptal talebinde karar ALICININ.
    <Text className="text-sm text-amber-700">
      {t("saticiIptalTalepEttiKararSizde", {
        approve: tCancel("iptaliOnayla"),
        reject: tCancel("reddet"),
      })}
    </Text>
  ) : isSeller && pendingCancelRequest ? (
    // Arayüz testi son tur: satıcının KENDİ iptal talebi açıkken "siparişi
    // gönder" denmez — panel "Alıcının kararı bekleniyor" + "İptal Talebini
    // Geri Çek" diyor; sıradaki adım kartı da aynısını söyler.
    <Text className="text-sm text-amber-700">
      {t("saticiIptalTalebinizKararBekliyor", {
        withdraw: tCancel("iptalTalebiniGeriCek"),
      })}
    </Text>
  ) : buyerPreShip && !isLc && !advanceMet ? (
    paymentAwaitingConfirmation ? (
      <Text className="text-sm text-amber-700">
        {t("pesinOdemeOnayBekliyor")}
      </Text>
    ) : (
      <Text className="text-sm text-amber-700">
        {t("pesinOdemeyiYapipBildirin", {
          advance: formatMoney(advanceDue, o.currency),
        })}
      </Text>
    )
  ) : buyerPreShip && isLc && !o.lcOpenedAt ? (
    <Text className="text-sm text-amber-700">
      {t("akreditifiActirinIsaretleyin")}
    </Text>
  ) : buyerPreShip && isLc && !o.lcAcceptedAt ? (
    <Text className="text-sm text-zinc-500">
      {t("saticininAkreditifiKabulEtmesiBekleniyor")}
    </Text>
  ) : !isSeller && o.status === "DISPUTED" && !defectDisputed ? (
    // NEW-1: iptal talebi reddedildi (A1-DISPUTED) — satıcı sevk edebilir ya
    // da alıcı iptali sonradan onaylayabilir (iki yönlü çıkış).
    <Text className="text-sm text-amber-700">
      {t("ihtilafSaticiGonderebilirVeyaIptaliOnaylayin", {
        approve: tCancel("iptaliOnayla"),
      })}
    </Text>
  ) : advanceGate ? (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      {t.rich("buSiparistePesinOdemeSarti", {
        strong,
        advance: formatMoney(advanceDue, o.currency),
        confirmed: formatMoney(confirmedPaid, o.currency),
      })}
    </div>
  ) : isSeller &&
    isLc &&
    !o.lcAcceptedAt &&
    (o.status === "ACCEPTED" ||
      o.status === "CREATED" ||
      // A1-DISPUTED: LC adımları panelde açık, sevk kabulden sonra açılır.
      (o.status === "DISPUTED" && !defectDisputed)) ? (
    <Text className="text-sm text-zinc-500">
      {t("akreditifAdimlariSoldaKabulEdildikten")}
    </Text>
  ) : isSeller &&
    isLc &&
    !o.lcPaidAt &&
    (o.status === "IN_DELIVERY" || o.status === "DELIVERED") ? (
    // NEW-2: gönderilmiş akreditifli siparişte banka ödemesini işaretlemek
    // SATICININ adımı (Akreditif bölümü "Ödeme Bankadan Alındı").
    <Text className="text-sm text-amber-700">
      {t("saticiOdemeAkreditifIsaretleyin")}
    </Text>
  ) : isSeller && defectDisputed ? (
    <Text className="text-sm text-amber-700">
      {t("ayipIhbariAcikSevkTamamlama")}
    </Text>
  ) : !isSeller && defectDisputed ? (
    // Arayüz testi son tur: alıcının açık ayıp ihbarı — panel ona "İhbarı
    // Geri Çek" sunar; "karşı taraf bekleniyor" demek yanlış olurdu.
    <Text className="text-sm text-amber-700">
      {t("aliciAyipIhbariAcikGeriCekebilirsiniz", {
        withdraw: tDefect("ihbariGeriCek"),
      })}
    </Text>
  ) : cadGate && o.status === "IN_DELIVERY" ? (
    <Text className="text-sm text-amber-700">
      {t("vesaikMukabiliTeslimAlmadanOnceKalan", {
        amount: formatMoney(remainingDue, o.currency),
      })}
    </Text>
  ) : isSeller && o.status === "DISPUTED" && next?.modal === "ship" ? (
    // Arayüz testi son tur: alıcı satıcının iptal talebini reddetti
    // (A1-DISPUTED) — panel "Mal bulunduysa Siparişi Tamamla ile…" der;
    // kart da ihtilafı ve iki çıkışı anlatır (düz "gönder" değil).
    <Text className="text-sm text-amber-700">
      {t("saticiIhtilafIptalReddedildiGonderebilirsiniz", {
        button: next.label,
        withdraw: tCancel("iptalTalebiniGeriCek"),
      })}
    </Text>
  ) : next ? (
    <Text className="text-sm text-zinc-600">
      {next.modal === "ship"
        ? sellerShips
          ? t("siparisiGonderdigindeFaturaNoIle")
          : t("malTeslimeHazirOldugundaFatura")
        : next.modal === "receive"
          ? t("maliTeslimAldigindaIsaretle")
          : t("maliInceleyipKabulEttiginizdeTamamlayin")}
    </Text>
  ) : !isSeller && o.status === "DELIVERED" && paymentAwaitingConfirmation ? (
    <Text className="text-sm text-amber-700">
      {t("odemeKaydinizSaticininOnayiniBekliyor")}
    </Text>
  ) : !isSeller && o.status === "DELIVERED" && !fullyPaid ? (
    <Text className="text-sm text-amber-700">
      {/* O3: vadeli/mal-mukabili siparişte vade gelecekteyse "şimdi öde"
          yerine vade tarihini göster (erken-ödemeye itme). */}
      {o.paymentDueDate && new Date(o.paymentDueDate) > new Date()
        ? t("odemeVadesiKalanTutariO", { formatDate: formatDate(o.paymentDueDate, "short", locale) })
        : t("kalanOdemeniziOdemelerBolumundenKaydedin")}
    </Text>
  ) : isSeller && !terminal && paymentAwaitingConfirmation ? (
    <Text className="text-sm text-amber-700">
      {t("aliciOdemeBildirdiOdemelerBolumunden")}
    </Text>
  ) : (
    <Text className="text-sm text-zinc-500">
      {t("karsiTarafinIslemiBekleniyor")}
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
          {tn(routeLabel(ordersHref) ?? "satinalma.siparisler")}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {o.number ? (
            <span className="tabular-nums text-xs font-medium tracking-wide text-zinc-400">
              {o.number}
            </span>
          ) : null}
          <MetaTag>{isSeller ? t("satisSiparisi") : t("alisSiparisi")}</MetaTag>
        </div>
        <Heading>{o.listingTitle ?? t("siparis")}</Heading>
      </div>

      {/* P2 (denetim §5): sticky ActionBar — solda durum, sağda durum makinesine
          göre TEK birincil aksiyon + ikincil aksiyonlar. Kritik aksiyonun sayfa
          dibinde (y≈1148px) kalması biter; mobil dahil ilk ekranda durur. */}
      <div className="sticky top-16 z-20 rounded-xl border border-zinc-950/10 bg-white/90 px-3 py-2 shadow-sm backdrop-blur sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <StatusBadge tone={statusMeta.tone}>{statusLabel}</StatusBadge>
          <div className="flex flex-wrap items-center gap-2">
            {/* A2: onaylı ödeme varken iptal backend'de zaten engelli (CO cancel
                CONFIRMED guard) → buton görünüp 400 vermesin; gizle + not göster. */}
            {canAct &&
            !isSeller &&
            // D-105: açık iptal talebinde karar paneli konuşur — "iptal
            // edilemez" bandı "İptali Onayla"nın yanında çelişiyordu.
            !pendingCancelRequest &&
            (o.status === "PENDING" ||
              o.status === "ACCEPTED" ||
              o.status === "CREATED") ? (
              confirmedPaid > 0 ? (
                <span className="text-xs text-zinc-400">
                  {t("onayliOdemeBulunanSiparisIptal")}
                </span>
              ) : (
                <Button
                  plain
                  className="!text-red-600 data-hover:!bg-red-50"
                  onClick={() => setModal("cancel")}
                  disabled={cancel.isPending}
                >
                  {t("siparisiIptalEt")}
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
                {t("iptalTalebi")}
              </Button>
            ) : null}
            {/* TTK 23: alıcı, teslimden 8 gün içinde ayıp ihbar edebilir. */}
            {canAct && canRaiseDefect ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">
                  {t("muayeneSuresiGun", { defectDaysLeft: defectDaysLeft })}
                </span>
                <Button
                  plain
                  className="!text-red-600 data-hover:!bg-red-50"
                  onClick={() => setModal("defectNotice")}
                  disabled={raiseDefect.isPending}
                >
                  {t("ayipIhbari")}
                </Button>
              </div>
            ) : null}
            <Button outline onClick={handlePrint}>
              {t("yazdirPdf")}
            </Button>
            {canAct && o.status === "PENDING" && isSeller ? (
              <>
                <Button
                  plain
                  className="!text-red-600 data-hover:!bg-red-50"
                  onClick={() => setModal("reject")}
                  disabled={reject.isPending}
                >
                  {t("reddet")}
                </Button>
                <Button
                  onClick={() => setModal("accept")}
                  disabled={accept.isPending}
                >
                  {t("kabulEt")}
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
                {o.status === "REJECTED" ? t("saticiReddetti") : t("iptalEdildi")}
              </StatusBadge>
            ) : (
              <div className="flex items-start gap-2">
                {steps.map((s, i) => {
                  const done = i < stage.done;
                  const current = i === stage.current;
                  const disputedStep = current && !!stage.disputed;
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
                              : disputedStep
                                ? "border-amber-500 bg-amber-50 text-amber-700 ring-4 ring-amber-500/15"
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
                              : disputedStep
                                ? "font-semibold text-amber-700"
                                : current
                                  ? "font-semibold text-blue-700"
                                  : "text-zinc-500"
                          }`}
                        >
                          {stepLabel(s)}
                        </span>
                      </div>
                      {i < steps.length - 1 ? (
                        <div
                          className={`mt-3.5 h-0.5 flex-1 rounded-full ${
                            i < stage.done - 1 || stage.done >= steps.length
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
                  {isSeller ? t("bagliAlimTalebi") : t("bagliSatinAlmaTalebi")}
                </h2>
              </div>
              {o.listingId ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {o.listingTitle ?? "—"}
                    </p>
                    <p className="mt-0.5 tabular-nums text-xs text-zinc-500">
                      {o.listingNumber ?? "—"}
                      {o.listingType ? (
                        <span className="ml-2 font-sans">
                          {isSeller ? t("alimTalebi") : t("satinAlmaTalebi")}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <Button outline href={`/company/ilan/${o.listingId}`}>
                    {isSeller ? t("alimTalebineGit") : t("satinAlmaTalebineGit")}
                  </Button>
                </div>
              ) : (
                <Text className="text-sm text-zinc-500">
                  {t("bagliTalepKaydiYokSilinmis")}
                </Text>
              )}
            </section>

            <section className="card p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-zinc-500" />
                  <h2 className="text-sm font-semibold text-zinc-900">
                    {isSeller ? t("aliciFirma") : t("saticiFirma")}
                  </h2>
                </div>
                <Button
                  outline
                  href={`/company/mesajlar?with=${o.counterpartyCompanyId}&portal=${isSeller ? "satis" : "satinalma"}`}
                >
                  {t("mesajGonder")}
                </Button>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="col-span-2">
                  <dt className="text-xs text-zinc-500">{t("firma")}</dt>
                  <dd className="font-medium text-zinc-900">
                    {o.counterparty}
                    {o.counterpartyProfile.rothernId ? (
                      <span className="ml-2 tabular-nums text-xs text-zinc-400">
                        {o.counterpartyProfile.rothernId}
                      </span>
                    ) : null}
                  </dd>
                </div>
                {o.counterpartyProfile.city ? (
                  <div>
                    <dt className="text-xs text-zinc-500">{t("sehir")}</dt>
                    <dd className="text-zinc-900">
                      {o.counterpartyProfile.city}
                    </dd>
                  </div>
                ) : null}
                {o.counterpartyProfile.industry ? (
                  <div>
                    <dt className="text-xs text-zinc-500">{t("sektor")}</dt>
                    <dd className="text-zinc-900">
                      {o.counterpartyProfile.industry}
                    </dd>
                  </div>
                ) : null}
                {o.counterpartyProfile.email ? (
                  <div>
                    <dt className="text-xs text-zinc-500">{t("ePosta")}</dt>
                    <dd className="truncate text-zinc-900">
                      {o.counterpartyProfile.email}
                    </dd>
                  </div>
                ) : null}
                {o.counterpartyProfile.phone ? (
                  <div>
                    <dt className="text-xs text-zinc-500">{t("telefon")}</dt>
                    <dd className="text-zinc-900">
                      {o.counterpartyProfile.phone}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>
          </div>

          {/* Teslimat adresi — award anındaki snapshot (talebin adresi). */}
          {o.deliveryAddress ? (
            <section className="card p-5">
              <div className="mb-3 flex items-center gap-2">
                <Truck className="h-4 w-4 text-zinc-500" />
                <h2 className="text-sm font-semibold text-zinc-900">
                  {t("teslimatAdresi")}
                </h2>
              </div>
              <p className="text-sm text-zinc-900">
                <span className="font-medium">{o.deliveryAddress.title}</span>{" "}
                — {o.deliveryAddress.addressLine}
                {placeLabel(o.deliveryAddress) ? `, ${placeLabel(o.deliveryAddress)}` : ""}
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
            /* D-285: sütun kırılımı GÖRÜNTÜ ALANINA değil KARTIN genişliğine
               bağlı (`@container`): lg iki sütunlu düzende kart ~460 px'e
               iner; beş sütun yalnız kart beşini taşıyabildiğinde (@2xl). */
            <section className="@container">
              <Table dense>
                <TableHead>
                  <TableRow>
                    <TableHeader>{t("kalem")}</TableHeader>
                    <TableHeader className="text-right">{t("miktar")}</TableHeader>
                    {/* D-285: dar kartta teslim ve birim fiyat ad hücresinin
                        altına iner — tablo yatay kaydırmasız sığar. */}
                    <TableHeader className="hidden text-right @2xl:table-cell">
                      {t("teslimTarihi")}
                    </TableHeader>
                    <TableHeader className="hidden text-right @2xl:table-cell">
                      {t("birimFiyat")}
                    </TableHeader>
                    <TableHeader className="text-right">{t("tutar")}</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {o.items.map((it) => {
                    const deliveryCell = itemDeliveryLabel(
                      it.deliveryDate,
                      o.expectedDeliveryDate,
                      it.deliveryTime,
                      printLabels.general,
                      deliveryTimeLabel,
                      locale,
                    );
                    return (
                    <TableRow key={it.id}>
                      {/* D-285: uzun kalem adı SARILIR (tablo whitespace-nowrap;
                          tek satır ad Tutar sütununu kart dışına itiyordu). */}
                      <TableCell className="min-w-28 whitespace-normal font-medium @md:min-w-40 text-zinc-900 [overflow-wrap:anywhere]">
                        {it.name}
                        {/* O-003: muadil beyanı / istenen marka-parça no siparişte
                            de bağlayıcı kayıt (award snapshot'ı). */}
                        {it.isAlternative ? (
                          <AlternativeOfferNote
                            bidItem={it}
                            item={{ brand: it.requestedBrand, mpn: it.requestedMpn }}
                          />
                        ) : it.requestedBrand || it.requestedMpn ? (
                          <span className="block text-xs font-normal text-zinc-500">
                            {[it.requestedBrand, it.requestedMpn]
                              .map((v) => v?.trim())
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        ) : null}
                        {it.note ? (
                          <span className="block text-xs font-normal text-zinc-400">
                            {it.note}
                          </span>
                        ) : null}
                        <span className="mt-0.5 block text-xs font-normal text-zinc-500 @2xl:hidden">
                          {t("teslimTarihi")}: {deliveryCell} · {t("birimFiyat")}:{" "}
                          <span className="tabular-nums">{formatMoney(it.unitPrice, o.currency)}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-zinc-600">
                        {quantity(it.quantity, it.unit)}
                      </TableCell>
                      <TableCell className="hidden text-right text-zinc-600 @2xl:table-cell">
                        {deliveryCell}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums text-zinc-600 @2xl:table-cell">
                        {formatMoney(it.unitPrice, o.currency)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-zinc-900">
                        {formatMoney(
                          Number(it.unitPrice) * Number(it.quantity),
                          o.currency,
                        )}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </section>
          ) : null}

          {/* Banka & Fatura */}
          {/* O-029: akreditifte ödeme banka kanalından — siparişe işlenmiş (eski
              kayıtlarda varsayılan) hesap gösterilmez, yalnız fatura no. */}
          {(!isLc && (o.bankAccountHolder || o.bankIban || o.bankAccountNumber)) ||
          o.invoiceNumber ? (
            <section className="card p-5">
              <div className="mb-3 flex items-center gap-2">
                <Banknote className="h-4 w-4 text-zinc-500" />
                <h2 className="text-sm font-semibold text-zinc-900">
                  {t("odemeFatura")}
                </h2>
              </div>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                {!isLc && o.bankAccountHolder ? (
                  <div>
                    <dt className="text-xs text-zinc-500">{t("hesapSahibi")}</dt>
                    <dd className="font-medium text-zinc-900">
                      {o.bankAccountHolder}
                    </dd>
                  </div>
                ) : null}
                {!isLc && o.bankIban ? (
                  <div>
                    <dt className="text-xs text-zinc-500">IBAN</dt>
                    <dd className="text-zinc-900">
                      <Iban value={o.bankIban} />
                    </dd>
                  </div>
                ) : null}
                {!isLc && o.bankAccountNumber ? (
                  <div>
                    <dt className="text-xs text-zinc-500">{t("hesapNo")}</dt>
                    <dd className="tabular-nums text-zinc-900">{o.bankAccountNumber}</dd>
                  </div>
                ) : null}
                {!isLc && o.bankSwiftBic ? (
                  <div>
                    <dt className="text-xs text-zinc-500">{t("swiftBic")}</dt>
                    <dd className="text-zinc-900">{o.bankSwiftBic}</dd>
                  </div>
                ) : null}
                {!isLc && o.bankName ? (
                  <div>
                    <dt className="text-xs text-zinc-500">{t("bankaAdi")}</dt>
                    <dd className="text-zinc-900">{o.bankName}</dd>
                  </div>
                ) : null}
                {o.invoiceNumber ? (
                  <div>
                    <dt className="text-xs text-zinc-500">{t("faturaNo")}</dt>
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
              ratee={isSeller ? "buyer" : "supplier"}
            />
          ) : null}
        </div>

        {/* Sağ kolon — sticky özet: taraf, tutar, ödeme durumu, vade. */}
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-32">
          <section className="card p-5">
            <h2 className="text-sm font-semibold text-zinc-900">{t("ozet")}</h2>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900">
              {formatMoney(o.amount, o.currency)}
            </p>
            <dl className="mt-4 space-y-2.5 border-t border-zinc-950/5 pt-4">
              <SummaryRow label={isSeller ? t("alici") : t("satici")}>
                <span className="block truncate">{o.counterparty}</span>
              </SummaryRow>
              <SummaryRow label={t("kalem")}>
                {t("nKalem", { n: o.items.length })}
              </SummaryRow>
              <SummaryRow label={t("siparisTarihi")}>
                {formatDate(o.createdAt, "short", locale)}
              </SummaryRow>
              <SummaryRow label={t("onayliOdeme")}>
                <span className=" tabular-nums">
                  {formatMoney(confirmedPaid, o.currency)}
                </span>
              </SummaryRow>
              {/* D-127: bekleyen (onaysız) bildirim ayrı satırda; "Kalan" onaylı
                  ödemeye göre borç. D-105: iptal/ret siparişte borç yok → gizli. */}
              {!terminal && pendingPaid > 0 ? (
                <SummaryRow label={t("onayBekleyenOdeme")}>
                  <span className="tabular-nums text-amber-700">
                    {formatMoney(pendingPaid, o.currency)}
                  </span>
                </SummaryRow>
              ) : null}
              {!terminal ? (
                <SummaryRow label={t("kalan")}>
                  <span
                    className={` tabular-nums ${
                      fullyPaid ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {formatMoney(outstanding, o.currency)}
                  </span>
                </SummaryRow>
              ) : null}
              {o.paymentDueDate ? (
                <SummaryRow label={t("odemeVadesi")}>
                  {formatDate(o.paymentDueDate, "short", locale)}
                </SummaryRow>
              ) : null}
            </dl>
          </section>

          {/* Sıradaki adım — aksiyonun kendisi ActionBar'da, anlatısı burada. */}
          <section className="card p-5">
            <h2 className="mb-2 text-sm font-semibold text-zinc-900">
              {t("siradakiAdim")}
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
        isLetterOfCredit={isLc}
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
        title={t("teslimAldim")}
        description={t("teslimAlindiOlarakIsaretlenecek", {
          number: o.number ?? t("siparis"),
        })}
        confirmLabel={t("teslimAldim")}
      />
      <NoteModal
        open={modal === "complete"}
        onClose={close}
        onSubmit={doComplete}
        pending={complete.isPending}
        title={t("siparisiTamamla")}
        description={t("tamamlaniyor", { number: o.number ?? t("siparis") })}
        confirmLabel={t("tamamla")}
      />
      <ReasonModal
        open={modal === "reject"}
        onClose={close}
        onSubmit={doReject}
        pending={reject.isPending}
        title={t("siparisiReddet")}
        description={t("redGerekcesiAliciyaIletilir")}
        confirmLabel={t("siparisiReddet")}
        minLength={10}
      />
      <ReasonModal
        open={modal === "cancel"}
        onClose={close}
        onSubmit={doCancel}
        pending={cancel.isPending}
        title={t("siparisiIptalEt")}
        description={t("iptalGerekcesiSaticiyaIletilir")}
        confirmLabel={t("siparisiIptalEt")}
        minLength={10}
      />
      <ReasonModal
        open={modal === "cancelRequest"}
        onClose={close}
        onSubmit={doRequestCancel}
        pending={requestCancel.isPending}
        title={t("iptalTalebiAc")}
        description={t("nedenSevkEdemiyorsunuzGerekceAliciya")}
        confirmLabel={t("iptalTalebiGonder")}
        minLength={10}
      />
      <ReasonModal
        open={modal === "defectNotice"}
        onClose={close}
        onSubmit={doRaiseDefect}
        pending={raiseDefect.isPending}
        title={t("ayipIhbariTtk23")}
        description={t("teslimAldiginizMaldakiAyibiAciklayin")}
        confirmLabel={t("ayipIhbariGonder")}
        minLength={10}
      />
    </div>
  );
}
