"use client";

import { useTranslations } from "next-intl";
import { useUnitLabel } from "@/i18n/domain";
import { formatDate } from "@/lib/format-date";
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
import { extractErrorMessage } from "@/lib/tenders/error";
import { formatDateTime } from "@/lib/tenders/date";
import { cn } from "@/lib/utils";
import { Trophy } from "lucide-react";
import { bidDeliveryTimeLabel } from "@rothern/shared";
import { Link } from "@/i18n/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { currencySymbol } from "@/lib/tenders/labels";

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

/** Teklif özeti kartı — statü / versiyon / toplam + geçerlilik + kalemler + not. */
export function BidSummaryCard({ l }: { l: ListingDetail }) {
  const t = useTranslations("web.panel.requests.myBidStatusPanel");
  const bid = l.myBid;
  const extend = useExtendBidValidity(l.id);
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendDays, setExtendDays] = useState("30");
  const { user } = useCompanyAuth();
  const unitLabel = useUnitLabel();
  if (!bid) return null;
  // Dalga B-2: elle sembol türetme kaldırıldı (USD "$" yerine "USD" gösteriyordu).
  const symbol = currencySymbol(bid.currency ?? "TRY");
  const itemName = new Map(
    (l.items ?? []).map((it) => [it.id, it] as const),
  );
  const badge = BID_STATUS_BADGE[bid.status] ?? BID_STATUS_BADGE.SUBMITTED;

  // Geçerlilik: son gün = submittedAt + validityDays. Süresi dolan teklif
  // fiyat değişmeden uzatılabilir; taşımada taslağa düşmüşse uzatma onu
  // aynı fiyatla yeniden canlıya döndürür.
  const validUntil =
    bid.submittedAt && bid.validityDays
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
  // tam da bu akışın amacı (extendBidValidity ile birebir). Rol kapısı da
  // birebir: teklif-yanı op-rol şart (Satışçı); SAHIP muafiyeti yok — Kurucu
  // talepte salt-gözlemci.
  const canExtend =
    (user?.roles ?? []).includes("SATISCI") &&
    validUntil != null &&
    (bid.status === "SUBMITTED" || bid.status === "DRAFT") &&
    (l.status === "OPEN"
      ? !l.closesAt || new Date(l.closesAt).getTime() > Date.now()
      : ["CLOSED", "IN_AWARD", "IN_AWARD_APPROVAL"].includes(l.status));

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

  const handleExtend = async () => {
    try {
      const res = await extend.mutateAsync(extendDaysNum);
      toast.success(
        res.revived
          ? t("gecerlilikUzatildiTeklifinizAyniFiyatla")
          : t("gecerlilikUzatildiTarihineKadar", { formatDateTime: formatDateTime(res.validUntil) }),
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
            {Number(bid.amount).toLocaleString("tr-TR")} {symbol}
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
                {t("tarihineKadar", { date: formatDate(validUntil, "short") })}
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
            ? t("teklifinizinGecerliligiTarihindeDoldu", { formatDate: formatDate(validUntil, "short") })
            : t("teklifinizTarihineKadarGecerli", { formatDate: formatDate(validUntil, "short") })}{" "}
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
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={extendDays}
                  onChange={(e) => setExtendDays(e.target.value)}
                  aria-label={t("ozelUzatmaSuresiGun")}
                  className="w-20 rounded-md border border-zinc-300 px-2 py-1.5 text-right text-sm"
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
                date: formatDate(newValidUntil, "short"),
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
            disabled={extend.isPending || !extendDaysValid || extendTooShort}
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
            // Teslim kolonu yalnız en az bir kalemde süre/tarih girildiyse.
            const hasDelivery = bid.items!.some(
              (bi) => bi.deliveryTime || bi.deliveryDate,
            );
            return (
              <Table dense>
                <TableHead>
                  <TableRow>
                    <TableHeader>{t("kalem")}</TableHeader>
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
                    return (
                      <TableRow key={bi.itemId}>
                        <TableCell className="whitespace-normal text-zinc-900">
                          {item?.name ?? t("kalem")}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap text-zinc-600 tabular-nums">
                          {item
                            ? `${Number(item.quantity).toLocaleString("tr-TR")} ${unitLabel(item.unit, item.unitCode)}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap text-zinc-600 tabular-nums">
                          {Number(bi.unitPrice).toLocaleString("tr-TR")}{" "}
                          {symbol}
                        </TableCell>
                        {hasDelivery ? (
                          <TableCell className="text-right whitespace-nowrap text-zinc-600 tabular-nums">
                            {bidDeliveryTimeLabel(bi.deliveryTime) ??
                              (bi.deliveryDate
                                ? formatDate(bi.deliveryDate, "short")
                                : "—")}
                          </TableCell>
                        ) : null}
                        <TableCell className="text-right font-medium whitespace-nowrap text-zinc-900 tabular-nums">
                          {item
                            ? `${(
                                Number(bi.unitPrice) * Number(item.quantity)
                              ).toLocaleString("tr-TR")} ${symbol}`
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
                      {Number(bid.amount).toLocaleString("tr-TR")} {symbol}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            );
          })()}
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
    const steps = [
      t("siparisOlusturulduOnayinBekleniyor"),
      t("onaylaTeslimEtVeFatura"),
      t("odemeyiSiparisSayfasindanIzle"),
    ];
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
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-emerald-800">
              {steps.map((st) => (
                <li key={st}>{st}</li>
              ))}
            </ol>
            <div className="mt-3">
              <Button href={ordersHref}>{ordersLabel}</Button>
            </div>
          </div>
        </div>
      </div>,
    );
  } else if (bid.status === "LOST" && open) {
    alerts.push(
      <StatusAlert key="lost-open" tone="warning" title={t("teklifinizBuTurdaElendi")}>
        {bid.eliminationReason ? (
          <p>
            <span className="font-medium">{t("gerekce2")}</span> {bid.eliminationReason}
          </p>
        ) : null}
        <p className="mt-1">
          {t("satinAlmaTalebiHalaAcik")}
        </p>
      </StatusAlert>,
    );
  } else if (bid.status === "LOST") {
    alerts.push(
      <StatusAlert key="lost" tone="info" title={t("satinAlmaTalebiSonuclandiTeklifiniz")} />,
    );
  } else if (bid.status === "WITHDRAWN") {
    alerts.push(
      <StatusAlert key="wd" tone="info" title={t("teklifiniziGeriCektiniz")}>
        {bid.updatedAt ? <p>{formatDateTime(bid.updatedAt)}</p> : null}
      </StatusAlert>,
    );
  } else if (bid.status === "DRAFT" && open && bid.submittedAt) {
    // Daha önce GÖNDERİLMİŞ ama taşımada taslağa düşmüş teklif (geçerlilik
    // dolumu ya da LAZY taşıma) — kullanıcı iki seçeneğini de bilsin.
    alerts.push(
      <StatusAlert
        key="draft-carried"
        tone="warning"
        title={t("oncekiTeklifinizBuTuraTaslak")}
      >
        <p>
          {t("devamEtmekIcinYeniFiyat")}
        </p>
      </StatusAlert>,
    );
  } else if (bid.status === "DRAFT" && open) {
    alerts.push(
      <StatusAlert
        key="draft"
        tone="warning"
        title={t("taslakTeklifinizVarKapanistanOnce")}
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
          <p>{t("verildi", { formatDateTime: formatDateTime(bid.submittedAt) })}</p>
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
