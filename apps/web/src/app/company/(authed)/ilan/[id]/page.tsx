"use client";

import { AuctionLiveCard } from "./_components/auction-live-card";
import { MyBidStatusPanel } from "./_components/my-bid-status-panel";
import { SilverLockCard } from "@/components/company/silver-lock-card";
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
  useAwardByItemPreview,
  useAwardListing,
  useAwardPreview,
  useEliminateBid,
  useListingDetail,
  usePublishListing,
} from "@/hooks/use-company-listings";
import { useConfirm } from "@/components/providers/confirm-dialog";
import { useCancelApproval } from "@/hooks/use-company-approvals";
import {
  BID_DOC_KIND_LABELS,
  useBidDocuments,
} from "@/hooks/use-bid-documents";
import { useCategoriesByIds } from "@/hooks/use-categories";
import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { activePortalFromPath } from "@/lib/company/portals";
import { usePortalStore } from "@/lib/company/portal-store";
import { canManageListing } from "@/lib/tenders/can-manage-listing";
import { SearchInput } from "@/components/list/search-input";
import { extractErrorMessage } from "@/lib/tenders/error";
import { formatDate, formatDateTime, formatTime } from "@/lib/tenders/date";
import { subscribeRealtime } from "@/lib/realtime";
import { CURRENCY_SYMBOL, KDV_HARIC_NOTE } from "@/lib/tenders/labels";
import { Callout } from "@/components/ui/callout";
import { formatMoney } from "@/components/ui/money";
import { cn } from "@/lib/utils";
import { ArrowLeftIcon, ArrowRightIcon } from "@heroicons/react/20/solid";
import { orderStatusMeta } from "@/lib/orders/order-status";
import { SelectMenu } from "@/components/ui/select-menu";
import type { CompanyOrderStatus } from "@/hooks/use-company-orders";
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
  Wallet, PackagePlus } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useScrolledPast } from "@/hooks/use-scrolled-past";
import { toast } from "sonner";
import { useImportListingToCatalog } from "@/hooks/use-company-items";

const TRIGGER_CLASSES = cn(
  "group inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
  "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700",
  "data-selected:border-zinc-900 data-selected:text-zinc-950",
  "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900",
);

/** Kalem araması bu eşiğin üzerinde görünür — az kalemde kutu gürültü olur. */
const ITEM_SEARCH_THRESHOLD = 10;

function itemMatchesSearch(
  q: string,
  it: { name: string; materialCode?: string | null },
): boolean {
  const t = q.trim().toLocaleLowerCase("tr-TR");
  if (!t) return true;
  return (
    it.name.toLocaleLowerCase("tr-TR").includes(t) ||
    (it.materialCode ?? "").toLocaleLowerCase("tr-TR").includes(t)
  );
}

function TabBadge({ count }: { count: number }) {
  return (
    <span className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 group-data-selected:bg-zinc-900 group-data-selected:text-white">
      {count}
    </span>
  );
}

function MetaItem({
  icon: Icon,
  label,
  value,
  className,
  title,
}: {
  icon: typeof Layers;
  label: string;
  value: React.ReactNode;
  className?: string;
  /** Değer truncate ile kırpılabilir — uzun listelerde (ör. çoklu para
   *  birimi) hover'da tamamı görünsün diye native tooltip. */
  title?: string;
}) {
  return (
    <div
      className={cn("flex min-w-0 items-center gap-3 bg-white p-4", className)}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-50">
        <Icon className="h-4 w-4 text-zinc-600" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p
          className="truncate text-sm font-semibold text-zinc-900"
          title={title}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

/** İzinli para birimleri — ana birim önde, virgülle ("TRY, USD, EUR"). */
function currencyListLabel(l: {
  primaryCurrency?: string | null;
  allowedCurrencies?: string[];
}): string {
  const primary = l.primaryCurrency ?? "TRY";
  return [
    primary,
    ...(l.allowedCurrencies ?? []).filter((c) => c !== primary),
  ].join(", ");
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
  // §8.5: aktif sekme ?tab= ile taşınır — yenileme/paylaşımda korunur.
  // C14: aralık dışı ?tab= ilk sekmeye düşer (her iki görünümde de 4 sekme;
  // clamp yoksa headless son sekmeyi açıyordu).
  const rawTab = Number(searchParams.get("tab") ?? "0") || 0;
  const initialTab = rawTab >= 0 && rawTab <= 3 ? rawTab : 0;
  const rememberTab = (i: number) => {
    const u = new URL(window.location.href);
    if (i === 0) u.searchParams.delete("tab");
    else u.searchParams.set("tab", String(i));
    window.history.replaceState(null, "", u.toString());
  };
  // Yalnız iç /company yolları — open redirect / javascript: şeması engellenir.
  const rawFrom = searchParams.get("from");
  const fromHref =
    rawFrom && rawFrom.startsWith("/company") && !rawFrom.startsWith("//")
      ? rawFrom
      : null;
  const fromLabel = searchParams.get("fromLabel");
  // Faz 2: hook koşulsuz çağrılmalı — erken dönüşlerin ARDINDA çağırmak
  // rules-of-hooks ihlali (render'lar arası hook sırası değişir).
  const saveToCatalog = useImportListingToCatalog();
  const { data: l, isLoading, isFetching, isError, error, refetch } =
    useListingDetail(id);
  // 404 = erişim kalktı (kapalı-zarf gereği sebep söylenmez): bağlantı
  // pasifleşmiş, ilan kaldırılmış veya görünürlük değişmiş olabilir —
  // "Tekrar dene" bu durumda aynı 404'ü döndürür, kullanıcıyı döngüye sokma.
  const notFound =
    (error as { response?: { status?: number } } | null)?.response?.status ===
    404;
  // 403 + TIER_REQUIRED = herkese açık talep, ücretsiz üye (2026-09-06): boş
  // "ulaşılamıyor" değil paket kartı — derin bağlantıdan gelen üye ne
  // yapacağını görsün (API `listingBidEligibility.hidden`).
  const errBody = (error as { response?: { status?: number; data?: { code?: string } } } | null)
    ?.response;
  const tierRequired = errBody?.status === 403 && errBody?.data?.code === "TIER_REQUIRED";
  const confirm = useConfirm();
  const award = useAwardListing(id);
  const awardPreview = useAwardPreview(id);
  const eliminate = useEliminateBid(id);
  const awardByItem = useAwardByItem(id);
  const awardByItemPreview = useAwardByItemPreview(id);
  const publish = usePublishListing(id);
  const cancelApproval = useCancelApproval();
  const categories = useCategoriesByIds(l?.categoryIds ?? []);
  const bidDocs = useBidDocuments(id);
  // F7: kazandır/ele buton kapısı — backend assertListingManageRole birebir
  // (buy/sell:listing:manage + oluşturan/SAHİP). Hook'lar erken-return öncesi.
  const user = useCompanyAuthStore((s) => s.user);
  // B5: /company/ilan portal segmentlerinin dışında — sidebar bağlamı store'da
  // kalan son portalı gösteriyordu (alış ihalesine girince Satış menüsü).
  // Geldiği sayfadan (from), yoksa ihaledeki rolden türetip store'a yaz.
  const setLastPortal = usePortalStore((s) => s.setLastPortal);
  useEffect(() => {
    const fromPortal = activePortalFromPath(fromHref);
    const rolePortal = l
      ? l.isOwner
        ? ("satinalma" as const)
        : ("satis" as const)
      : null;
    const portal = fromPortal ?? rolePortal;
    if (portal) setLastPortal(portal);
  }, [fromHref, l, setLastPortal]);
  const hasManagePermission = useHasCompanyPermission("buy:listing:manage");
  const [itemAwardMode, setItemAwardMode] = useState(false);
  const [itemWinners, setItemWinners] = useState<Record<string, string>>({});
  const [itemQty, setItemQty] = useState<Record<string, string>>({});
  const [bidView, setBidView] = useState<"all" | "complete" | "incomplete">(
    "all",
  );
  // Kalem araması — çok kalemli ihalede (>10) liste ve karşılaştırma tablosu
  // aramasız kullanılamaz hale geliyor; iki sekme ayrı kutu/ayrı durum taşır.
  const [itemSearch, setItemSearch] = useState("");
  const [cmpSearch, setCmpSearch] = useState("");
  const [eliminateTarget, setEliminateTarget] = useState<{
    bidId: string;
    bidderName: string;
  } | null>(null);
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
  // Yapışkan eylem şeridi YALNIZ başlık görünümden çıkınca (v2 7b): sayfa
  // başındayken başlıktaki durum rozetiyle ikinci kez görünüyordu.
  const [headerEl, setHeaderEl] = useState<HTMLDivElement | null>(null);
  const pastHeader = useScrolledPast(headerEl);

  const handleAward = async (bidId: string, bidderName: string) => {
    // Tıklama-anı ön kontrol: bu teklif BU TUTARDA onaya takılır mı? Sunucu,
    // gerçek award-anıyla AYNI tutarı+eleme mantığını kullanır. Takılıyorsa
    // not girişli dialog (onaycılara iletilir); değilse doğrudan "Kazandır" onayı.
    // Fail-closed: durum doğrulanamazsa sessiz kazandırma yapma (INV-FX-1 felsefesi).
    let requiresApproval: boolean;
    try {
      ({ requiresApproval } = await awardPreview.mutateAsync({ bidId }));
    } catch (err) {
      toast.error(
        extractErrorMessage(err, "Onay durumu doğrulanamadı, tekrar deneyin"),
      );
      return;
    }
    if (requiresApproval) {
      setNoteAction({ kind: "award", bidId, bidderName });
      return;
    }
    if (
      // #6 (denetim 2026-08-26 Parça 10): metin geri alınamazlığı SÖYLEMİYORDU.
      // Un-award bilinçli olarak yok (CLAUDE.md §7) — aynı işlemin asistan
      // yolu bunu açıkça yazıyor, arayüz yazmıyordu.
      !(await confirm({
        title: "Kazandır",
        description: `"${bidderName}" kazandırılsın mı? Bu işlem GERİ ALINAMAZ: diğer teklifler kaybeder (LOST) ve sipariş oluşur.`,
        confirmLabel: "Evet, kazandır",
        destructive: true,
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
        title: "Satın Alma Talebini yayınla",
        description:
          "Satın Alma Talebi yayınlansın mı? Yayınlandıktan sonra tedarikçiler görebilir.",
        confirmLabel: "Yayınla",
      }))
    )
      return;
    try {
      await publish.mutateAsync(undefined);
      toast.success("Satın Alma Talebi yayınlandı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Yayınlanamadı"));
    }
  };

  // Kalem-bazlı: bir kalem için fiyat veren teklifler (TRY normalize; artan —
  // en düşük önde/ön-seçili).
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
      .sort(
        (a, b) =>
          (a.priceTry ?? Number.MAX_SAFE_INTEGER) -
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

  // Kalem kazandırma seçimleri REAKTİF dolar: detay 4 sn'de bir poll'landığı
  // için panel açıkken teklif verisi tazelenebilir (ya da butona veri otururken
  // basılmış olabilir) — boş/geçersiz kalan kalemlere en iyi teklif otomatik
  // yazılır ("RFQ'da ön-seçim gelmedi" vakasının kökten çözümü). Kullanıcının
  // yaptığı GEÇERLİ seçim asla ezilmez.
  useEffect(() => {
    if (!itemAwardMode || !l) return;
    setItemWinners((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const it of l.items ?? []) {
        const opts = bidsForItem(it.id);
        const stillValid = opts.some((o) => o.bidId === next[it.id]);
        if (!stillValid) {
          if (opts[0]) {
            next[it.id] = opts[0].bidId;
            changed = true;
          } else if (next[it.id]) {
            delete next[it.id];
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemAwardMode, l?.bids]);

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
    // Tıklama-anı ön kontrol: seçili kalem dağılımı BU TUTARDA onaya takılır mı?
    // (sunucu itemAwardTotal ile TRY toplamını hesaplar; fail-closed.)
    let requiresApproval: boolean;
    try {
      ({ requiresApproval } = await awardByItemPreview.mutateAsync({
        itemAwards,
      }));
    } catch (err) {
      toast.error(
        extractErrorMessage(err, "Onay durumu doğrulanamadı, tekrar deneyin"),
      );
      return;
    }
    if (requiresApproval) {
      setNoteAction({ kind: "itemAward", itemAwards });
      return;
    }
    const skipped = items.length - itemAwards.length;
    if (
      // #6: kalem-bazlı kazandırma da geri alınamaz.
      !(await confirm({
        title: "Kalem-bazlı kazandır",
        description:
          (skipped > 0
            ? `${itemAwards.length} kalem kazandırılacak, ${skipped} kalem (seçilmeyen/teklifsiz) atlanacak. `
            : "Kalem-bazlı kazandırılsın mı? ") +
          "Bu işlem GERİ ALINAMAZ: kazanan firma başına sipariş oluşur, kazanmayan teklifler kaybeder.",
        confirmLabel: "Evet, kazandır",
        destructive: true,
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
      <div className="space-y-4">
        <div className="h-8 w-1/3 animate-pulse rounded bg-zinc-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-zinc-100" />
      </div>
    );
  }
  if (isError) {
    if (tierRequired) {
      return (
        <div className="mx-auto max-w-3xl">
          <SilverLockCard
            title="Bu herkese açık talep Silver paketiyle açılır"
            description="Herkese açık satın alma taleplerini görmek ve teklif vermek Silver ile gelir. Talebin kalemleri, alıcı firma ve dosyalar paketle birlikte açılır."
          />
        </div>
      );
    }
    if (notFound) {
      return (
        <div className="mx-auto max-w-3xl rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-center">
          <Text className="text-sm font-medium text-zinc-900">
            Satın Alma Talebine ulaşılamıyor.
          </Text>
          <Text className="mt-1 text-sm text-zinc-500">
            İlan kaldırılmış, adres hatalı ya da erişim koşullarınız değişmiş
            olabilir (ör. firma bağlantısı veya üyelik durumu). Sorun olduğunu
            düşünüyorsanız ilan sahibiyle iletişime geçin.
          </Text>
          <Button outline className="mt-3" href="/company">
            Panele Dön
          </Button>
        </div>
      );
    }
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
    // Veri yok ama istek sürüyor/yeniden başlayacak (iptal edilen ilk çekim,
    // invalidate yarışı): "bulunamadı" flaşı yerine iskeleti koru.
    if (isFetching) {
      return (
        <div className="space-y-4">
          <div className="h-8 w-1/3 animate-pulse rounded bg-zinc-100" />
          <div className="h-32 animate-pulse rounded-2xl bg-zinc-100" />
          <div className="h-64 animate-pulse rounded-2xl bg-zinc-100" />
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-3xl">
        <Text className="text-sm text-zinc-500">İlan bulunamadı.</Text>
      </div>
    );
  }

  // Talebin para birimi sembolü (kalem/matris değerleri bununla gösterilir).
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
  // Yayında ve Değerlendirmede (IN_AWARD) kazandırma/eleme açık.
  const canDecide = l.status === "OPEN" || l.status === "IN_AWARD";
  // F7: durum uygun OLSA da yalnız izinli-yönetici kazandırma/eleme yapabilir.
  const canManage = canManageListing({
    hasManagePermission,
    createdById: l.createdById,
    userId: user?.id,
  });

  // ── Tasarruf özeti (kalem-bazlı karar desteği) ────────────────────────
  // Teorik kıyas: "en iyi TOPLU teklif" = TÜM kalemleri fiyatlamış tek
  // teklifin TRY toplam en iyisi (kısmi teklif toplu adaya giremez — elma
  // armut olurdu) vs "kalem bazlı en iyi dağılım" = her kalemde en iyi TRY
  // birim fiyat × kalem miktarı. Alıcı kazandıranı SEÇERKEN görür, tek
  // şirkete vermek yerine dağıtırsa ne kazanacağını yüzdeyle bilir;
  // seçimleri değiştirmek yüzdeyi değiştirmez (tanım gereği teorik en iyi).
  const itemSavings = (():
    | { kind: "ok"; bestTotal: number; itemized: number; pct: number }
    | { kind: "missing"; missingItems: number }
    | null => {
    const items = l.items ?? [];
    if (items.length < 2) return null; // tek kalemde dağıtım = toplu
    const bids = (l.bids ?? []).filter((b) => b.status === "SUBMITTED");
    if (bids.length === 0) return null;

    // Kalem bazlı taraf — kalemlerden biri fiyatsızsa kıyas yanıltıcı olur.
    let itemized = 0;
    let missingItems = 0;
    for (const it of items) {
      const best = bidsForItem(it.id).find((o) => o.priceTry != null);
      if (!best) {
        missingItems++;
        continue;
      }
      itemized += (best.priceTry as number) * Number(it.quantity);
    }
    if (missingItems > 0) return { kind: "missing", missingItems };

    // Toplu taraf: tüm kalemleri fiyatlamış + TRY karşılığı bilinen teklifler.
    const itemIds = items.map((i) => i.id);
    const fullTotals = bids
      .filter((b) => {
        const priced = new Set(
          (b.items ?? [])
            .filter((x) => Number(x.unitPrice) > 0)
            .map((x) => x.itemId),
        );
        return itemIds.every((id) => priced.has(id));
      })
      .map((b) => amountTryOf(b))
      .filter((x): x is number => x != null && x > 0);
    if (fullTotals.length === 0) return null;
    const bestTotal = Math.min(...fullTotals);
    const pct = ((bestTotal - itemized) / bestTotal) * 100;
    return { kind: "ok", bestTotal, itemized, pct };
  })();
  // Teklif verme / güncelleme / belge ekleme yalnızca ilan AÇIK iken.
  const biddingOpen = l.status === "OPEN";
  // ───────────────────────── Bölümler (sekmelere yerleşir) ─────────────────

  const visibleItems = (l.items ?? []).filter((it) =>
    itemMatchesSearch(itemSearch, it),
  );
  // §9 DataTable: teklifçi kendi birim fiyatını şartnamenin yanında görür.
  const myPriceByItem = new Map(
    (!l.isOwner && l.myBid?.items ? l.myBid.items : []).map((bi) => [
      bi.itemId,
      bi,
    ]),
  );
  const showMyPriceCol = myPriceByItem.size > 0;
  const itemsSection =
    l.items && l.items.length > 0 ? (
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Subheading>
            Kalemler (
            {itemSearch.trim()
              ? `${visibleItems.length}/${l.items.length}`
              : l.items.length}
            )
          </Subheading>
          <div className="flex items-center gap-2">
            {l.items.length > ITEM_SEARCH_THRESHOLD ? (
              <SearchInput
                value={itemSearch}
                onChange={setItemSearch}
                placeholder="Kalem ara…"
                className="w-56"
              />
            ) : null}
            {/* Faz 2 TERS YÖN: katalog kendiliğinden dolsun. Kullanıcıdan
                önce oturup katalog kurmasını istemek benimsemeyi öldürür —
                zaten girdiği kalemleri tek tıkla saklayabilmeli. Yalnız ilan
                sahibi ve yönetebilen kullanıcıya görünür. */}
            {canManage ? (
              <Button
                outline
                disabled={saveToCatalog.isPending}
                onClick={() => {
                  saveToCatalog.mutate(l.id, {
                    onSuccess: (r) => {
                      if (r.added === 0) {
                        toast.info(
                          r.skipped > 0
                            ? "Bu kalemler katalogunuzda zaten var"
                            : "Kataloğa eklenecek kalem bulunamadı",
                        );
                      } else {
                        toast.success(
                          `${r.added} kalem kataloğa eklendi${
                            r.skipped > 0 ? ` · ${r.skipped} zaten vardı` : ""
                          }`,
                        );
                      }
                    },
                    onError: (err) =>
                      toast.error(
                        extractErrorMessage(err, "Kataloğa kaydedilemedi"),
                      ),
                  });
                }}
              >
                <PackagePlus className="h-4 w-4" />
                Kataloğa Kaydet
              </Button>
            ) : null}
          </div>
        </div>
        <div className="card px-2 [--gutter:--spacing(4)]">
          <Table dense>
            <TableHead>
              <TableRow>
                <TableHeader>#</TableHeader>
                <TableHeader>Kalem</TableHeader>
                <TableHeader className="text-right">Miktar</TableHeader>
                <TableHeader className="text-right">
                  Hedef Fiyat
                </TableHeader>
                {showMyPriceCol ? (
                  <TableHeader className="text-right">
                    Benim Birim Fiyatım
                  </TableHeader>
                ) : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleItems.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={showMyPriceCol ? 5 : 4}
                    className="py-6 text-center text-zinc-400"
                  >
                    Aramanızla eşleşen kalem yok.
                  </TableCell>
                </TableRow>
              ) : null}
              {visibleItems.map((it) => (
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
                      ? formatMoney(it.targetPrice, l.primaryCurrency ?? "TRY")
                      : "—"}
                  </TableCell>
                  {showMyPriceCol ? (
                    <TableCell className="text-right font-mono font-medium tabular-nums text-zinc-900">
                      {(() => {
                        const bi = myPriceByItem.get(it.id);
                        return bi && Number(bi.unitPrice) > 0
                          ? formatMoney(
                              bi.unitPrice,
                              bi.currency ??
                                l.myBid?.currency ??
                                l.primaryCurrency ??
                                "TRY",
                            )
                          : "—";
                      })()}
                    </TableCell>
                  ) : null}
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
          Davetli Tedarikçiler ({l.invitations.length})
        </Subheading>
        <div className="flex flex-wrap gap-2">
          {l.invitations.map((iv) => (
            <span
              key={iv.rothernId ?? iv.companyName}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
            >
              {iv.companyName}{" "}
              <span className="font-mono text-xs text-zinc-500">
                {iv.rothernId}
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
  const cmpItems = (l.items ?? []).filter((it) =>
    itemMatchesSearch(cmpSearch, it),
  );
  // Karşılaştırma tablosu ekleri: kapsam rozeti (kaç kalem fiyatlı) + toplam
  // satırı. En iyi toplam yalnız SUBMITTED + TÜM kalemleri fiyatlamış + TRY
  // karşılığı bilinen teklifler arasında seçilir — kısmi teklifin düşük
  // toplamı "en iyi" görünüp yanıltmasın (itemSavings ile aynı ilke).
  const cmpItemIds = new Set((l.items ?? []).map((i) => i.id));
  const pricedCountById = new Map<string, number>();
  const totalTryById = new Map<string, number | null>();
  for (const b of allBids) {
    pricedCountById.set(
      b.id,
      (b.items ?? []).filter(
        (x) => cmpItemIds.has(x.itemId) && Number(x.unitPrice) > 0,
      ).length,
    );
    totalTryById.set(b.id, amountTryOf(b));
  }
  const cmpFullCovered = (bidId: string) =>
    (pricedCountById.get(bidId) ?? 0) >= (l.items?.length ?? 0);
  const bestTotalTry = (() => {
    const vals = allBids
      .filter((b) => b.status === "SUBMITTED" && cmpFullCovered(b.id))
      .map((b) => totalTryById.get(b.id))
      .filter((x): x is number => x != null && x > 0);
    return vals.length ? Math.min(...vals) : null;
  })();
  // Gerçek en iyi (uygun) teklif: yalnız SUBMITTED arasında en düşük;
  // karşılaştırma TRY karşılığı üzerinden (çok para birimi).
  // "En iyi" rozeti filtre/sıraya değil buna bağlanır. Kalemli ilanda kıyasa
  // yalnız TAM kapsamlı teklifler girer — 2/4 kalem fiyatlamış teklifin düşük
  // toplamı "en iyi" değildir (toplam satırı/tasarruf kutusuyla aynı ilke).
  const bestBidId = (() => {
    const subs = allBids.filter(
      (b) =>
        b.status === "SUBMITTED" &&
        amountTryOf(b) != null &&
        cmpFullCovered(b.id),
    );
    if (subs.length === 0) return null;
    const sorted = [...subs].sort(
      (a, b) => amountTryOf(a)! - amountTryOf(b)!,
    );
    return sorted[0]?.id ?? null;
  })();

  const ownerBidsSection = (
    <section className="space-y-3">
      <p className="text-xs text-zinc-400">{KDV_HARIC_NOTE}</p>
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
      ) : l.status === "IN_AWARD" ? (
        <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm text-purple-800">
          Değerlendirme aşaması — {submittedCount} teklif kararınızı bekliyor.
        </div>
      ) : l.status === "CLOSED" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          İlan platform yöneticisi tarafından teklife kapatıldı.
          {l.cancelReason ? ` Gerekçe: ${l.cancelReason}` : ""} Sorularınız için
          destek ile iletişime geçin.
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
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Subheading>
              Kalem Karşılaştırma
              {cmpSearch.trim()
                ? ` (${cmpItems.length}/${l.items.length})`
                : ""}
            </Subheading>
            {l.items.length > ITEM_SEARCH_THRESHOLD ? (
              <SearchInput
                value={cmpSearch}
                onChange={setCmpSearch}
                placeholder="Kalem ara…"
                className="w-56"
              />
            ) : null}
          </div>
          {/* Sığdırma esas, kaydırma istisna: hücre nowrap'leri kaldırıldı ki
              tablo kap genişliğine otursun (uzun firma adı başlıkta sarar);
              yalnız fiyat hücreleri nowrap kalır. Teklifçi sayısı gerçekten
              sığmayacak kadar artarsa Catalyst Table'ın kendi overflow-x-auto
              sarmalayıcısı güvenlik ağı olarak devreye girer. */}
          <div className="card px-2 [--gutter:--spacing(4)]">
            {/* max-h + iç dikey scroll: sticky başlık/toplam satırı sayfa değil
                bu kap içinde yapışır (overflow sarmalayıcı viewport sticky'yi
                kırar). Hairline'lar border yerine shadow — border-collapse
                sticky hücrede kenarlığı taşımaz. */}
            <Table dense className="max-h-[65vh] overflow-y-auto">
              <TableHead>
                <TableRow>
                  <TableHeader className="sticky top-0 left-0 z-20 bg-white shadow-table-top">
                    Kalem
                  </TableHeader>
                  {l.bids.map((b) => {
                    const priced = pricedCountById.get(b.id) ?? 0;
                    const totalItems = l.items?.length ?? 0;
                    return (
                      <TableHeader
                        key={b.id}
                        className="sticky top-0 z-10 bg-white text-right whitespace-normal shadow-table-top"
                      >
                        {b.bidderName}
                        {/* 2026-09-01: davetli/bağlantılı firma BELGESİZ
                            teklif verebiliyor. Alıcı bunu KAZANDIRMADAN ÖNCE
                            görmeli — aksi hâlde sipariş doğduktan sonra
                            öğrenir. Uyarı değil BİLGİ: alıcı zaten kendi
                            davet ettiği firmayı çoğu zaman umursamayacak. */}
                        {b.bidderVerified === false ? (
                          <span
                            className="block text-xs font-medium text-zinc-500"
                            title="Bu firmanın belge doğrulaması tamamlanmadı"
                          >
                            Doğrulanmamış firma
                          </span>
                        ) : null}
                        {priced < totalItems ? (
                          <span
                            className="block text-xs font-medium text-amber-600"
                            title="Bu teklif tüm kalemleri fiyatlamadı"
                          >
                            {priced}/{totalItems} kalem
                          </span>
                        ) : null}
                      </TableHeader>
                    );
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {cmpItems.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={1 + (l.bids?.length ?? 0)}
                      className="py-6 text-center text-zinc-400"
                    >
                      Aramanızla eşleşen kalem yok.
                    </TableCell>
                  </TableRow>
                ) : null}
                {cmpItems.map((it) => {
                  const cells = (l.bids ?? []).map((b) => {
                    const v = priceMap.get(b.id)?.get(it.id);
                    const vTry = priceTryMap.get(b.id)?.get(it.id);
                    return {
                      bidId: b.id,
                      bidderName: b.bidderName,
                      submitted: b.status === "SUBMITTED",
                      price: v != null ? v : null,
                      priceTry: vTry != null ? vTry : null,
                      currency: bidCurrencyById.get(b.id),
                    };
                  });
                  // En iyi TRY karşılığı vurgulanır (birimler arası adil):
                  // en düşük.
                  const validTry = cells
                    .map((c) => c.priceTry)
                    .filter((p): p is number => p != null && p > 0);
                  const minTry = validTry.length ? Math.min(...validTry) : null;
                  return (
                    <TableRow key={it.id}>
                      <TableCell className="sticky left-0 z-[1] bg-white whitespace-normal text-zinc-900">
                        {it.name}{" "}
                        <span className="text-xs whitespace-nowrap text-zinc-400">
                          ({Number(it.quantity).toLocaleString("tr-TR")} {it.unit})
                        </span>
                      </TableCell>
                      {cells.map((c) => {
                        const priceText =
                          c.price != null
                            ? `${c.price.toLocaleString("tr-TR")} ${symFor(c.currency)}`
                            : "—";
                        const tone =
                          c.priceTry != null && c.priceTry === minTry
                            ? "font-semibold text-emerald-700"
                            : "text-zinc-600";
                        // Kazandırma modunda fiyatlı SUBMITTED hücre tıklanarak
                        // o kalemin kazananı seçilir (aşağıdaki select ile aynı
                        // state'i yazar — iki taraf senkron kalır).
                        const clickable =
                          itemAwardMode &&
                          c.submitted &&
                          c.price != null &&
                          c.price > 0;
                        const selected =
                          itemAwardMode && itemWinners[it.id] === c.bidId;
                        return (
                          <TableCell
                            key={c.bidId}
                            className={cn(
                              "whitespace-nowrap text-right font-mono tabular-nums",
                              tone,
                            )}
                          >
                            {clickable ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setItemWinners((w) => ({
                                    ...w,
                                    [it.id]: c.bidId,
                                  }))
                                }
                                aria-pressed={selected}
                                aria-label={`${it.name} için ${c.bidderName} teklifini seç`}
                                className={cn(
                                  "-mx-1 w-[calc(100%+0.5rem)] cursor-pointer rounded-md px-1 py-0.5 text-right transition-colors",
                                  selected
                                    ? "bg-blue-100 ring-1 ring-blue-400 ring-inset"
                                    : "hover:bg-blue-50",
                                )}
                              >
                                {priceText}
                              </button>
                            ) : (
                              priceText
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
                {/* Toplam satırı — filtreden bağımsız, teklifin GENEL toplamı.
                    Sticky bottom: uzun listede kaydırırken hep görünür. */}
                <TableRow>
                  <TableCell className="sticky bottom-0 left-0 z-20 bg-zinc-50 font-semibold text-zinc-900 shadow-table-bottom">
                    Teklif Toplamı
                  </TableCell>
                  {l.bids.map((b) => {
                    const tTry = totalTryById.get(b.id);
                    const isBest =
                      bestTotalTry != null &&
                      tTry != null &&
                      b.status === "SUBMITTED" &&
                      cmpFullCovered(b.id) &&
                      tTry === bestTotalTry;
                    return (
                      <TableCell
                        key={b.id}
                        className={cn(
                          "sticky bottom-0 z-10 bg-zinc-50 whitespace-nowrap text-right font-mono tabular-nums shadow-table-bottom",
                          isBest
                            ? "font-bold text-emerald-700"
                            : "font-semibold text-zinc-900",
                        )}
                      >
                        {Number(b.amount).toLocaleString("tr-TR")}{" "}
                        {symFor(b.currency)}
                        {isBest ? (
                          <span className="block text-xs font-semibold text-emerald-600">
                            En iyi toplam
                          </span>
                        ) : null}
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      {canDecide &&
      canManage &&
      l.items &&
      l.items.length > 0 &&
      l.bids &&
      l.bids.some((b) => b.items && b.items.length > 0) ? (
        <div className="space-y-3">
          {/* Tasarruf şeridi — kazandıran SEÇİLİRKEN görünür ki alıcı toplu/
              kalem-bazlı kararını buna göre versin. */}
          {itemSavings?.kind === "ok" && itemSavings.pct < 0.05 ? (
            // Dağıtım kayda değer fark yaratmıyor (en iyi toplu teklif her
            // kalemde de en iyi/eşit) — "%0 tasarruf" saçmalığı yerine net
            // öneri: toplu kazandırma en ekonomik.
            <div className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
              <p>
                Kalem bazlı dağıtım ek tasarruf sağlamıyor — en düşük toplu
                teklif (
                <strong>
                  {itemSavings.bestTotal.toLocaleString("tr-TR", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  ₺
                </strong>
                ) ile <strong>toplu kazandırma</strong> en ekonomik seçenek.
                <span className="ml-1 text-xs text-zinc-500">
                  (TRY karşılığıyla)
                </span>
              </p>
            </div>
          ) : itemSavings?.kind === "ok" ? (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p>
                Kalem bazlı dağıtım:{" "}
                <strong>
                  {itemSavings.itemized.toLocaleString("tr-TR", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  ₺
                </strong>
                {" · "}En düşük toplu teklif:{" "}
                <strong>
                  {itemSavings.bestTotal.toLocaleString("tr-TR", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  ₺
                </strong>
                {" → "}
                <strong>
                  %
                  {itemSavings.pct.toLocaleString("tr-TR", {
                    maximumFractionDigits: 1,
                  })}{" "}
                  tasarruf
                </strong>
                <span className="ml-1 text-xs text-emerald-700/80">
                  (TRY karşılığıyla)
                </span>
              </p>
            </div>
          ) : itemSavings?.kind === "missing" ? (
            <p className="text-xs text-zinc-400">
              {itemSavings.missingItems} kalemde fiyatlı teklif yok —
              toplu/kalem-bazlı tasarruf kıyası yapılamıyor.
            </p>
          ) : null}
          {itemAwardMode ? (
          <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
            <Subheading>Kalem-bazlı Kazandırma</Subheading>
            <Text className="text-xs text-zinc-500">
              Her kalem için kazanan teklifi seç. Kazanan firma başına ayrı sipariş
              oluşur. İpucu: yukarıdaki Kalem Karşılaştırma tablosunda fiyat
              hücresine tıklayarak da seçim yapabilirsiniz.
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
                      <SelectMenu
                        value={itemWinners[it.id] ?? ""}
                        ariaLabel={`${it.name} için kazanan teklif`}
                        onChange={(v) =>
                          setItemWinners((w) => ({ ...w, [it.id]: v }))
                        }
                        className="min-w-48"
                        options={[
                          { value: "", label: "— seç —" },
                          ...opts.map((o) => ({
                            value: o.bidId,
                            label: `${o.bidderName} · ${formatMoney(o.price, o.currency ?? "TRY")}`,
                          })),
                        ]}
                      />
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
          )}
        </div>
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
                {/* Geçerlilik dolmuş canlı teklif — alıcı kazandırmadan önce
                    görsün (son gün = submittedAt + validityDays). */}
                {b.status === "SUBMITTED" &&
                b.submittedAt &&
                b.validityDays &&
                new Date(b.submittedAt).getTime() +
                  b.validityDays * 86_400_000 <
                  Date.now() ? (
                  <Badge color="amber">Geçerlilik doldu</Badge>
                ) : null}
                <Link
                  href={`/company/ilan/${l.id}/teklif/${b.id}`}
                  className="text-sm font-medium text-zinc-900 hover:text-blue-600 hover:underline"
                >
                  {b.bidderName}
                </Link>
                {l.english?.isEnglishAuction && b.round ? (
                  <Badge color="zinc">Tur {b.round}</Badge>
                ) : null}
                {/* v{n} rozeti kaldırıldı — teknik gürültü; Tur rozeti
                    güncellenmişlik bilgisini zaten veriyor. */}
                {/* Kısmi kapsam: toplamı diğerleriyle kıyaslanamaz — "En iyi"
                    kıyasına girmez (tablo başlığındaki rozetle aynı kural). */}
                {b.status === "SUBMITTED" &&
                bidItemCount > 0 &&
                !cmpFullCovered(b.id) ? (
                  <Badge color="amber">
                    {pricedCountById.get(b.id) ?? 0}/{bidItemCount} kalem
                  </Badge>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-sm font-semibold text-zinc-900">
                  {formatMoney(b.amount, b.currency ?? "TRY")}
                  {b.currency && b.currency !== "TRY" && b.amountTry ? (
                    <span className="ml-1 text-xs font-normal text-zinc-400">
                      ≈ {formatMoney(b.amountTry, "TRY")}
                      {b.exchangeRateSnapshot
                        ? ` (kur: ${b.exchangeRateSnapshot})`
                        : ""}
                    </span>
                  ) : null}
                </span>
                {b.bidderCompanyId ? (
                  <Link
                    href={`/company/mesajlar?with=${b.bidderCompanyId}&portal=satinalma`}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    Mesaj
                  </Link>
                ) : null}
                {canDecide && canManage && b.status === "SUBMITTED" ? (
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
              {/* Teklif ekleri — satır başlığına sıkışmasın diye KENDİ
                  satırında (isim/rozet kümesinin içinde dosya çipi kafa
                  karıştırıyordu). Tam liste teklif detayında. */}
              {(bidDocs.data ?? []).some((d) => d.bidId === b.id) ? (
                <div className="flex w-full flex-wrap items-center gap-2 border-t border-zinc-100 pt-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Teklif ekleri:
                  </span>
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
              ) : null}
            </div>
          ))}
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
      return { label: "Yeni Teklif Ver", href: bidHref };
    return null; // SUBMITTED RFQ (değişiklik yok) / WITHDRAWN
  })();
  // Pazarlıkta tur hakkı kullanıldıysa CTA pasif — yeni tur garanti değil.
  const bidCtaDisabled =
    !!l.english?.isEnglishAuction &&
    l.myBid?.status === "SUBMITTED" &&
    l.nextBidConstraint?.canBidThisRound === false;

  const sellerBidSection = (
    <section className="space-y-3">
      {!l.canBid ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <Text className="text-sm text-amber-800">
            Bu ilana teklif vermek için <strong>Silver paketi</strong>
            gerekir (ya da ilanı açan firmadan bağlantı daveti alın).
          </Text>
          <Button href="/company/premium" className="shrink-0">
            Paket Al
          </Button>
        </div>
      ) : l.roleAllowsBid === false ? (
        // Rol kapısı: sessiz buton yokluğu yerine açık yönlendirme.
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <Text className="text-sm text-amber-800">
            Bu açık talebe teklif vermek için hesabınızda{" "}
            <strong>Satışçı</strong> rolü gerekir
            — firma yöneticiniz Ayarlar → Kullanıcılar&apos;dan verebilir.
          </Text>
        </div>
      ) : (l.myBid?.status === "SUBMITTED" &&
          biddingOpen &&
          !l.english?.isEnglishAuction) ||
        !l.english?.isEnglishAuction ||
        bidDocsSection != null ? (
        // İçeriksiz beyaz kutu render etme (pazarlıkta çoğu not yok —
        // CTA sekmenin en üstünde).
        <div className="space-y-4 rounded-xl border border-zinc-950/10 bg-white p-5">
          {/* CTA butonu sekmenin EN ÜSTÜNE taşındı (aşağıdaki panel) —
              burada yalnız RFQ notları / belgeler kalır. */}
          {l.myBid?.status === "SUBMITTED" &&
          biddingOpen &&
          !l.english?.isEnglishAuction ? (
            <>
              <Text className="text-xs text-zinc-500">
                Gönderilmiş teklif geri çekilemez ve düzenlenemez — değişiklik için{" "}
                alıcıyla iletişime geç. Alıcı teklifinizi elerse yeniden teklif verebilirsiniz.
              </Text>
              <div className="rounded-lg bg-zinc-50 px-3 py-2">
                <Text className="text-sm">
                  Mevcut teklifin:{" "}
                  <strong>
                    {formatMoney(l.myBid.amount, l.myBid.currency ?? "TRY")}
                  </strong>
                </Text>
              </div>
            </>
          ) : null}
          {/* Pazarlıkta alttaki kural kutusu KALDIRILDI (bayat 'güncel en
              düşük' iddiası — kural kendi öncekinden düşük); kapalı zarf
              notu RFQ'da kalır. */}
          {!l.english?.isEnglishAuction ? (
            <Callout variant="neutral" icon={Lock}>
              Kapalı zarf: diğer tekliflerin tutarını göremezsin.
            </Callout>
          ) : null}
          {bidDocsSection}
        </div>
      ) : null}
    </section>
  );

  const statusMeta = LISTING_STATUS_META[l.status] ?? {
    label: l.status,
    color: "zinc" as const,
  };

  // P2 (denetim §10.4): OrderStatusStrip — kazandırma sonrası ihale detayı,
  // doğan siparişin durumuna bağlanır ("Tamamlandı / Kazandın / Teslime hazır"
  // üç kopuk ekranı birleşir). myOrder = çağıranın taraf olduğu sipariş.
  const orderStrip = l.myOrder ? (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
      <p className="text-sm text-emerald-900">
        Sipariş{" "}
        <span className="font-mono font-semibold tabular-nums">
          {l.myOrder.number ?? "—"}
        </span>
        <span className="mx-1.5 text-emerald-400">·</span>
        {orderStatusMeta(l.myOrder.status as CompanyOrderStatus).label}
      </p>
      <Link
        href={`/company/siparis/${l.myOrder.id}`}
        className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-800 hover:underline"
      >
        Siparişe git
        <ArrowRightIcon className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  ) : null;

  const header = (
    <div className="space-y-3">
      {/* Üst satır: numara (eyebrow) + durum */}
      <div className="flex flex-wrap items-center gap-2">
        {l.number ? (
          <span className="tabular-nums text-xs font-medium tracking-wide text-zinc-400">
            {l.number}
          </span>
        ) : null}
        <Badge color={statusMeta.color}>{statusMeta.label}</Badge>
      </div>

      <Heading>{l.title}</Heading>

      {/* Tanım rozetleri — emojisiz, anlamsal renkler */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge color="blue">Alış</Badge>
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
            {l.format === "RFQ" ? "Teklif Toplama" : "Pazarlık (Eksiltme)"}
          </Badge>
        ) : null}
      </div>

      {/* Anahtar kelimeler */}
      {l.keywords && l.keywords.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
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
        <span className="inline-flex items-center gap-2 font-medium text-zinc-700">
          {l.owner ? (
            <Building2 className="size-4 text-zinc-400" />
          ) : (
            <Lock className="size-4 text-zinc-400" />
          )}
          {l.owner ? l.owner.name : "Gizli firma"}
        </span>
      </Text>

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
    ? { href: "/company/satinalma/taleplerim", label: "Taleplerim" }
    : { href: "/company/satis#acik-talepler", label: "Açık Talepler" };
  const breadcrumb = (
    <Link
      href={fromHref ?? defaultBack.href}
      className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
    >
      <ArrowLeftIcon className="h-4 w-4" />
      {fromHref ? (fromLabel ?? "Firma profili") : defaultBack.label}
    </Link>
  );

  // ───────────── SAHİP: sekmeli talep detayı ─────────────
  if (l.isOwner) {
    return (
      <div className="space-y-5">
        {breadcrumb}

        {/* P2 (denetim §5): sticky ActionBar — solda durum, sağda durum
            makinesine göre birincil aksiyon; sayfa kaydırılınca da görünür.
            F7: yayınla/onay-iptal yönetim aksiyonudur — canManage kapısı
            (backend publishListing→assertListingManageRole birebir). */}
        {/* B2: top-14 = topbar (h-14) ile hizalı — top-16'daki 8px açık şerit
            + yarı saydam zemin, altta kayan chip'leri gösteriyordu (opak bg). */}
        <div
          className={cn(
            "sticky top-14 z-20 rounded-xl border border-zinc-950/10 bg-white px-3 py-2 shadow-sm sm:px-4",
            !pastHeader && "invisible h-0 overflow-hidden border-0 py-0 shadow-none",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge color={statusMeta.color}>{statusMeta.label}</Badge>
              {biddingOpen && l.closesAt ? (
                <span className="truncate text-xs text-zinc-500">
                  Kapanış: {formatDateTime(l.closesAt)}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {canManage && l.pendingApprovalId ? (
                <Button
                  outline
                  onClick={handleCancelApproval}
                  disabled={cancelApproval.isPending}
                >
                  Onayı İptal Et
                </Button>
              ) : null}
              {canManage && l.canPublish ? (
                <Button onClick={handlePublish} disabled={publish.isPending}>
                  Yayınla
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {orderStrip}

        <div className="card p-5">
          <div className="min-w-0" ref={setHeaderEl}>{header}</div>
          {/* İşlemler — görünür buton çubuğu (kutu içinde). F7: 10 aksiyonun
              tamamı backend'de assertListingManageRole ister → menü yalnız
              canManage'e görünür; etiket-only gözetim sayfayı yine görür. */}
          {canManage ? (
          <div className="mt-4 border-t border-zinc-950/5 pt-4">
            <TenderActionsMenu
              id={l.id}
              status={l.status}
              format={l.format}
              closesAt={l.closesAt}
              internalNotes={l.internalNotes ?? null}
              canEdit={l.canEdit}
              currency={l.primaryCurrency}
              allowedCurrencies={l.allowedCurrencies ?? []}
              carryableBidCount={
                (l.bids ?? []).filter(
                  (b) =>
                    b.round === l.currentRound &&
                    (b.status === "SUBMITTED" || b.status === "LOST"),
                ).length
              }
            />
          </div>
          ) : null}
        </div>

        {/* Onay bekliyor bandı */}
        {l.status === "IN_APPROVAL" || l.status === "IN_AWARD_APPROVAL" ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {l.status === "IN_APPROVAL"
                ? "Onay bekliyor — yayın askıda. Onaylandığında satın alma talebi otomatik yayınlanır."
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
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200/80 bg-zinc-950/[0.06] lg:grid-cols-5">
            <MetaItem
              icon={Layers}
              label="Kalem"
              value={`${l.items?.length ?? 0} kalem`}
            />
            <MetaItem
              icon={Wallet}
              label={
                (l.allowedCurrencies?.length ?? 0) > 1
                  ? "Para Birimleri"
                  : "Para Birimi"
              }
              value={currencyListLabel(l)}
              title={currencyListLabel(l)}
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
              value={`${l.invitations?.length ?? 0} tedarikçi`}
            />
            <MetaItem
              icon={Gavel}
              label="Teklif"
              value={`${l.bids?.length ?? 0}`}
              className="col-span-2 lg:col-span-1"
            />
          </dl>
        </section>

        <TabGroup
          defaultIndex={initialTab}
          onChange={rememberTab}
          className="space-y-5"
        >
          <TabList
            className="flex flex-wrap border-b border-zinc-950/10"
            aria-label="Satın Alma Talebi detay sekmeleri"
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
              ? `"${eliminateTarget.bidderName}" elensin mi? Yeniden teklif verebilir. Yazdığınız gerekçe tedarikçiye GÖSTERİLİR.`
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
              ? `"${noteAction.bidderName}" için kazandırma ONAYA gönderilecek. Sipariş şimdi oluşmaz — yalnızca onay zinciri tamamlanınca oluşur. Notunuz onaycılara iletilir.`
              : "Kalem-bazlı kazandırma ONAYA gönderilecek. Siparişler şimdi oluşmaz — yalnızca onay zinciri tamamlanınca oluşur. Notunuz onaycılara iletilir."
          }
          confirmLabel="Onaya Gönder"
          pending={award.isPending || awardByItem.isPending}
        />
      </div>
    );
  }

  // ───────────── SAHİP DEĞİL: sekmeli teklifçi görünümü ─────
  // Eski tedarikçi paneli paritesi: başlık kartı (geri sayım) + canlı
  // eksiltme kartı + meta şeridi + Teklifim/Kalemler/Genel
  // Bilgi/Dosyalar sekmeleri. Teklifçi satıcıdır.
  // Kapalı zarf: davetliler/teklifler sekmesi YOK — yalnızca kendi teklifi.
  {
    return (
      <div className="space-y-5">
        {breadcrumb}

        {/* P2 (denetim §5): sticky ActionBar — teklif CTA'sı artık sekmeden
            bağımsız, kaydırınca da ilk ekranda ("aynı birincil aksiyon bir
            kez" kuralı gereği yalnız burada). */}
        {/* B2: top-14 = topbar (h-14) ile hizalı — top-16'daki 8px açık şerit
            + yarı saydam zemin, altta kayan chip'leri gösteriyordu (opak bg). */}
        <div
          className={cn(
            "sticky top-14 z-20 rounded-xl border border-zinc-950/10 bg-white px-3 py-2 shadow-sm sm:px-4",
            !pastHeader && "invisible h-0 overflow-hidden border-0 py-0 shadow-none",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge color={statusMeta.color}>{statusMeta.label}</Badge>
              {biddingOpen && l.closesAt ? (
                <span className="truncate text-xs text-zinc-500">
                  Kapanış: {formatDateTime(l.closesAt)}
                </span>
              ) : null}
            </div>
            {bidCta ? (
              bidCtaDisabled ? (
                <Button
                  disabled
                  title="Bu turdaki teklifiniz verildi — ilan sahibi yeni tur açarsa güncelleyebilirsiniz"
                >
                  {bidCta.label}
                </Button>
              ) : (
                <Button href={bidCta.href}>{bidCta.label}</Button>
              )
            ) : null}
          </div>
        </div>

        {orderStrip}

        <div className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1" ref={setHeaderEl}>{header}</div>
            {biddingOpen && l.closesAt ? (
              <div className="shrink-0 rounded-xl border border-zinc-100 bg-zinc-50/60 px-4 py-3 text-right">
                <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                  Kapanmasına
                </p>
                <CountdownFull deadline={l.closesAt} />
                <p className="mt-0.5 text-xs text-zinc-500">
                  {formatDateTime(l.closesAt)}
                </p>
              </div>
            ) : l.status === "IN_AWARD" ||
              l.status === "IN_AWARD_APPROVAL" ? (
              <span className="inline-flex shrink-0 items-center rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600">
                Teklif alımı kapandı — değerlendirme aşamasında
              </span>
            ) : null}
          </div>
        </div>

        {l.english?.isEnglishAuction ? (
          <AuctionLiveCard l={l} />
        ) : null}

        {/* Meta şeridi */}
        <section>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200/80 bg-zinc-950/[0.06] lg:grid-cols-4">
            <MetaItem
              icon={Building2}
              label="Alıcı Firma"
              value={l.owner?.name ?? "Gizli firma"}
            />
            <MetaItem
              icon={Layers}
              label="Kalem"
              value={`${l.itemCount ?? l.items?.length ?? 0} kalem`}
            />
            <MetaItem
              icon={Wallet}
              label={
                (l.allowedCurrencies?.length ?? 0) > 1
                  ? "Para Birimleri"
                  : "Para Birimi"
              }
              value={currencyListLabel(l)}
              title={currencyListLabel(l)}
            />
            <MetaItem
              icon={CalendarClock}
              label="Kapanış"
              value={l.closesAt ? formatDateTime(l.closesAt) : "—"}
            />
          </dl>
        </section>

        <TabGroup defaultIndex={initialTab} onChange={rememberTab}>
          <TabList
            className="flex flex-wrap gap-1 border-b border-zinc-950/10"
            aria-label="Satın Alma Talebi bölümleri"
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
              {/* Teklif CTA'sı sticky ActionBar'a taşındı (denetim §5) —
                  sekme içinde tekrar edilmez. */}
              <MyBidStatusPanel l={l} />
              {sellerBidSection}
            </TabPanel>
            <TabPanel className="outline-none">
              {/* Maskede de kalemler görünür (teaser: isim/miktar/birim);
                  fiyat/detay itemsSection içinde gizlenir + upsell notu. */}
              {itemsSection}
            </TabPanel>
            <TabPanel className="outline-none">
              <GeneralInfoTab l={l} />
            </TabPanel>
            <TabPanel className="outline-none">
              <FilesTab
                listingId={l.id}
                isOwner={false}
                canEdit={false}
              />
            </TabPanel>
          </TabPanels>
        </TabGroup>

      </div>
    );
  }
}
