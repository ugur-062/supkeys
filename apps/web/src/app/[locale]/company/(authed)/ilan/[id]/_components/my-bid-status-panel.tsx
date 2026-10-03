"use client";

import { useLocale, useTranslations } from "next-intl";
import { useBidDeliveryTimeLabel, useOrderStatusLabel, useSystemText, useQuantityLabel, useUnitLabel } from "@/i18n/domain";
import { formatDate } from "@/lib/format-date";
import { intlLocale } from "@/i18n/format";
import { Badge } from "@/components/catalyst/badge";
import { Callout } from "@/components/ui/callout";
import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import {
  useExtendBidValidity,
  type ListingDetail,
} from "@/hooks/use-company-listings";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { userHasPermission } from "@/lib/company/permissions";
import { extractErrorMessage } from "@/lib/tenders/error";
import { formatDateTime } from "@/lib/tenders/date";
import { cn } from "@/lib/utils";
import { Trophy } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useState } from "react";
import { useDialogSubmitLock } from "@/hooks/use-submit-lock";
import { toast } from "sonner";
import { affixCurrency } from "@/lib/tenders/labels";
import { lineAmount, MONEY_FRACTION } from "@/lib/line-amount";
import { lostBidOutcome } from "@/lib/tenders/lost-bid-outcome";
import { parseSystemText } from "@rothern/shared";
import { AlternativeOfferNote } from "@/components/tenders/alternative-offer-note";
import { yesNoAnswerLabel } from "@/lib/tenders/yes-no-answer";
import { orderStatusMeta } from "@/lib/orders/order-status";
import type { CompanyOrderStatus } from "@/hooks/use-company-orders";
import { useNumberField } from "@/components/ui/number-input";

type Tone = "success" | "info" | "warning" | "danger";

/** Yerel implementasyon Callout primitive'ine indi (denetim §9 tekilleştirme). */
function StatusAlert({
  tone,
  title,
  children,
}: {
  tone: Tone;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <Callout variant={tone} title={title}>
      {children}
    </Callout>
  );
}

/** Teklif durumu → katalog anahtarı (`web.panel.requests.myBidStatusPanel`) + rozet rengi. */
const BID_STATUS_BADGE: Record<string, { key: string; color: "zinc" | "amber" | "violet" | "emerald" | "rose" }> = {
  DRAFT: { key: "taslak", color: "amber" },
  SUBMITTED: { key: "gonderildi", color: "violet" },
  WON: { key: "kazandiniz", color: "emerald" },
  AWARDED_PARTIAL: { key: "kismenKazandiniz", color: "emerald" },
  LOST: { key: "kaybettiniz", color: "rose" },
  WITHDRAWN: { key: "geriCekildi", color: "zinc" },
};

/** LOST teklifin rozeti sonuca göre (arayüz testi D-102/D-117). */
const LOST_BADGE: Record<ReturnType<typeof lostBidOutcome>, { key: string; color: "zinc" | "rose" }> = {
  // Satıcı kazandığı siparişi kendisi reddetti — alıcı ELEMEDİ (arayüz testi son tur).
  orderRejected: { key: "siparisiReddettiniz", color: "zinc" },
  eliminated: { key: "elendi", color: "rose" },
  lost: { key: "kaybettiniz", color: "rose" },
  cancelled: { key: "iptalEdildi", color: "zinc" },
  closed: { key: "kapandi", color: "zinc" },
};

/** Talep sonuçlandı/iptal — teklif geçerlilik geri sayımı anlamını yitirir. */
const TERMINAL_LISTING = new Set(["AWARDED", "CLOSED_NO_AWARD", "CANCELLED"]);

/** Teklif özeti kartı — statü / versiyon / toplam + geçerlilik + kalemler + not. */
export function BidSummaryCard({ l }: { l: ListingDetail }) {
  const t = useTranslations("web.panel.requests.myBidStatusPanel");
  const bidDeliveryTimeLabel = useBidDeliveryTimeLabel();
  const bid = l.myBid;
  const extend = useExtendBidValidity(l.id);
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendDays, setExtendDays] = useState("30");
  // Çift tık süreyi iki kez uzatmasın (arayüz testi FX-00 D-272; sunucu da
  // aynı uzatmayı kısa pencerede tekrar uygulamaz).
  const extendLock = useDialogSubmitLock(extendOpen);
  const { user } = useCompanyAuth();
  const unitLabel = useUnitLabel();
  const quantity = useQuantityLabel();
  const locale = useLocale();
  // Erken return'den ÖNCE (kanca sırası).
  const extendDaysField = useNumberField({ value: extendDays, onChange: setExtendDays });
  const intl = intlLocale(locale);
  if (!bid) return null;
  // Dalga B-2: elle sembol türetme kaldırıldı (USD "$" yerine "USD" gösteriyordu).
  // Sembolün yeri dilden (`affixCurrency`): İngilizcede önde.
  const cur = bid.currency ?? "TRY";
  // Kalem satırları KALEMİN birimiyle (madde 9 çok-birimli teklif; derin
  // denetim Y-14) — `bi.currency` null ise teklifin ana birimi.
  const withSym = (formatted: string, c: string = cur) =>
    affixCurrency(formatted, c, intl);
  const mixedItemCurrency = (bid.items ?? []).some(
    (bi) => !!bi.currency && bi.currency !== cur,
  );
  const itemName = new Map(
    (l.items ?? []).map((it) => [it.id, it] as const),
  );
  // Statü teklif + talep durumundan: elenen "Elendi" (yeniden teklif verebilir),
  // kazandırmada kaybeden "Kaybettiniz", iptal/kazanansız kapanan nötr.
  const badge =
    bid.status === "LOST"
      ? LOST_BADGE[lostBidOutcome(bid, l.status)]
      : (BID_STATUS_BADGE[bid.status] ?? BID_STATUS_BADGE.SUBMITTED);

  // Geçerlilik: son gün = submittedAt + validityDays. Süresi dolan teklif
  // fiyat değişmeden uzatılabilir; taşımada taslağa düşmüşse uzatma onu
  // aynı fiyatla yeniden canlıya döndürür.
  // Yalnız canlı (gönderilmiş/taslak) teklifte ve talep sonuçlanmamışken —
  // iptal/sonuçlanmış talepte geri sayım sürmesin (arayüz testi D-117).
  const validityRelevant =
    (bid.status === "SUBMITTED" || bid.status === "DRAFT") &&
    !TERMINAL_LISTING.has(l.status);
  const validUntil =
    validityRelevant && bid.submittedAt && bid.validityDays
      ? new Date(
          new Date(bid.submittedAt).getTime() +
            bid.validityDays * 86_400_000,
        )
      : null;
  const validityExpired =
    validUntil != null && validUntil.getTime() < Date.now();
  const daysLeft =
    validUntil != null
      ? Math.ceil((validUntil.getTime() - Date.now()) / 86_400_000)
      : null;
  // Uzatma backend'le aynı pencerede serbest: OPEN (kapanış geçmemişse) +
  // değerlendirme aşamaları — alıcı karar veremezken teklifin dolmaması
  // tam da bu akışın amacı (extendBidValidity aynası). CLOSED = yönetici
  // moderasyonu: backend 400 ile reddeder, düğme çizilmez. İzin kapısı da
  // birebir: `sell:bid:submit` (BIDDER_PERMISSION) — SATISCI etiketi her
  // satış işlem izninden türer (yalnız ürün yönetimi olan üye de taşır),
  // kapı olarak kullanılamaz. SAHIP muafiyeti yok — Kurucu talepte
  // salt-gözlemci.
  // TASLAK canlandırma fiilen yeniden gönderimdir → yalnız teklif alımı
  // açıkken (OPEN, kapanış gelecekte, açılış embargosu bitmiş); değerlendirme
  // aşamasında yalnız SUBMITTED teklif uzatılır (extendBidValidity aynası).
  const biddingOpen =
    l.status === "OPEN" &&
    (!l.closesAt || new Date(l.closesAt).getTime() > Date.now()) &&
    (!l.bidsOpenAt || new Date(l.bidsOpenAt).getTime() <= Date.now());
  // Canlandırma placeBid'in erişim + KYC kapılarından geçer (arayüz testi
  // O-071/O-072): teklif hakkı kalmamışsa (bağlantısı düşen ücretsiz üye) ya
  // da davetsiz/bağlantısız teklif doğrulama istiyorsa düğme çizilmez.
  const canExtend =
    userHasPermission(user, "sell:bid:submit") &&
    validUntil != null &&
    (bid.status === "DRAFT"
      ? biddingOpen && l.canBid !== false && !l.bidRequiresVerification
      : bid.status === "SUBMITTED" &&
        (l.status === "OPEN"
          ? !l.closesAt || new Date(l.closesAt).getTime() > Date.now()
          : ["IN_AWARD", "IN_AWARD_APPROVAL"].includes(l.status)));

  // Uzatma mevcut bitişin ÜZERİNE eklenir (backend: validityDays += gün).
  const extendDaysNum = Number(extendDays);
  const extendDaysValid =
    Number.isInteger(extendDaysNum) &&
    extendDaysNum >= 1 &&
    extendDaysNum <= 365;
  const newValidUntil =
    validUntil != null && extendDaysValid
      ? new Date(validUntil.getTime() + extendDaysNum * 86_400_000)
      : null;
  // Süresi dolmuş teklifte kısa uzatma bitişi yine geçmişte bırakabilir —
  // backend reddeder, biz baştan engelleyip yönlendiriyoruz.
  const extendTooShort =
    newValidUntil != null && newValidUntil.getTime() <= Date.now();

  const handleExtend = () => void extendLock.run(doExtend);
  const doExtend = async () => {
    try {
      const res = await extend.mutateAsync({
        additionalDays: extendDaysNum,
        expectedValidityDays: bid.validityDays ?? undefined,
      });
      toast.success(
        res.revived
          ? t("gecerlilikUzatildiTeklifinizAyniFiyatla")
          : t("gecerlilikUzatildiTarihineKadar", { formatDateTime: formatDateTime(res.validUntil, locale) }),
      );
      setExtendOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, t("gecerlilikUzatilamadi")));
    }
  };

  return (
    <div className="rounded-xl border border-zinc-950/10 bg-white p-5">
      {/* Versiyon hücresi kaldırıldı — tedarikçiye teknik gürültü
          (alıcı tarafındaki v2 rozeti duruyor: güncellendi bilgisi). */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            {t("statu")}
          </p>
          <div className="mt-1">
            <Badge color={badge.color}>{t(badge.key as never)}</Badge>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            {t("toplam")}
          </p>
          <p className="mt-1 text-sm font-bold text-zinc-950 tabular-nums">
            {withSym(Number(bid.amount).toLocaleString(intl, MONEY_FRACTION))}
          </p>
        </div>
      </div>

      {validUntil ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
              {t("teklifGecerliligi")}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p
                className={cn(
                  "text-sm font-medium",
                  validityExpired ? "text-rose-600" : "text-zinc-900",
                )}
              >
                {t("tarihineKadar", { date: formatDate(validUntil, "short", locale) })}
              </p>
              <Badge
                color={
                  validityExpired
                    ? "rose"
                    : daysLeft != null && daysLeft <= 7
                      ? "amber"
                      : "zinc"
                }
              >
                {validityExpired ? t("suresiDoldu") : t("gunKaldi", { daysLeft: daysLeft ?? 0 })}
              </Badge>
            </div>
          </div>
          {canExtend ? (
            <Button outline onClick={() => setExtendOpen(true)}>
              {t("gecerliligiUzat")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Geçerlilik uzatma — gün seçimli diyalog. Süre mevcut bitişin üzerine
          eklenir; süresi dolmuş/taslağa düşmüş teklif aynı fiyatla canlanır. */}
      <Dialog open={extendOpen} onClose={() => setExtendOpen(false)}>
        <DialogTitle>{t("teklifGecerliliginiUzat")}</DialogTitle>
        <DialogDescription>
          {validityExpired
            ? t("teklifinizinGecerliligiTarihindeDoldu", { formatDate: formatDate(validUntil, "short", locale) })
            : t("teklifinizTarihineKadarGecerli", { formatDate: formatDate(validUntil, "short", locale) })}{" "}
          {t("sectiginizSureMevcutBitisTarihine")}
        </DialogDescription>
        <DialogBody className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-zinc-700">
              {t("uzatmaSuresi")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {[7, 15, 30, 60, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setExtendDays(String(d))}
                  aria-pressed={extendDays === String(d)}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    extendDays === String(d)
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-zinc-300 text-zinc-700 hover:bg-zinc-50",
                  )}
                >
                  {t("gun", { d: d })}
                </button>
              ))}
              <span className="flex items-center gap-2 text-sm text-zinc-500">
                {/* Yerel tam sayı (arayüz testi kapanış NUM): `type="number"`
                    "0,5"i 05 = 5 gün okuyup uzatıyordu. */}
                <input
                  {...extendDaysField.inputProps}
                  aria-label={t("ozelUzatmaSuresiGun")}
                  aria-invalid={!extendDaysValid || undefined}
                  className={cn(
                    "w-20 rounded-md border border-zinc-300 px-2 py-1.5 text-right text-sm",
                    !extendDaysValid && "border-rose-500",
                  )}
                />
                {t("gun2")}
              </span>
            </div>
          </div>
          {!extendDaysValid ? (
            <p className="text-sm text-rose-600">
              {t("uzatmaSuresi1365Gun")}
            </p>
          ) : extendTooShort ? (
            <p className="text-sm text-rose-600">
              {t("buSureYetmiyorSonGecerlilik")}
            </p>
          ) : newValidUntil ? (
            <p className="text-sm text-zinc-700">
              {t.rich("yeniBitis", {
                date: formatDate(newValidUntil, "short", locale),
                strong: (c) => <span className="font-semibold text-zinc-950">{c}</span>,
              })}
            </p>
          ) : null}
          {(validityExpired || bid.status === "DRAFT") &&
          extendDaysValid &&
          !extendTooShort ? (
            <p className="text-sm text-emerald-700">
              {t("uzatincaTeklifinizAyniFiyatlaYeniden")}
            </p>
          ) : null}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setExtendOpen(false)}>
            {t("vazgec")}
          </Button>
          <Button
            disabled={extend.isPending || extendLock.locked || !extendDaysValid || extendTooShort}
            onClick={handleExtend}
          >
            {t("gecerliligiUzat")}
          </Button>
        </DialogActions>
      </Dialog>

      {bid.items && bid.items.length > 0 ? (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="mb-2 text-xs font-medium text-zinc-500">
            {t("fiyatlandirilanKalemler", { length: bid.items.length })}
          </p>
          {(() => {
            // Teslim kolonu kalemde ya da teklifin GENEL süresinde değer
            // varsa; kalemsiz satır genel süreye düşer (arayüz testi D-118).
            const generalDelivery =
              bidDeliveryTimeLabel(bid.deliveryTime) ??
              (bid.deliveryDate ? formatDate(bid.deliveryDate, "short", locale) : null);
            const hasDelivery =
              !!generalDelivery ||
              bid.items!.some((bi) => bi.deliveryTime || bi.deliveryDate);
            return (
              <Table dense>
                <TableHead>
                  <TableRow>
                    {/* Kalem sütunu daralmasın: cevap/muadil satırları dar
                        ekranda kelime kelime kırılıyordu; tablo zaten yatay kayar. */}
                    <TableHeader className="min-w-48">{t("kalem")}</TableHeader>
                    <TableHeader className="text-right">{t("miktar")}</TableHeader>
                    <TableHeader className="text-right">
                      {t("birimFiyat")}
                    </TableHeader>
                    {hasDelivery ? (
                      <TableHeader className="text-right">{t("teslim")}</TableHeader>
                    ) : null}
                    <TableHeader className="text-right">
                      {t("satirToplami")}
                    </TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {bid.items!.map((bi) => {
                    const item = itemName.get(bi.itemId);
                    // Kalem sorularına verilen cevaplar (alıcının gördüğüyle aynı).
                    const itemAnswers = (item?.questions ?? [])
                      .map((q) => ({
                        q,
                        value: bid.answers?.find((a) => a.questionId === q.id)?.value,
                      }))
                      .filter((x) => x.value);
                    return (
                      <TableRow key={bi.itemId}>
                        <TableCell className="min-w-48 whitespace-normal text-zinc-900">
                          {item?.name ?? t("kalem")}
                          <AlternativeOfferNote bidItem={bi} item={item} />
                          {itemAnswers.map(({ q, value }) => (
                            <span key={q.id} className="block text-xs text-zinc-500">
                              {q.text}:{" "}
                              <strong className="font-medium text-zinc-700">
                                {q.answerType === "YES_NO" && value
                                  ? yesNoAnswerLabel(value, { yes: t("evet"), no: t("hayir") })
                                  : value}
                              </strong>
                            </span>
                          ))}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap text-zinc-600 tabular-nums">
                          {item
                            ? quantity(item.quantity, item.unit, item.unitCode)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap text-zinc-600 tabular-nums">
                          {withSym(
                            Number(bi.unitPrice).toLocaleString(intl, MONEY_FRACTION),
                            bi.currency || cur,
                          )}
                        </TableCell>
                        {hasDelivery ? (
                          <TableCell className="text-right whitespace-nowrap text-zinc-600 tabular-nums">
                            {bidDeliveryTimeLabel(bi.deliveryTime) ??
                              (bi.deliveryDate
                                ? formatDate(bi.deliveryDate, "short", locale)
                                : (generalDelivery ?? "—"))}
                          </TableCell>
                        ) : null}
                        <TableCell className="text-right font-medium whitespace-nowrap text-zinc-900 tabular-nums">
                          {item
                            ? withSym(
                                lineAmount(Number(item.quantity), Number(bi.unitPrice)).toLocaleString(intl, MONEY_FRACTION),
                                bi.currency || cur,
                              )
                            : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow>
                    <TableCell className="font-semibold text-zinc-900">
                      {t("toplam")}
                    </TableCell>
                    <TableCell />
                    <TableCell />
                    {hasDelivery ? <TableCell /> : null}
                    <TableCell className="text-right font-bold whitespace-nowrap text-zinc-950 tabular-nums">
                      {withSym(Number(bid.amount).toLocaleString(intl, MONEY_FRACTION))}
                      {mixedItemCurrency ? (
                        <div className="text-xs font-normal whitespace-normal text-zinc-500">
                          {t("toplamAnaBirimeCevrildi", { currency: cur })}
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            );
          })()}
        </div>
      ) : null}

      {bid.deliveryTime || bid.deliveryDate ? (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="mb-1 text-xs font-medium text-zinc-500">{t("genelTeslim")}</p>
          <p className="text-sm text-zinc-700">
            {bidDeliveryTimeLabel(bid.deliveryTime) ??
              (bid.deliveryDate ? formatDate(bid.deliveryDate, "short", locale) : "—")}
          </p>
        </div>
      ) : null}

      {bid.note ? (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="mb-1 text-xs font-medium text-zinc-500">{t("genelNot")}</p>
          <p className="text-sm whitespace-pre-wrap text-zinc-700">{bid.note}</p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Teklifim durum makinesi — eski tedarikçi MyBidTab portu. İlan + teklif
 * durumuna göre bilgilendirme bandı üretir (kazandın / kısmen / elendin+gerekçe
 * / taslak / gönderildi / geri çekildi / kapandı). Özet kart ayrıca eklenir.
 */
export function MyBidStatusPanel({ l }: { l: ListingDetail }) {
  const t = useTranslations("web.panel.requests.myBidStatusPanel");
  const systemText = useSystemText();
  const orderStatusLabel = useOrderStatusLabel();
  const locale = useLocale();
  const bid = l.myBid;
  const open = l.status === "OPEN";
  // Kazanınca oluşan sipariş, teklifçinin (satıcının) kendi portalında
  // listelenir.
  const ordersHref = "/company/satis/siparisler";
  const ordersLabel = t("satislarimiGoruntule");

  if (!bid) {
    return open ? null : (
      <StatusAlert tone="info" title={t("buSatinAlmaTalebineTeklif")} />
    );
  }

  const alerts: React.ReactNode[] = [];
  // Elenen teklif yeni tura taşınmaz (O-026): eski turda LOST kalır. Yeni tur
  // açıldıysa metin "bu turda" değil "önceki turda elendi" demeli.
  const eliminatedEarlierRound =
    bid.round != null && l.currentRound != null && bid.round < l.currentRound;
  // İptal her sonucu ezer — iptalde teklifler LOST'a çekildiğinden "kazanamadın"
  // mesajı yanıltıcı olurdu.
  if (l.status === "CANCELLED") {
    alerts.push(
      <StatusAlert
        key="cancelled"
        tone="info"
        title={t("satinAlmaTalebiIlanSahibi")}
      >
        {l.cancelReason ? <p>{t("gerekce", { cancelReason: l.cancelReason })}</p> : null}
      </StatusAlert>,
    );
  } else if (bid.status === "WON" || bid.status === "AWARDED_PARTIAL") {
    // P2 (denetim §10.4): kazanma banner'ı — üç başarı sembolü (Check+Trophy+
    // emoji) teke indi (Trophy amber), gradient zemin + "sırada ne var" 3 adım
    // + TEK birincil aksiyon. Kazanan SATICI (siparişi kendisi onaylar).
    // "Sırada ne var" adımları yalnız sipariş satıcı onayını beklerken;
    // ilerlemiş siparişte güncel durum yazılır (arayüz testi D-195).
    const order = l.myOrder ?? null;
    const steps =
      !order || order.status === "PENDING"
        ? [
            t("siparisOlusturulduOnayinBekleniyor"),
            t("onaylaTeslimEtVeFatura"),
            t("odemeyiSiparisSayfasindanIzle"),
          ]
        : null;
    alerts.push(
      <div
        key="won"
        className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <Trophy className="h-5 w-5 text-amber-600" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-emerald-900">
              {bid.status === "WON"
                ? t("tebriklerTeklifinKazandi")
                : t("tebriklerBaziKalemleriKazandiniz")}
            </p>
            {steps ? (
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-emerald-800">
                {steps.map((st) => (
                  <li key={st}>{st}</li>
                ))}
              </ol>
            ) : order ? (
              <p className="mt-2 text-sm text-emerald-800">
                {t("siparisDurumu", {
                  status: orderStatusLabel(
                    orderStatusMeta(order.status as CompanyOrderStatus).labelKey,
                  ),
                })}
              </p>
            ) : null}
            <div className="mt-3">
              <Button href={ordersHref}>{ordersLabel}</Button>
            </div>
          </div>
        </div>
      </div>,
    );
  } else if (bid.status === "LOST" && lostBidOutcome(bid, l.status) === "orderRejected") {
    // Kazandığı siparişi teklifçi (satıcı) KENDİSİ reddetti: ret yolu teklifi
    // eliminatedAt + `[[ORDER_REJECTED]]` ile LOST'a düşürür, ama bu alıcının
    // elemesi ya da "kazanamadınız" değildir (arayüz testi son tur). Gerekçe
    // olarak satıcının kendi yazdığı metin gösterilir.
    const ownReason = parseSystemText(bid.eliminationReason).text;
    alerts.push(
      <StatusAlert key="order-rejected" tone="info" title={t("kazandiginizSiparisiReddettiniz")}>
        {ownReason ? (
          <p>
            <span className="font-medium">{t("gerekce2")}</span> {ownReason}
          </p>
        ) : null}
        {open ? <p className="mt-1">{t("satinAlmaTalebiHalaAcik")}</p> : null}
      </StatusAlert>,
    );
  } else if (bid.status === "LOST" && open) {
    alerts.push(
      <StatusAlert
        key="lost-open"
        tone="warning"
        title={
          eliminatedEarlierRound
            ? t("teklifinizOncekiTurdaElendi", { round: bid.round! })
            : t("teklifinizBuTurdaElendi")
        }
      >
        {bid.eliminationReason ? (
          <p>
            <span className="font-medium">{t("gerekce2")}</span> {systemText(bid.eliminationReason)}
          </p>
        ) : null}
        <p className="mt-1">
          {eliminatedEarlierRound
            ? t("yeniTurAcikYenidenTeklifVerebilirsiniz", {
                currentRound: l.currentRound,
              })
            : t("satinAlmaTalebiHalaAcik")}
        </p>
      </StatusAlert>,
    );
  } else if (
    bid.status === "LOST" &&
    bid.eliminatedAt &&
    (l.status === "IN_AWARD" || l.status === "IN_AWARD_APPROVAL")
  ) {
    // Alıcı değerlendirme aşamasında da eleyebilir (backend OPEN|IN_AWARD).
    // Talep henüz sonuçlanmadı (yeni tur açılabilir) — "sonuçlandı" demek
    // yanlış olur; gerekçe de burada görünmeli (derin denetim LU-21).
    alerts.push(
      <StatusAlert
        key="lost-review"
        tone="warning"
        title={
          eliminatedEarlierRound
            ? t("teklifinizOncekiTurdaElendi", { round: bid.round! })
            : t("teklifinizElendi")
        }
      >
        {bid.eliminationReason ? (
          <p>
            <span className="font-medium">{t("gerekce2")}</span> {systemText(bid.eliminationReason)}
          </p>
        ) : null}
        <p className="mt-1">{t("alimTalebiHenuzSonuclanmadi")}</p>
      </StatusAlert>,
    );
  } else if (bid.status === "LOST") {
    alerts.push(
      <StatusAlert
        key="lost"
        tone="info"
        title={
          !bid.eliminatedAt && l.status === "CLOSED_NO_AWARD"
            ? t("alimTalebiKazananSecilmedenKapandi")
            : t("satinAlmaTalebiSonuclandiTeklifiniz")
        }
      >
        {bid.eliminatedAt && bid.eliminationReason ? (
          <p>
            <span className="font-medium">{t("gerekce2")}</span> {systemText(bid.eliminationReason)}
          </p>
        ) : null}
      </StatusAlert>,
    );
  } else if (bid.status === "WITHDRAWN") {
    alerts.push(
      <StatusAlert key="wd" tone="info" title={t("teklifiniziGeriCektiniz")}>
        {bid.updatedAt ? <p>{formatDateTime(bid.updatedAt, locale)}</p> : null}
      </StatusAlert>,
    );
  } else if (bid.status === "DRAFT" && open && bid.submittedAt) {
    // Daha önce GÖNDERİLMİŞ ama taşımada taslağa düşmüş teklif (geçerlilik
    // dolumu ya da LAZY taşıma) — kullanıcı iki seçeneğini de bilsin.
    // Uzatma düğmesi teklif hakkı / KYC kapısıyla gizleniyorsa (BidSummaryCard
    // canExtend, O-071/O-072) metin uzatmayı önermez, nedenini söyler.
    alerts.push(
      <StatusAlert
        key="draft-carried"
        tone="warning"
        title={t("oncekiTeklifinizBuTuraTaslak")}
      >
        <p>
          {l.canBid === false
            ? t("taslakTasindiTeklifHakkiYok")
            : l.bidRequiresVerification
              ? t("taslakTasindiDogrulamaGerekir")
              : t("devamEtmekIcinYeniFiyat")}
        </p>
      </StatusAlert>,
    );
  } else if (bid.status === "DRAFT" && open) {
    // Davetsiz ∧ bağlantısız ∧ doğrulanmamış teklifçi taslağı GÖNDEREMEZ
    // (INV-KYC-1, API `bidRequiresVerification`) — "göndermeyi unutmayın"
    // yerine doğrulama şartı söylenir (yeniden doğrulama webC-01).
    alerts.push(
      <StatusAlert
        key="draft"
        tone="warning"
        title={
          l.bidRequiresVerification
            ? t("taslakTeklifinizVarDogrulamaGerekir")
            : t("taslakTeklifinizVarKapanistanOnce")
        }
      />,
    );
  } else if (bid.status === "DRAFT") {
    alerts.push(
      <StatusAlert
        key="draft-late"
        tone="info"
        title={t("satinAlmaTalebiKapandiTaslak")}
      />,
    );
  } else if (
    bid.status === "SUBMITTED" &&
    (l.status === "IN_AWARD" || l.status === "IN_AWARD_APPROVAL")
  ) {
    // Alıcının BİLİNÇLİ "Değerlendirmeye Al" sinyali — nötr kapanıştan farklı.
    alerts.push(
      <StatusAlert
        key="evaluating"
        tone="info"
        title={t("teklifinizDegerlendiriliyor")}
      >
        <p>
          {t("aliciTeklifleriDegerlendirmeyeAldiSonuc")}
        </p>
      </StatusAlert>,
    );
  } else if (bid.status === "SUBMITTED" && !open) {
    alerts.push(
      <StatusAlert
        key="closed"
        tone="info"
        title={t("teklifKabulAsamasiSonaErdi")}
      />,
    );
  } else if (bid.status === "SUBMITTED") {
    alerts.push(
      <StatusAlert key="ok" tone="success" title={t("teklifinizAlindi")}>
        {bid.submittedAt ? (
          <p>{t("verildi", { formatDateTime: formatDateTime(bid.submittedAt, locale) })}</p>
        ) : null}
      </StatusAlert>,
    );
  }

  return (
    <div className="space-y-4">
      {alerts}
      <BidSummaryCard l={l} />
    </div>
  );
}
