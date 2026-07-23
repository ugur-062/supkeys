"use client";

import { Badge } from "@/components/catalyst/badge";
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
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Trophy,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

type Tone = "success" | "info" | "warning" | "danger";

const TONE_CLASSES: Record<Tone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
};
const TONE_ICON: Record<Tone, typeof Info> = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  danger: XCircle,
};

function StatusAlert({
  tone,
  title,
  children,
}: {
  tone: Tone;
  title: string;
  children?: React.ReactNode;
}) {
  const Icon = TONE_ICON[tone];
  return (
    <div
      className={cn("flex items-start gap-3 rounded-xl border p-4", TONE_CLASSES[tone])}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{title}</p>
        {children ? <div className="mt-1">{children}</div> : null}
      </div>
    </div>
  );
}

const BID_STATUS_BADGE: Record<string, { label: string; color: "zinc" | "amber" | "violet" | "emerald" | "rose" }> = {
  DRAFT: { label: "Taslak", color: "amber" },
  SUBMITTED: { label: "Gönderildi", color: "violet" },
  WON: { label: "Kazandın", color: "emerald" },
  AWARDED_PARTIAL: { label: "Kısmen Kazandın", color: "emerald" },
  LOST: { label: "Kaybettin", color: "rose" },
  WITHDRAWN: { label: "Geri Çekildi", color: "zinc" },
};

/** Teklif özeti kartı — statü / versiyon / toplam + geçerlilik + kalemler + not. */
export function BidSummaryCard({ l }: { l: ListingDetail }) {
  const bid = l.myBid;
  const extend = useExtendBidValidity(l.id);
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendDays, setExtendDays] = useState("30");
  const { user } = useCompanyAuth();
  if (!bid) return null;
  const symbol = bid.currency === "TRY" || !bid.currency ? "₺" : bid.currency;
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
  // birebir: teklif-yanı op-rol şart (ALIM→Satışçı, SATIS→Satın Almacı);
  // SAHIP muafiyeti yok — Kurucu ihalede salt-gözlemci.
  const extendRole = l.type === "ALIM" ? "SATISCI" : "SATIN_ALMACI";
  const canExtend =
    (user?.roles ?? []).includes(extendRole) &&
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
          ? "Geçerlilik uzatıldı — teklifiniz aynı fiyatla yeniden aktif"
          : `Geçerlilik uzatıldı — ${formatDateTime(res.validUntil)} tarihine kadar`,
      );
      setExtendOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Geçerlilik uzatılamadı"));
    }
  };

  return (
    <div className="rounded-xl border border-zinc-950/10 bg-white p-5">
      {/* Versiyon hücresi kaldırıldı — tedarikçiye teknik gürültü
          (alıcı tarafındaki v2 rozeti duruyor: güncellendi bilgisi). */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
            Statü
          </p>
          <div className="mt-1">
            <Badge color={badge.color}>{badge.label}</Badge>
          </div>
        </div>
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
            Toplam
          </p>
          <p className="mt-1 text-sm font-bold text-zinc-950 tabular-nums">
            {Number(bid.amount).toLocaleString("tr-TR")} {symbol}
          </p>
        </div>
      </div>

      {validUntil ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3">
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
              Teklif Geçerliliği
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p
                className={cn(
                  "text-sm font-medium",
                  validityExpired ? "text-rose-600" : "text-zinc-900",
                )}
              >
                {validUntil.toLocaleDateString("tr-TR")} tarihine kadar
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
                {validityExpired ? "Süresi doldu" : `${daysLeft} gün kaldı`}
              </Badge>
            </div>
          </div>
          {canExtend ? (
            <Button outline onClick={() => setExtendOpen(true)}>
              Geçerliliği Uzat
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Geçerlilik uzatma — gün seçimli diyalog. Süre mevcut bitişin üzerine
          eklenir; süresi dolmuş/taslağa düşmüş teklif aynı fiyatla canlanır. */}
      <Dialog open={extendOpen} onClose={() => setExtendOpen(false)}>
        <DialogTitle>Teklif Geçerliliğini Uzat</DialogTitle>
        <DialogDescription>
          {validityExpired
            ? `Teklifinizin geçerliliği ${validUntil?.toLocaleDateString("tr-TR")} tarihinde doldu.`
            : `Teklifiniz ${validUntil?.toLocaleDateString("tr-TR")} tarihine kadar geçerli.`}{" "}
          Seçtiğiniz süre mevcut bitiş tarihine eklenir; fiyatınız değişmez.
        </DialogDescription>
        <DialogBody className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-zinc-700">
              Uzatma süresi
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
                  {d} gün
                </button>
              ))}
              <span className="flex items-center gap-1.5 text-sm text-zinc-500">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={extendDays}
                  onChange={(e) => setExtendDays(e.target.value)}
                  aria-label="Özel uzatma süresi (gün)"
                  className="w-20 rounded-md border border-zinc-300 px-2 py-1.5 text-right text-sm"
                />
                gün
              </span>
            </div>
          </div>
          {!extendDaysValid ? (
            <p className="text-sm text-rose-600">
              Uzatma süresi 1-365 gün arası tam sayı olmalı.
            </p>
          ) : extendTooShort ? (
            <p className="text-sm text-rose-600">
              Bu süre yetmiyor — son geçerlilik günü yine geçmişte kalıyor,
              daha uzun bir süre seçin.
            </p>
          ) : newValidUntil ? (
            <p className="text-sm text-zinc-700">
              Yeni bitiş:{" "}
              <span className="font-semibold text-zinc-950">
                {newValidUntil.toLocaleDateString("tr-TR")}
              </span>
            </p>
          ) : null}
          {(validityExpired || bid.status === "DRAFT") &&
          extendDaysValid &&
          !extendTooShort ? (
            <p className="text-sm text-emerald-700">
              Uzatınca teklifiniz aynı fiyatla yeniden aktif olur.
            </p>
          ) : null}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setExtendOpen(false)}>
            Vazgeç
          </Button>
          <Button
            disabled={extend.isPending || !extendDaysValid || extendTooShort}
            onClick={handleExtend}
          >
            Geçerliliği Uzat
          </Button>
        </DialogActions>
      </Dialog>

      {bid.items && bid.items.length > 0 ? (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="mb-2 text-xs font-medium text-zinc-500">
            Fiyatlandırılan Kalemler ({bid.items.length})
          </p>
          {(() => {
            // Teslim kolonu yalnız en az bir kalemde tarih girildiyse.
            const hasDelivery = bid.items!.some((bi) => bi.deliveryDate);
            return (
              <Table dense>
                <TableHead>
                  <TableRow>
                    <TableHeader>Kalem</TableHeader>
                    <TableHeader className="text-right">Miktar</TableHeader>
                    <TableHeader className="text-right">
                      Birim Fiyat
                    </TableHeader>
                    {hasDelivery ? (
                      <TableHeader className="text-right">Teslim</TableHeader>
                    ) : null}
                    <TableHeader className="text-right">
                      Satır Toplamı
                    </TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {bid.items!.map((bi) => {
                    const item = itemName.get(bi.itemId);
                    return (
                      <TableRow key={bi.itemId}>
                        <TableCell className="whitespace-normal text-zinc-900">
                          {item?.name ?? "Kalem"}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap text-zinc-600 tabular-nums">
                          {item
                            ? `${Number(item.quantity).toLocaleString("tr-TR")} ${item.unit}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap text-zinc-600 tabular-nums">
                          {Number(bi.unitPrice).toLocaleString("tr-TR")}{" "}
                          {symbol}
                        </TableCell>
                        {hasDelivery ? (
                          <TableCell className="text-right whitespace-nowrap text-zinc-600 tabular-nums">
                            {bi.deliveryDate
                              ? new Date(bi.deliveryDate).toLocaleDateString(
                                  "tr-TR",
                                )
                              : "—"}
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
                      Toplam
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
          <p className="mb-1 text-xs font-medium text-zinc-500">Genel Not</p>
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
  const bid = l.myBid;
  const open = l.status === "OPEN";
  // Kazanınca oluşan sipariş, teklifçinin kendi portalında listelenir:
  // ALIM ihalesinde teklifçi SATICI, SATIS ihalesinde ALICI'dır.
  const ordersHref =
    l.type === "SATIS"
      ? "/company/satinalma/siparisler"
      : "/company/satis/siparisler";
  const ordersLabel =
    l.type === "SATIS" ? "Siparişlerimi Görüntüle" : "Satışlarımı Görüntüle";

  if (!bid) {
    return open ? null : (
      <StatusAlert tone="info" title="Bu ihaleye teklif vermediniz." />
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
        title="İhale ilan sahibi tarafından iptal edildi."
      >
        {l.cancelReason ? <p>Gerekçe: {l.cancelReason}</p> : null}
      </StatusAlert>,
    );
  } else if (bid.status === "WON") {
    alerts.push(
      <StatusAlert key="won" tone="success" title="Tebrikler! Teklifiniz kazandı 🏆">
        <p className="flex items-center gap-1.5">
          <Trophy className="h-4 w-4" aria-hidden="true" />
          Sipariş oluşturuldu —{" "}
          <Link href={ordersHref} className="font-semibold underline">
            {ordersLabel}
          </Link>
        </p>
      </StatusAlert>,
    );
  } else if (bid.status === "AWARDED_PARTIAL") {
    alerts.push(
      <StatusAlert key="part" tone="success" title="Bazı kalemleri kazandınız">
        <Link href={ordersHref} className="font-semibold underline">
          {ordersLabel}
        </Link>
      </StatusAlert>,
    );
  } else if (bid.status === "LOST" && open) {
    alerts.push(
      <StatusAlert key="lost-open" tone="warning" title="Teklifiniz bu turda elendi">
        {bid.eliminationReason ? (
          <p>
            <span className="font-medium">Gerekçe:</span> {bid.eliminationReason}
          </p>
        ) : null}
        <p className="mt-1">
          İhale hâlâ açık — teklifinizi güncelleyip yeniden verebilirsiniz.
        </p>
      </StatusAlert>,
    );
  } else if (bid.status === "LOST") {
    alerts.push(
      <StatusAlert key="lost" tone="info" title="İhale sonuçlandı — teklifiniz kazanamadı." />,
    );
  } else if (bid.status === "WITHDRAWN") {
    alerts.push(
      <StatusAlert key="wd" tone="info" title="Teklifinizi geri çektiniz.">
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
        title="Önceki teklifiniz bu tura taslak olarak taşındı"
      >
        <p>
          Devam etmek için yeni fiyat verin ya da aşağıdan önceki teklifinizin
          geçerlilik süresini uzatın — uzatınca aynı fiyatla yeniden aktif olur.
        </p>
      </StatusAlert>,
    );
  } else if (bid.status === "DRAFT" && open) {
    alerts.push(
      <StatusAlert
        key="draft"
        tone="warning"
        title="Taslak teklifiniz var — kapanıştan önce göndermeyi unutmayın."
      />,
    );
  } else if (bid.status === "DRAFT") {
    alerts.push(
      <StatusAlert
        key="draft-late"
        tone="info"
        title="İhale kapandı — taslak teklifiniz gönderilmedi."
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
        title="Teklifiniz değerlendiriliyor"
      >
        <p>
          {l.type === "SATIS" ? "Satıcı" : "Alıcı"} teklifleri değerlendirmeye
          aldı — sonuç açıklandığında bilgilendirileceksiniz.
        </p>
      </StatusAlert>,
    );
  } else if (bid.status === "SUBMITTED" && !open) {
    alerts.push(
      <StatusAlert
        key="closed"
        tone="info"
        title="Teklif kabul aşaması sona erdi — sonuç açıklandığında bilgilendirileceksiniz."
      />,
    );
  } else if (bid.status === "SUBMITTED") {
    alerts.push(
      <StatusAlert key="ok" tone="success" title="Teklifiniz alındı.">
        {bid.submittedAt ? (
          <p>Verildi {formatDateTime(bid.submittedAt)}</p>
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
