"use client";

import { AuctionLiveCard } from "./_components/auction-live-card";
import { MyBidStatusPanel } from "./_components/my-bid-status-panel";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { CountdownFull } from "@/components/tenders/countdown-full";
import { FilesTab } from "@/components/tenders/files-tab";
import { GeneralInfoTab } from "@/components/tenders/general-info-tab";
import { ReasonDialog } from "@/components/tenders/reason-dialog";
import { LISTING_STATUS_LABELS } from "@/components/tenders/status-badge";
import { TenderActionsMenu } from "@/components/tenders/tender-actions-menu";
import { Heading, Subheading } from "@/components/catalyst/heading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { Text } from "@/components/catalyst/text";
import {
  useAwardByItem,
  useAwardListing,
  useEliminateBid,
  useListingDetail,
  usePublishListing,
  useWithdrawBid,
} from "@/hooks/use-company-listings";
import { useConfirm } from "@/components/providers/confirm-dialog";
import {
  useApprovalPreview,
  useCancelApproval,
} from "@/hooks/use-company-approvals";
import {
  BID_DOC_KIND_LABELS,
  useBidDocuments,
} from "@/hooks/use-bid-documents";
import { useCategoriesByIds } from "@/hooks/use-categories";
import { extractErrorMessage } from "@/lib/tenders/error";
import { formatDate, formatDateTime, formatTime } from "@/lib/tenders/date";
import { subscribeRealtime } from "@/lib/realtime";
import { CURRENCY_SYMBOL } from "@/lib/tenders/labels";
import { cn } from "@/lib/utils";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import {
  Building2,
  CalendarClock,
  Gavel,
  Globe,
  Info,
  Layers,
  Lock,
  MapPin,
  Paperclip,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const TRIGGER_CLASSES = cn(
  "group inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
  "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700",
  "data-selected:border-zinc-900 data-selected:text-zinc-950",
  "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900",
);

function TabBadge({ count }: { count: number }) {
  return (
    <span className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 group-data-selected:bg-zinc-900 group-data-selected:text-white">
      {count}
    </span>
  );
}

function MetaItem({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: typeof Layers;
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex min-w-0 items-center gap-2.5 bg-white p-4", className)}
    >
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

/** İlan durumu → Türkçe etiket + Catalyst rozet rengi. Ham enum kullanıcıya gösterilmez. */
const LISTING_STATUS_META: Record<
  string,
  { label: string; color: React.ComponentProps<typeof Badge>["color"] }
> = {
  DRAFT: { label: LISTING_STATUS_LABELS.DRAFT, color: "zinc" },
  IN_APPROVAL: { label: LISTING_STATUS_LABELS.IN_APPROVAL, color: "amber" },
  OPEN: { label: LISTING_STATUS_LABELS.OPEN, color: "green" },
  CLOSED: { label: LISTING_STATUS_LABELS.CLOSED, color: "amber" },
  IN_AWARD: { label: LISTING_STATUS_LABELS.IN_AWARD, color: "blue" },
  IN_AWARD_APPROVAL: {
    label: LISTING_STATUS_LABELS.IN_AWARD_APPROVAL,
    color: "amber",
  },
  AWARDED: { label: LISTING_STATUS_LABELS.AWARDED, color: "blue" },
  CLOSED_NO_AWARD: {
    label: LISTING_STATUS_LABELS.CLOSED_NO_AWARD,
    color: "zinc",
  },
  CANCELLED: { label: LISTING_STATUS_LABELS.CANCELLED, color: "red" },
};

export default function ListingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const searchParams = useSearchParams();
  // Yalnız iç /company yolları — open redirect / javascript: şeması engellenir.
  const rawFrom = searchParams.get("from");
  const fromHref =
    rawFrom && rawFrom.startsWith("/company") && !rawFrom.startsWith("//")
      ? rawFrom
      : null;
  const fromLabel = searchParams.get("fromLabel");
  const { data: l, isLoading, isError, refetch } = useListingDetail(id);
  const confirm = useConfirm();
  const award = useAwardListing(id);
  const withdrawBid = useWithdrawBid(id);
  const eliminate = useEliminateBid(id);
  const awardByItem = useAwardByItem(id);
  const publish = usePublishListing(id);
  const cancelApproval = useCancelApproval();
  const categories = useCategoriesByIds(l?.categoryIds ?? []);
  const bidDocs = useBidDocuments(id);
  const [itemAwardMode, setItemAwardMode] = useState(false);
  const [itemWinners, setItemWinners] = useState<Record<string, string>>({});
  const [itemQty, setItemQty] = useState<Record<string, string>>({});
  const [bidView, setBidView] = useState<"all" | "complete" | "incomplete">(
    "all",
  );
  const [eliminateTarget, setEliminateTarget] = useState<{
    bidId: string;
    bidderName: string;
  } | null>(null);
  // Onay akışı devredeyse yayın/kazandırma öncesi başlatıcı notu sorulur.
  const approvalPreview = useApprovalPreview(
    l?.type as "ALIM" | "SATIS" | undefined,
    !!l?.isOwner,
  );
  const [noteAction, setNoteAction] = useState<
    | { kind: "award"; bidId: string; bidderName: string }
    | {
        kind: "itemAward";
        itemAwards: { itemId: string; bidId: string; awardedQuantity?: number }[];
      }
    | null
  >(null);


  // WS: bu ilanın odasına abone ol — teklif/durum değişimi anında düşer.
  useEffect(() => subscribeRealtime("listing", id), [id]);


  const handleWithdraw = async () => {
    try {
      await withdrawBid.mutateAsync();
      toast.success("Teklifin geri çekildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Geri çekilemedi"));
    }
  };


  const handleAward = async (bidId: string, bidderName: string) => {
    // Onay akışı devreye girecekse: not girişli tek dialog (onaycılara iletilir).
    if (approvalPreview.data?.award) {
      setNoteAction({ kind: "award", bidId, bidderName });
      return;
    }
    if (
      !(await confirm({
        title: "Kazandır",
        description: `"${bidderName}" kazandırılsın mı? Sipariş oluşacak.`,
        confirmLabel: "Kazandır",
      }))
    )
      return;
    try {
      const res = await award.mutateAsync({ bidId });
      toast.success(
        res.pendingApproval
          ? "Kazandırma onaya gönderildi"
          : `Kazandırıldı — sipariş ${res.number} oluştu`,
      );
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kazandırılamadı"));
    }
  };

  /** Onay notu dialogu onaylandı — bekleyen aksiyonu notla birlikte uygula. */
  const submitNoteAction = async (note: string) => {
    if (!noteAction) return;
    const approvalNote = note.trim() || undefined;
    try {
      if (noteAction.kind === "award") {
        const res = await award.mutateAsync({
          bidId: noteAction.bidId,
          approvalNote,
        });
        toast.success(
          res.pendingApproval
            ? "Kazandırma onaya gönderildi"
            : `Kazandırıldı — sipariş ${res.number} oluştu`,
        );
      } else {
        const res = await awardByItem.mutateAsync({
          itemAwards: noteAction.itemAwards,
          approvalNote,
        });
        toast.success(
          res.pendingApproval
            ? "Kazandırma onaya gönderildi"
            : `Kazandırıldı — ${res.count} sipariş oluştu`,
        );
        setItemAwardMode(false);
      }
      setNoteAction(null);
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };

  const submitEliminate = async (reason: string) => {
    if (!eliminateTarget) return;
    try {
      await eliminate.mutateAsync({
        bidId: eliminateTarget.bidId,
        reason: reason.trim() || undefined,
      });
      toast.success("Teklif elendi");
      setEliminateTarget(null);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Elenemedi"));
    }
  };

  const handleCancelApproval = async () => {
    if (!l?.pendingApprovalId) return;
    if (
      !(await confirm({
        title: "Onay isteğini iptal et",
        description: "Onay isteği iptal edilsin mi? İlan eski durumuna döner.",
        confirmLabel: "İptal et",
        destructive: true,
      }))
    )
      return;
    try {
      await cancelApproval.mutateAsync(l.pendingApprovalId);
      toast.success("Onay isteği iptal edildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İptal edilemedi"));
    }
  };

  const handlePublish = async () => {
    // Yayın onayı kaldırıldı — taslak doğrudan yayınlanır.
    if (
      !(await confirm({
        title: "İhaleyi yayınla",
        description: `İhale yayınlansın mı? Yayınlandıktan sonra ${
          l?.type === "SATIS" ? "alıcılar" : "tedarikçiler"
        } görebilir.`,
        confirmLabel: "Yayınla",
      }))
    )
      return;
    try {
      await publish.mutateAsync(undefined);
      toast.success("İhale yayınlandı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Yayınlanamadı"));
    }
  };

  // Kalem-bazlı: bir kalem için fiyat veren teklifler (TRY normalize; ALIM'da
  // artan — en düşük önde/ön-seçili, SATIS'ta azalan — en yüksek önde).
  // Karşılaştırma TRY üzerinden; gösterim her teklifin kendi birimiyle.
  const bidsForItem = (itemId: string) =>
    (l?.bids ?? [])
      .filter((b) => b.status === "SUBMITTED")
      .map((b) => {
        const unit = Number(
          b.items?.find((x) => x.itemId === itemId)?.unitPrice ?? 0,
        );
        const rate = bidRate(b);
        return {
          bidId: b.id,
          bidderName: b.bidderName,
          price: unit,
          currency: b.currency,
          priceTry: rate != null ? unit * rate : null,
        };
      })
      .filter((o) => o.price > 0)
      // Kur'suz (null) satırlar kıyaslanamaz → listenin SONUNA (ön-seçilmez).
      .sort((a, b) =>
        l?.type === "SATIS"
          ? (b.priceTry ?? -1) - (a.priceTry ?? -1)
          : (a.priceTry ?? Number.MAX_SAFE_INTEGER) -
            (b.priceTry ?? Number.MAX_SAFE_INTEGER),
      );

  const startItemAward = () => {
    const winners: Record<string, string> = {};
    for (const it of l?.items ?? []) {
      const opts = bidsForItem(it.id);
      if (opts[0]) winners[it.id] = opts[0].bidId;
    }
    setItemWinners(winners);
    setItemAwardMode(true);
  };

  const handleAwardByItem = async () => {
    const items = l?.items ?? [];
    const itemAwards = items
      .map((it) => {
        const q = Number(itemQty[it.id]);
        return {
          itemId: it.id,
          bidId: itemWinners[it.id] ?? "",
          awardedQuantity: q > 0 ? q : undefined,
        };
      })
      .filter((a) => a.bidId);
    if (itemAwards.length === 0) {
      toast.error("En az bir kalem için kazanan seçin");
      return;
    }
    // Onay akışı devreye girecekse: not girişli dialog.
    if (approvalPreview.data?.award) {
      setNoteAction({ kind: "itemAward", itemAwards });
      return;
    }
    const skipped = items.length - itemAwards.length;
    if (
      !(await confirm({
        title: "Kalem-bazlı kazandır",
        description:
          skipped > 0
            ? `${itemAwards.length} kalem kazandırılacak, ${skipped} kalem (seçilmeyen/teklifsiz) atlanacak. Devam?`
            : "Kalem-bazlı kazandırılsın mı? Kazanan firma başına sipariş oluşur.",
        confirmLabel: "Kazandır",
      }))
    )
      return;
    try {
      const res = await awardByItem.mutateAsync({ itemAwards });
      toast.success(
        res.pendingApproval
          ? "Kazandırma onaya gönderildi"
          : `Kazandırıldı — ${res.count} sipariş oluştu`,
      );
      setItemAwardMode(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kazandırılamadı"));
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="h-8 w-1/3 animate-pulse rounded bg-zinc-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-zinc-100" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <Text className="text-sm text-red-700">İlan yüklenemedi.</Text>
        <Button outline className="mt-3" onClick={() => refetch()}>
          Tekrar dene
        </Button>
      </div>
    );
  }
  if (!l) {
    return (
      <div className="mx-auto max-w-3xl">
        <Text className="text-sm text-zinc-500">İlan bulunamadı.</Text>
      </div>
    );
  }

  const isAlim = l.type === "ALIM";
  // İhalenin para birimi sembolü (kalem/matris değerleri bununla gösterilir).
  const sym =
    CURRENCY_SYMBOL[(l.primaryCurrency as keyof typeof CURRENCY_SYMBOL) ?? "TRY"] ??
    "₺";
  const symFor = (cur?: string | null) =>
    CURRENCY_SYMBOL[(cur as keyof typeof CURRENCY_SYMBOL) ?? "TRY"] ?? sym;
  // Çok para birimli karşılaştırma TRY üzerinden yapılır. TRY teklifte tutar
  // zaten TRY; yabancı teklifte kur snapshot'ından TRY karşılığı kullanılır.
  // Gösterim ise her teklifin KENDİ para birimiyle yapılır.
  // Kur oranı: TRY→1; yabancı ve snapshot'lı→oran; yabancı ve SNAPSHOT'SIZ→null
  // (0 döndürmek bu teklifi "en ucuz" gösterip kalem-kazandırmada otomatik
  // ön-seçtiriyordu — karşılaştırma dışı bırakılır, "kur yok" işaretlenir).
  const bidRate = (b: {
    currency?: string;
    exchangeRateSnapshot?: string | null;
  }): number | null =>
    !b.currency || b.currency === "TRY"
      ? 1
      : b.exchangeRateSnapshot != null
        ? Number(b.exchangeRateSnapshot)
        : null;
  // TRY karşılığı: yabancı + kur'suz teklif karşılaştırılamaz → null.
  const amountTryOf = (b: {
    amount: string;
    currency?: string;
    amountTry?: string | null;
  }): number | null =>
    b.amountTry != null
      ? Number(b.amountTry)
      : !b.currency || b.currency === "TRY"
        ? Number(b.amount)
        : null;
  // Erken kapatınca (CLOSED) da kazandırma/eleme açık kalır.
  const canDecide = l.status === "OPEN" || l.status === "CLOSED";
  // Teklif verme / güncelleme / belge ekleme yalnızca ilan AÇIK iken.
  const biddingOpen = l.status === "OPEN";
  // Hemen-al mevcut mu: TOPLU'da ilan fiyatı, KALEM'de en az bir kalemde.
  // requireAllItems + hemen-al'sız kalem varsa Hemen Al kullanılamaz (backend
  // "tüm kalemlere teklif zorunlu" ile reddeder) — ölü uç butonu gösterme.
  const hasBuyNow =
    !isAlim &&
    (l.priceScope === "KALEM"
      ? (l.items ?? []).some((it) => it.buyNowUnitPrice != null) &&
        (!l.requireAllItems ||
          (l.items ?? []).every((it) => it.buyNowUnitPrice != null))
      : l.buyNowPrice != null);
  const directionHint = isAlim
    ? "Alım ilanı — en düşük teklif kazanır."
    : "Satış ilanı — en yüksek teklif kazanır.";

  // ───────────────────────── Bölümler (sekmelere yerleşir) ─────────────────

  const itemsSection =
    l.items && l.items.length > 0 ? (
      <section className="space-y-2">
        <Subheading>Kalemler ({l.items.length})</Subheading>
        <div className="rounded-2xl border border-zinc-950/5 bg-white px-2 shadow-sm [--gutter:--spacing(4)]">
          <Table dense>
            <TableHead>
              <TableRow>
                <TableHeader>#</TableHeader>
                <TableHeader>Kalem</TableHeader>
                <TableHeader className="text-right">Miktar</TableHeader>
                <TableHeader className="text-right">
                  {isAlim ? "Hedef Fiyat" : "İstenen Fiyat"}
                </TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {l.items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="text-zinc-400">{it.lineNo}</TableCell>
                  <TableCell>
                    <div className="font-medium text-zinc-900">{it.name}</div>
                    {it.materialCode ? (
                      <div className="font-mono text-xs text-zinc-500">
                        {it.materialCode}
                      </div>
                    ) : null}
                    {it.description ? (
                      <div className="text-xs text-zinc-500">{it.description}</div>
                    ) : null}
                    {it.questions && it.questions.length > 0 ? (
                      <div className="mt-1 inline-flex">
                        <Badge
                          color="zinc"
                          title={it.questions.map((q) => `• ${q.text}`).join("\n")}
                        >
                          {it.questions.length} soru
                        </Badge>
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-zinc-700">
                    {Number(it.quantity).toLocaleString("tr-TR")} {it.unit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-zinc-700">
                    {it.targetPrice
                      ? `${Number(it.targetPrice).toLocaleString("tr-TR")} ${sym}`
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    ) : null;

  const invitationsSection =
    l.isOwner && l.invitations && l.invitations.length > 0 ? (
      <section className="space-y-2">
        <Subheading>
          Davetli {isAlim ? "Tedarikçiler" : "Alıcılar"} ({l.invitations.length})
        </Subheading>
        <div className="flex flex-wrap gap-2">
          {l.invitations.map((iv) => (
            <span
              key={iv.supkeysId ?? iv.companyName}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
            >
              {iv.companyName}{" "}
              <span className="font-mono text-xs text-zinc-500">
                {iv.supkeysId}
              </span>
            </span>
          ))}
        </div>
      </section>
    ) : null;

  // Teklif istatistikleri (eski sistemdeki KPI'lar).
  const bidItemCount = l.items?.length ?? 0;
  const allBids = l.bids ?? [];
  const invitedCount = l.invitations?.length ?? 0;
  // "Teklif Veren" = değerlendirmede olan (SUBMITTED) teklifler; elenen/kazanan
  // aktif sayaçları şişirmesin.
  const activeBids = allBids.filter((b) => b.status === "SUBMITTED");
  const submittedCount = activeBids.length;
  const completeCount = activeBids.filter(
    (b) =>
      bidItemCount > 0 &&
      (b.items?.filter((x) => Number(x.unitPrice) > 0).length ?? 0) >=
        bidItemCount,
  ).length;
  const incompleteCount = Math.max(0, submittedCount - completeCount);
  // Kalem karşılaştırma için fiyat haritaları (bidId → itemId → fiyat). Hücre
  // başına .find yerine tek seferde kurup O(1) erişim (matris perf).
  //  - priceMap: teklifin KENDİ birimindeki birim fiyat (gösterim).
  //  - priceTryMap: TRY karşılığı (satır içi min karşılaştırması — çok birim).
  const priceMap = new Map<string, Map<string, number>>();
  const priceTryMap = new Map<string, Map<string, number>>();
  const bidCurrencyById = new Map<string, string | undefined>();
  for (const b of allBids) {
    const rate = bidRate(b);
    const inner = new Map<string, number>();
    const innerTry = new Map<string, number>();
    for (const bi of b.items ?? []) {
      const unit = Number(bi.unitPrice);
      inner.set(bi.itemId, unit);
      if (rate != null) innerTry.set(bi.itemId, unit * rate);
    }
    priceMap.set(b.id, inner);
    priceTryMap.set(b.id, innerTry);
    bidCurrencyById.set(b.id, b.currency);
  }
  // Gerçek en iyi (uygun) teklif: yalnız SUBMITTED arasında ALIM→en düşük,
  // SATIS→en yüksek; karşılaştırma TRY karşılığı üzerinden (çok para birimi).
  // "En iyi" rozeti filtre/sıraya değil buna bağlanır.
  const bestBidId = (() => {
    const subs = allBids.filter(
      (b) => b.status === "SUBMITTED" && amountTryOf(b) != null,
    );
    if (subs.length === 0) return null;
    const sorted = [...subs].sort((a, b) =>
      isAlim
        ? amountTryOf(a)! - amountTryOf(b)!
        : amountTryOf(b)! - amountTryOf(a)!,
    );
    return sorted[0]?.id ?? null;
  })();

  const ownerBidsSection = (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Subheading>Gelen Teklifler ({l.bids?.length ?? 0})</Subheading>
          {l.english?.isEnglishAuction ? (
            <Badge color="amber">Tur {l.english.currentRound}</Badge>
          ) : null}
        </div>
      </div>

      {/* Durum bandı (eski sistemle aynı) */}
      {l.status === "OPEN" ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Yayında — yeni teklifler geldikçe sayfa otomatik güncellenir.
        </div>
      ) : l.status === "IN_AWARD" || l.status === "CLOSED" ? (
        <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm text-purple-800">
          Kazandırma aşaması — {submittedCount} teklif değerlendirilmeyi bekliyor.
        </div>
      ) : l.status === "AWARDED" ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          İhale kazandırıldı — siparişler oluşturuldu (Siparişler'de görünür).
        </div>
      ) : l.status === "CLOSED_NO_AWARD" ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-700">
          Kazanan olmadan kapatıldı.
          {l.cancelReason ? ` Sebep: ${l.cancelReason}` : ""}
        </div>
      ) : null}

      {/* KPI kartları */}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Davet Edilen", value: invitedCount },
          { label: "Teklif Veren", value: submittedCount },
          { label: "Tamamına", value: completeCount },
          { label: "Eksik Veren", value: incompleteCount },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-zinc-950/5 bg-white p-3"
          >
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              {k.label}
            </dt>
            <dd className="mt-0.5 text-lg font-bold text-zinc-900">
              {k.value}
            </dd>
          </div>
        ))}
      </dl>
      {l.items &&
      l.items.length > 0 &&
      l.bids &&
      l.bids.some((b) => b.items && b.items.length > 0) ? (
        <div className="space-y-2">
          <Subheading>Kalem Karşılaştırma</Subheading>
          <div className="overflow-x-auto rounded-2xl border border-zinc-950/5 bg-white px-2 shadow-sm [--gutter:--spacing(4)]">
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader>Kalem</TableHeader>
                  {l.bids.map((b) => (
                    <TableHeader key={b.id} className="text-right">
                      {b.bidderName}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {l.items.map((it) => {
                  const cells = (l.bids ?? []).map((b) => {
                    const v = priceMap.get(b.id)?.get(it.id);
                    const vTry = priceTryMap.get(b.id)?.get(it.id);
                    return {
                      price: v != null ? v : null,
                      priceTry: vTry != null ? vTry : null,
                      currency: bidCurrencyById.get(b.id),
                    };
                  });
                  // En iyi TRY karşılığı vurgulanır (birimler arası adil):
                  // ALIM'da en düşük, SATIS'ta en yüksek.
                  const validTry = cells
                    .map((c) => c.priceTry)
                    .filter((p): p is number => p != null && p > 0);
                  const minTry = validTry.length
                    ? isAlim
                      ? Math.min(...validTry)
                      : Math.max(...validTry)
                    : null;
                  return (
                    <TableRow key={it.id}>
                      <TableCell className="whitespace-nowrap text-zinc-900">
                        {it.name}{" "}
                        <span className="text-xs text-zinc-400">
                          ({Number(it.quantity).toLocaleString("tr-TR")} {it.unit})
                        </span>
                      </TableCell>
                      {cells.map((c, bi) => (
                        <TableCell
                          key={bi}
                          className={`whitespace-nowrap text-right font-mono tabular-nums ${
                            c.priceTry != null && c.priceTry === minTry
                              ? "font-semibold text-emerald-700"
                              : "text-zinc-600"
                          }`}
                        >
                          {c.price != null
                            ? `${c.price.toLocaleString("tr-TR")} ${symFor(c.currency)}`
                            : "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      {canDecide &&
      l.items &&
      l.items.length > 0 &&
      l.bids &&
      l.bids.some((b) => b.items && b.items.length > 0) ? (
        itemAwardMode ? (
          <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
            <Subheading>Kalem-bazlı Kazandırma</Subheading>
            <Text className="text-xs text-zinc-500">
              Her kalem için kazanan teklifi seç. Kazanan firma başına ayrı sipariş
              oluşur.
            </Text>
            <div className="space-y-2">
              {l.items.map((it) => {
                const opts = bidsForItem(it.id);
                return (
                  <div
                    key={it.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-sm text-zinc-900">
                      {it.name}
                      <span className="ml-1 text-xs text-zinc-400">
                        ({Number(it.quantity).toLocaleString("tr-TR")} {it.unit})
                      </span>
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        step="0.001"
                        placeholder="Miktar"
                        aria-label={`${it.name} için kazandırılacak miktar (boş = tam)`}
                        title="Kısmi miktar (boş = tam)"
                        value={itemQty[it.id] ?? ""}
                        onChange={(e) =>
                          setItemQty((q) => ({ ...q, [it.id]: e.target.value }))
                        }
                        className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-right text-sm"
                      />
                      <select
                        value={itemWinners[it.id] ?? ""}
                        aria-label={`${it.name} için kazanan teklif`}
                        onChange={(e) =>
                          setItemWinners((w) => ({ ...w, [it.id]: e.target.value }))
                        }
                        className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
                      >
                        <option value="">— seç —</option>
                        {opts.map((o) => (
                          <option key={o.bidId} value={o.bidId}>
                            {o.bidderName} · {o.price.toLocaleString("tr-TR")}{" "}
                            {symFor(o.currency)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <Button plain onClick={() => setItemAwardMode(false)}>
                Vazgeç
              </Button>
              <Button onClick={handleAwardByItem} disabled={awardByItem.isPending}>
                Onayla & Kazandır
              </Button>
            </div>
          </div>
        ) : (
          <Button outline onClick={startItemAward}>
            Kalem-bazlı Kazandır
          </Button>
        )
      ) : null}

      {!l.bids || l.bids.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-8 text-center">
          <Text className="text-sm text-zinc-500">Henüz teklif yok.</Text>
        </div>
      ) : (
        <div className="space-y-2">
          {/* İhale bazlı sıralama — Tümü / Tamamına / Eksik */}
          <div className="flex items-center gap-1 text-xs">
            {(
              [
                ["all", `Tümü (${submittedCount})`],
                ["complete", `Tamamına (${completeCount})`],
                ["incomplete", `Eksik (${incompleteCount})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={bidView === key}
                onClick={() => setBidView(key)}
                className={`rounded-full px-3 py-1 font-medium ${
                  bidView === key
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {l.bids
            .filter((b) => {
              const covered =
                bidItemCount > 0 &&
                (b.items?.filter((x) => Number(x.unitPrice) > 0).length ?? 0) >=
                  bidItemCount;
              if (bidView === "complete") return covered;
              if (bidView === "incomplete") return !covered;
              return true;
            })
            .map((b) => (
            <div
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-zinc-950/10 bg-white px-4 py-3"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                {b.id === bestBidId && canDecide ? (
                  <Badge color="green">En iyi</Badge>
                ) : null}
                {b.status === "WON" ? <Badge color="green">Kazandı</Badge> : null}
                {b.status === "AWARDED_PARTIAL" ? (
                  <Badge color="green">Kısmen Kazandı</Badge>
                ) : null}
                {b.status === "LOST" ? <Badge color="zinc">Elendi</Badge> : null}
                {b.isBuyNow ? <Badge color="emerald">Hemen-Al</Badge> : null}
                <Link
                  href={`/company/ilan/${l.id}/teklif/${b.id}`}
                  className="text-sm font-medium text-zinc-900 hover:text-blue-600 hover:underline"
                >
                  {b.bidderName}
                </Link>
                {l.english?.isEnglishAuction && b.round ? (
                  <Badge color="zinc">Tur {b.round}</Badge>
                ) : null}
                {b.version && b.version > 1 ? (
                  <Badge color="zinc">v{b.version}</Badge>
                ) : null}
                {(bidDocs.data ?? [])
                  .filter((d) => d.bidId === b.id)
                  .map((d) => (
                    <a
                      key={d.id}
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      title={`${BID_DOC_KIND_LABELS[d.kind]}: ${d.fileName}`}
                      className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-blue-600 hover:underline"
                    >
                      <span aria-hidden="true">📎</span>{" "}
                      {BID_DOC_KIND_LABELS[d.kind]} —{" "}
                      {d.fileName.length > 16
                        ? `${d.fileName.slice(0, 14)}…`
                        : d.fileName}
                    </a>
                  ))}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-sm font-semibold text-zinc-900">
                  {Number(b.amount).toLocaleString("tr-TR")}{" "}
                  {b.currency && b.currency !== "TRY" ? b.currency : "₺"}
                  {b.currency && b.currency !== "TRY" && b.amountTry ? (
                    <span className="ml-1 text-xs font-normal text-zinc-400">
                      ≈ {Number(b.amountTry).toLocaleString("tr-TR")} ₺
                      {b.exchangeRateSnapshot
                        ? ` (kur: ${b.exchangeRateSnapshot})`
                        : ""}
                    </span>
                  ) : null}
                </span>
                {b.bidderCompanyId ? (
                  <Link
                    href={`/company/${isAlim ? "satinalma" : "satis"}/mesajlar?with=${b.bidderCompanyId}`}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    Mesaj
                  </Link>
                ) : null}
                {canDecide && b.status === "SUBMITTED" ? (
                  <>
                    <Button
                      plain
                      onClick={() =>
                        setEliminateTarget({
                          bidId: b.id,
                          bidderName: b.bidderName,
                        })
                      }
                      disabled={eliminate.isPending}
                    >
                      Ele
                    </Button>
                    <Button
                      onClick={() => handleAward(b.id, b.bidderName)}
                      disabled={award.isPending}
                    >
                      Kazandır
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
          <Text className="text-xs text-zinc-400">
            Kazandırınca sipariş oluşur (Siparişler'de görünür).
          </Text>
        </div>
      )}
    </section>
  );

  // Teklif belgeleri — SALT-OKUNUR liste. Belge ekleme/silme teklif formunda
  // (/teklif-ver) yapılır; gönderilmiş teklife sonradan belge eklenmez.
  const myDocs = (bidDocs.data ?? []).filter((d) => d.mine);
  const bidDocsSection =
    l.myBid && myDocs.length > 0 ? (
      <div className="space-y-2 border-t border-zinc-100 pt-3">
        <div className="text-sm font-medium text-zinc-900">
          Teklif Belgeleri ({myDocs.length})
        </div>
        <div className="space-y-1">
          {myDocs.map((d) => (
            <a
              key={d.id}
              href={d.url}
              target="_blank"
              rel="noreferrer"
              className="block truncate rounded-md bg-zinc-50 px-2.5 py-1.5 text-xs text-blue-600 hover:underline"
            >
              {d.fileName}
            </a>
          ))}
        </div>
      </div>
    ) : null;

  // ALIM Teklifim sekmesi aksiyonları — form ayrı sayfada (/teklif-ver),
  // burada duruma göre CTA + geri çekme + belgeler (eski panel paritesi).
  const bidHref = `/company/ilan/${l.id}/teklif-ver`;
  const bidCta = (() => {
    // Rol yoksa CTA gösterme — form zaten rol kapısıyla engelliyor.
    if (!biddingOpen || !l.canBid || l.roleAllowsBid === false) return null;
    const st = l.myBid?.status;
    if (!l.myBid)
      return { label: "Teklif Ver", href: bidHref };
    if (st === "DRAFT")
      return { label: "Taslağa Devam Et", href: bidHref };
    if (st === "LOST")
      return { label: "Yeniden Teklif Ver", href: bidHref };
    if (st === "SUBMITTED" && l.english?.isEnglishAuction)
      return {
        label: isAlim
          ? "Yeni Teklif Ver (Fiyat Düşür)"
          : "Yeni Teklif Ver (Fiyat Artır)",
        href: bidHref,
      };
    return null; // SUBMITTED RFQ (değişiklik yok) / WITHDRAWN
  })();

  const sellerBidSection = (
    <section className="space-y-3">
      {!l.canBid ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <Text className="text-sm text-amber-800">
            Bu ilana teklif vermek için <strong>premium üyelik</strong> gerekir
            (veya ilanı açan firmayla bağlantı kur).
          </Text>
          <Button href="/company/premium" className="shrink-0">
            Premium&apos;a Geç
          </Button>
        </div>
      ) : l.roleAllowsBid === false ? (
        // Rol kapısı: sessiz buton yokluğu yerine açık yönlendirme.
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <Text className="text-sm text-amber-800">
            {isAlim
              ? "Bu alım ihalesine teklif (satış) vermek için hesabınızda "
              : "Bu satış ilanına teklif (alım) vermek için hesabınızda "}
            <strong>{isAlim ? "Satışçı" : "Satın Almacı"}</strong> rolü gerekir
            — firma yöneticiniz Ayarlar → Kullanıcılar&apos;dan verebilir.
          </Text>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-zinc-950/10 bg-white p-5">
          {/* SATIS + hemen-al: detaylar (teslim/geçerlilik/belge) teklif
              ekranında girilir — buton oraya yönlendirir. Gönderilmiş
              Hemen-Al varken tekrar gösterilmez. */}
          {!isAlim && biddingOpen && hasBuyNow ? (
            l.myBid?.status === "SUBMITTED" && l.myBid.isBuyNow ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                ✓ Hemen-Al teklifin gönderildi (
                {Number(l.myBid.amount).toLocaleString("tr-TR")} {sym}) —
                satıcı onayı bekleniyor.
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-emerald-900">
                    {l.priceScope === "KALEM"
                      ? "Hemen Al — kalem bazlı fiyatlarla"
                      : `Hemen Al — ${Number(l.buyNowPrice).toLocaleString("tr-TR")} ${sym}`}
                  </div>
                  <div className="text-xs text-emerald-700">
                    Hemen-al fiyatından teklif ver; teslim ve diğer detayları
                    sonraki ekranda gireceksin. Satıcı yine de onaylar.
                  </div>
                </div>
                <Button
                  color="emerald"
                  href={`/company/ilan/${l.id}/teklif-ver?hemenAl=1`}
                >
                  Hemen Al
                </Button>
              </div>
            )
          ) : null}
          {bidCta ? (
            <div className="flex items-center justify-between gap-3">
              <Text className="text-sm text-zinc-600">
                {l.myBid?.status === "SUBMITTED"
                  ? isAlim
                    ? "Açık eksiltme — fiyatını düşürerek yeni teklif verebilirsin."
                    : "Açık artırma — fiyatını artırarak yeni teklif verebilirsin."
                  : l.myBid?.status === "LOST"
                    ? "İhale hâlâ açık — güncellenmiş teklifle yeniden katıl."
                    : l.myBid?.status === "DRAFT"
                      ? "Taslağın kapanıştan önce gönderilmeli."
                      : "Bu ihaleye teklif verebilirsin."}
              </Text>
              <Button href={bidCta.href}>{bidCta.label}</Button>
            </div>
          ) : null}
          {l.myBid?.status === "SUBMITTED" &&
          biddingOpen &&
          !l.english?.isEnglishAuction ? (
            <Text className="text-xs text-zinc-500">
              Gönderilmiş teklif düzenlenemez — değişiklik için{" "}
              {isAlim ? "alıcıyla" : "satıcıyla"} iletişime geç ya da teklifini
              geri çek.
            </Text>
          ) : null}
          {l.myBid && biddingOpen && l.myBid.status === "SUBMITTED" ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2">
              <Text className="text-sm">
                Mevcut teklifin:{" "}
                <strong>
                  {Number(l.myBid.amount).toLocaleString("tr-TR")}{" "}
                  {!l.myBid.currency || l.myBid.currency === "TRY"
                    ? "₺"
                    : l.myBid.currency}
                </strong>
              </Text>
              <Button
                plain
                onClick={handleWithdraw}
                disabled={withdrawBid.isPending}
              >
                Geri Çek
              </Button>
            </div>
          ) : null}
          <Text className="text-xs text-zinc-400">
            {l.english?.isEnglishAuction
              ? isAlim
                ? "Açık eksiltme: teklifin güncel en düşüğün altında olmalı."
                : "Açık artırma: teklifin güncel en yükseğin üzerinde olmalı."
              : "Kapalı zarf: diğer tekliflerin tutarını göremezsin."}
          </Text>
          {bidDocsSection}
        </div>
      )}
    </section>
  );

  const statusMeta = LISTING_STATUS_META[l.status] ?? {
    label: l.status,
    color: "zinc" as const,
  };

  const header = (
    <div className="space-y-3">
      {/* Üst satır: numara (eyebrow) + durum */}
      <div className="flex flex-wrap items-center gap-2">
        {l.number ? (
          <span className="font-mono text-xs font-medium tracking-wide text-zinc-400">
            {l.number}
          </span>
        ) : null}
        <Badge color={statusMeta.color}>{statusMeta.label}</Badge>
      </div>

      <Heading>{l.title}</Heading>

      {/* Tanım rozetleri — emojisiz, anlamsal renkler */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge color={isAlim ? "blue" : "emerald"}>
          {isAlim ? "Alım" : "Satış"}
        </Badge>
        <Badge color="zinc">
          {l.isInternational ? (
            <Globe className="size-3.5" />
          ) : (
            <MapPin className="size-3.5" />
          )}
          {l.isInternational ? "Uluslararası" : "Yurtiçi"}
        </Badge>
        {l.format ? (
          <Badge color="purple">
            {l.format === "RFQ"
              ? "RFQ"
              : isAlim
                ? "İngiliz Usulü Eksiltme"
                : "İngiliz Usulü Artırma"}
          </Badge>
        ) : null}
      </div>

      {/* Anahtar kelimeler */}
      {l.keywords && l.keywords.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-zinc-400">Anahtar Kelimeler:</span>
          {l.keywords.map((kw) => (
            <Badge key={kw} color="zinc">
              {kw}
            </Badge>
          ))}
        </div>
      ) : null}

      {/* Sahip + yön ipucu */}
      <Text className="text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-zinc-700">
          {l.owner ? (
            <Building2 className="size-4 text-zinc-400" />
          ) : (
            <Lock className="size-4 text-zinc-400" />
          )}
          {l.owner ? l.owner.name : "Gizli firma"}
        </span>
        <span className="mx-2 text-zinc-300">·</span>
        {directionHint}
      </Text>

      {!isAlim && l.minPrice ? (
        <Text className="text-sm text-zinc-600">
          Taban:{" "}
          <strong>
            {Number(l.minPrice).toLocaleString("tr-TR")} {sym}
          </strong>
          {l.buyNowPrice
            ? ` · Hemen-Al: ${Number(l.buyNowPrice).toLocaleString("tr-TR")} ${sym}`
            : ""}
        </Text>
      ) : null}
      {l.description ? (
        <Text className="whitespace-pre-wrap text-sm text-zinc-600">
          {l.description}
        </Text>
      ) : null}
    </div>
  );

  // Varsayılan geri hedefi bağlama göre: sahip kendi listesine, teklifçi
  // ilanı gördüğü listeye döner (?from= her zaman öncelikli).
  const defaultBack = l.isOwner
    ? isAlim
      ? { href: "/company/satinalma/ihalelerim", label: "İhalelerim" }
      : { href: "/company/satis/ilanlarim", label: "Satış İlanlarım" }
    : isAlim
      ? { href: "/company/satis/acik-ihaleler", label: "Açık İhaleler" }
      : { href: "/company/satinalma/satin-al", label: "Satın Al" };
  const breadcrumb = (
    <Link
      href={fromHref ?? defaultBack.href}
      className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
    >
      <ArrowLeftIcon className="h-4 w-4" />
      {fromHref ? (fromLabel ?? "Firma profili") : defaultBack.label}
    </Link>
  );

  // ───────────── SAHİP: sekmeli ihale detayı (ALIM + SATIS) ─────────────
  if (l.isOwner) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        {breadcrumb}
        <div className="rounded-2xl border border-zinc-950/5 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">{header}</div>
            <div className="flex shrink-0 items-center gap-2">
              {l.canPublish ? (
                <Button onClick={handlePublish} disabled={publish.isPending}>
                  Yayınla
                </Button>
              ) : null}
              {l.pendingApprovalId ? (
                <Button
                  outline
                  onClick={handleCancelApproval}
                  disabled={cancelApproval.isPending}
                >
                  Onayı İptal Et
                </Button>
              ) : null}
            </div>
          </div>
          {/* İşlemler — görünür buton çubuğu (kutu içinde) */}
          <div className="mt-4 border-t border-zinc-950/5 pt-4">
            <TenderActionsMenu
              id={l.id}
              status={l.status}
              format={l.format}
              closesAt={l.closesAt}
              internalNotes={l.internalNotes ?? null}
              canEdit={l.canEdit}
              listingType={isAlim ? "ALIM" : "SATIS"}
              currency={l.primaryCurrency}
            />
          </div>
        </div>

        {/* Onay bekliyor bandı */}
        {l.status === "IN_APPROVAL" || l.status === "IN_AWARD_APPROVAL" ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {l.status === "IN_APPROVAL"
                ? "Onay bekliyor — yayın askıda. Onaylandığında ihale otomatik yayınlanır."
                : "Kazandırma onayı bekliyor. Onaylandığında kazandırma tamamlanır."}
            </p>
          </div>
        ) : null}

        {/* İptal sebebi bandı */}
        {(l.status === "CANCELLED" || l.status === "CLOSED_NO_AWARD") &&
        l.cancelReason ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span className="font-semibold">
              {l.status === "CANCELLED" ? "İptal sebebi" : "Kapatma sebebi"}:
            </span>{" "}
            {l.cancelReason}
          </div>
        ) : null}

        {/* Meta bar — bölünmüş istatistik şeridi */}
        <section>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-zinc-950/5 bg-zinc-950/[0.06] lg:grid-cols-5">
            <MetaItem
              icon={Layers}
              label="Kalem"
              value={`${l.items?.length ?? 0} kalem`}
            />
            <MetaItem
              icon={Wallet}
              label="Para Birimi"
              value={l.primaryCurrency ?? "TRY"}
            />
            <MetaItem
              icon={CalendarClock}
              label="Kapanış"
              value={
                l.closesAt ? (
                  <>
                    <span className="block leading-tight">
                      {formatDate(l.closesAt)}
                    </span>
                    <span className="block text-xs font-medium leading-tight text-zinc-500">
                      {formatTime(l.closesAt)}
                    </span>
                  </>
                ) : (
                  "—"
                )
              }
            />
            <MetaItem
              icon={Users}
              label="Davetli"
              value={`${l.invitations?.length ?? 0} ${isAlim ? "tedarikçi" : "alıcı"}`}
            />
            <MetaItem
              icon={Gavel}
              label="Teklif"
              value={`${l.bids?.length ?? 0}`}
              className="col-span-2 lg:col-span-1"
            />
          </dl>
        </section>

        <TabGroup defaultIndex={0} className="space-y-5">
          <TabList
            className="flex flex-wrap border-b border-zinc-950/10"
            aria-label="İhale detay sekmeleri"
          >
            <Tab className={TRIGGER_CLASSES}>
              <Gavel className="h-4 w-4" />
              Teklifler
              <TabBadge count={l.bids?.length ?? 0} />
            </Tab>
            <Tab className={TRIGGER_CLASSES}>
              <Info className="h-4 w-4" />
              Genel Bilgi
            </Tab>
            <Tab className={TRIGGER_CLASSES}>
              <Layers className="h-4 w-4" />
              Kalemler
              <TabBadge count={l.items?.length ?? 0} />
            </Tab>
            <Tab className={TRIGGER_CLASSES}>
              <Paperclip className="h-4 w-4" />
              Dosyalar
            </Tab>
          </TabList>

          <TabPanels>
            <TabPanel className="outline-none">{ownerBidsSection}</TabPanel>
            <TabPanel className="space-y-5 outline-none">
              <GeneralInfoTab l={l} />
              {invitationsSection}
            </TabPanel>
            <TabPanel className="outline-none">{itemsSection}</TabPanel>
            <TabPanel className="outline-none">
              <FilesTab
                listingId={l.id}
                isOwner={!!l.isOwner}
                canEdit={false}
              />
            </TabPanel>
          </TabPanels>
        </TabGroup>

        <ReasonDialog
          open={!!eliminateTarget}
          onClose={() => setEliminateTarget(null)}
          onSubmit={submitEliminate}
          title="Teklifi ele"
          description={
            eliminateTarget
              ? `"${eliminateTarget.bidderName}" elensin mi? Yeniden teklif verebilir. Yazdığınız gerekçe ${isAlim ? "tedarikçiye" : "alıcıya"} GÖSTERİLİR.`
              : undefined
          }
          confirmLabel="Ele"
          destructive
          pending={eliminate.isPending}
        />

        {/* Onay akışı devrede — başlatıcı notu (onaycılara iletilir, opsiyonel) */}
        <ReasonDialog
          open={!!noteAction}
          onClose={() => setNoteAction(null)}
          onSubmit={submitNoteAction}
          title="Kazandırmayı onaya gönder"
          description={
            noteAction?.kind === "award"
              ? `"${noteAction.bidderName}" kazandırılacak — onay akışı tanımlı, sipariş onay tamamlanınca oluşur. Notunuz onaycılara iletilir.`
              : "Kalem-bazlı kazandırma onaya gönderilecek — siparişler onay tamamlanınca oluşur. Notunuz onaycılara iletilir."
          }
          confirmLabel="Onaya Gönder"
          pending={award.isPending || awardByItem.isPending}
        />
      </div>
    );
  }

  // ───────────── SAHİP DEĞİL: sekmeli teklifçi görünümü (ALIM + SATIS) ─────
  // Eski tedarikçi paneli paritesi: başlık kartı (geri sayım) + canlı
  // eksiltme/artırma kartı + meta şeridi + Teklifim/Kalemler/Genel
  // Bilgi/Dosyalar sekmeleri. ALIM'da teklifçi satıcıdır, SATIS'ta alıcıdır.
  // Kapalı zarf: davetliler/teklifler sekmesi YOK — yalnızca kendi teklifi.
  {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        {breadcrumb}

        <div className="rounded-2xl border border-zinc-950/5 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">{header}</div>
            {biddingOpen && l.closesAt ? (
              <div className="shrink-0 rounded-xl border border-zinc-100 bg-zinc-50/60 px-4 py-3 text-right">
                <p className="text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">
                  Kapanmasına
                </p>
                <CountdownFull deadline={l.closesAt} />
                <p className="mt-0.5 text-xs text-zinc-500">
                  {formatDateTime(l.closesAt)}
                </p>
              </div>
            ) : l.status === "CLOSED" ||
              l.status === "IN_AWARD" ||
              l.status === "IN_AWARD_APPROVAL" ? (
              <span className="inline-flex shrink-0 items-center rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600">
                İhale kapandı, sonuç bekleniyor
              </span>
            ) : null}
          </div>
        </div>

        {/* Maskeli önizleme (premium olmayan) uyarısı → premium başvurusu */}
        {l.masked ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="flex items-start gap-2">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Bu herkese açık ihale önizleme modunda — {isAlim ? "alıcı" : "satıcı"}{" "}
              firma ve kalemler gizli. Teklif vermek için premium üyelik gerekir.
            </p>
            <Button href="/company/premium" className="shrink-0">
              Premium&apos;a Geç
            </Button>
          </div>
        ) : null}

        {l.english?.isEnglishAuction && !l.masked ? (
          <AuctionLiveCard l={l} />
        ) : null}

        {/* Meta şeridi */}
        <section>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-zinc-950/5 bg-zinc-950/[0.06] lg:grid-cols-4">
            <MetaItem
              icon={Building2}
              label={isAlim ? "Alıcı Firma" : "Satıcı Firma"}
              value={l.owner?.name ?? "Gizli firma"}
            />
            <MetaItem
              icon={Layers}
              label="Kalem"
              value={`${l.itemCount ?? l.items?.length ?? 0} kalem`}
            />
            <MetaItem
              icon={Wallet}
              label="Para Birimi"
              value={l.primaryCurrency ?? "TRY"}
            />
            <MetaItem
              icon={CalendarClock}
              label="Kapanış"
              value={l.closesAt ? formatDateTime(l.closesAt) : "—"}
            />
          </dl>
        </section>

        <TabGroup>
          <TabList
            className="flex flex-wrap gap-1 border-b border-zinc-950/10"
            aria-label="İhale bölümleri"
          >
            <Tab className={TRIGGER_CLASSES}>
              <Gavel className="h-4 w-4" aria-hidden="true" />
              Teklifim
            </Tab>
            <Tab className={TRIGGER_CLASSES}>
              <Layers className="h-4 w-4" aria-hidden="true" />
              Kalemler
              <TabBadge count={l.items?.length ?? 0} />
            </Tab>
            <Tab className={TRIGGER_CLASSES}>
              <Info className="h-4 w-4" aria-hidden="true" />
              Genel Bilgi
            </Tab>
            <Tab className={TRIGGER_CLASSES}>
              <Paperclip className="h-4 w-4" aria-hidden="true" />
              Dosyalar
            </Tab>
          </TabList>

          <TabPanels className="pt-5">
            <TabPanel className="space-y-5 outline-none">
              <MyBidStatusPanel l={l} />
              {sellerBidSection}
            </TabPanel>
            <TabPanel className="outline-none">
              {l.masked ? (
                <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-6 text-center text-sm text-zinc-500">
                  Kalem detayları önizleme modunda gizli — görmek için premium
                  üyeliğe geçin.
                </div>
              ) : (
                itemsSection
              )}
            </TabPanel>
            <TabPanel className="outline-none">
              <GeneralInfoTab l={l} />
            </TabPanel>
            <TabPanel className="outline-none">
              <FilesTab listingId={l.id} isOwner={false} canEdit={false} />
            </TabPanel>
          </TabPanels>
        </TabGroup>

      </div>
    );
  }
}
