"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  countryDisplayName,
  useBidDocKindLabel,
  useListingStatusLabel,
  useNavLabel,
  useOrderStatusLabel,
  useScopeLabel,
  useQuantityLabel, useUnitLabel,
} from "@/i18n/domain";
import { AutoTranslatedNote } from "@/components/marketplace/auto-translated-note";
import { AuctionLiveCard } from "./_components/auction-live-card";
import { MyBidStatusPanel } from "./_components/my-bid-status-panel";
import { PRICING_HREF, SilverLockCard } from "@/components/company/silver-lock-card";
import { CountryNotEligibleCard, countryGateFrom } from "@/components/company/country-not-eligible-card";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { CountdownFull } from "@/components/tenders/countdown-full";
import { FilesTab } from "@/components/tenders/files-tab";
import { GeneralInfoTab } from "@/components/tenders/general-info-tab";
import { ReasonDialog } from "@/components/tenders/reason-dialog";
import { AlternativeOfferNote } from "@/components/tenders/alternative-offer-note";
import { TenderActionsMenu } from "@/components/tenders/tender-actions-menu";
import { SupplierDiscoveryModal } from "@/components/tenders/supplier-discovery-modal";
import { VerifyNudge } from "@/components/company/verify-nudge";
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
  type ListingBidItemRow,
} from "@/hooks/use-company-listings";
import { useConfirm } from "@/components/providers/confirm-dialog";
import { useCancelApproval } from "@/hooks/use-company-approvals";
import {
  useBidDocuments,
} from "@/hooks/use-bid-documents";
import { useCategoriesByIds } from "@/hooks/use-categories";
import { useCompanyAuth, useHasCompanyPermission } from "@/hooks/use-company-auth";
import { useListingDocuments } from "@/hooks/use-listing-documents";
import { BUYING_TIER, foldSearchText, tierAtLeast } from "@rothern/shared";
import { buyingGate, VERIFY_HREF } from "@/lib/public/member-gate";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { activePortalFromPath } from "@/lib/company/portals";
import { usePortalStore } from "@/lib/company/portal-store";
import { canManageListing } from "@/lib/tenders/can-manage-listing";
import { bidViewQuery, parseBidView, type BidView } from "@/lib/tenders/bid-view";
import {
  bidItemCurrency,
  bidItemUnitPriceTry,
  rankBidsForItem,
} from "@/lib/tenders/bid-item-price";
import { SearchInput } from "@/components/list/search-input";
import { extractErrorMessage } from "@/lib/tenders/error";
import { formatDate, formatDateTime, formatTime } from "@/lib/tenders/date";
import { subscribeRealtime } from "@/lib/realtime";
import { affixCurrency } from "@/lib/tenders/labels";
import { useFormatMoney } from "@/components/ui/money";
import { formatNumber, formatPercent, intlLocale } from "@/i18n/format";
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
  Sparkles,
  Wallet, PackagePlus, FileText, Clock, ChevronRight, Share2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { MONEY_FRACTION } from "@/lib/line-amount";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useScrolledPast } from "@/hooks/use-scrolled-past";
import { usePendingListingInvites } from "@/hooks/use-pending-listing-invites";
import { isBidExpired } from "@/lib/tenders/bid-expiry";
import { lostBidOutcome } from "@/lib/tenders/lost-bid-outcome";
import { ListingSuggestions } from "@/components/tenders/ai-suppliers/listing-suggestions";
import { ShareListing } from "@/components/tenders/share-listing";
import { toast } from "sonner";
import { useImportListingToCatalog } from "@/hooks/use-company-items";
import { useSubmitLock } from "@/hooks/use-submit-lock";

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
  // Katlanmış karşılaştırma — `tr-TR` küçültme İngilizce "PIPE"ı "pıpe"
  // yapıp "pipe" aramasını kaçırıyordu.
  const t = foldSearchText(q);
  if (!t) return true;
  return (
    foldSearchText(it.name).includes(t) ||
    foldSearchText(it.materialCode ?? "").includes(t)
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
  multiline = false,
}: {
  icon: typeof Layers;
  label: string;
  value: React.ReactNode;
  className?: string;
  /** Değer truncate ile kırpılabilir — uzun listelerde (ör. çoklu para
   *  birimi) hover'da tamamı görünsün diye native tooltip. */
  title?: string;
  /** Değer kendi satırlarını taşıyor (ör. Kapanış: tarih + saat blokları).
   *  truncate'in nowrap'i blok çocuklara miras kalır, ellipsis de çıkmaz →
   *  dar masaüstünde tarih uyarısız kırpılıyordu ("28 Ağu 202"). */
  multiline?: boolean;
}) {
  return (
    <div
      className={cn("flex min-w-0 items-center gap-3 bg-white p-4", className)}
    >
      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
        <Icon className="size-5 text-zinc-700" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p
          className={cn(
            "text-sm font-semibold text-zinc-900",
            multiline ? "min-w-0" : "truncate",
          )}
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

/** İlan durumu → Catalyst rozet rengi; etiket katalogdan (`useListingStatusLabel`,
 *  `web.domain.listingStatus`). Ham enum kullanıcıya gösterilmez. */
const LISTING_STATUS_COLOR: Record<
  string,
  React.ComponentProps<typeof Badge>["color"]
> = {
  DRAFT: "zinc",
  IN_APPROVAL: "amber",
  OPEN: "green",
  CLOSED: "amber",
  IN_AWARD: "blue",
  IN_AWARD_APPROVAL: "amber",
  AWARDED: "blue",
  CLOSED_NO_AWARD: "zinc",
  CANCELLED: "red",
};

export default function ListingDetailPage() {
  const t = useTranslations("web.panel.requests.page");
  const docKindLabel = useBidDocKindLabel();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const searchParams = useSearchParams();
  // §8.5: aktif sekme ?tab= ile taşınır — yenileme/paylaşımda korunur.
  // C14: aralık dışı ?tab= ilk sekmeye düşer (clamp yoksa headless son
  // sekmeyi açıyordu). 2026-09-17'den beri iki görünümde de İKİ sekme:
  // 0 Kalemler (+ genel bilgi) · 1 Dosyalar.
  const rawTab = Number(searchParams.get("tab") ?? "0") || 0;
  const initialTab = rawTab === 1 ? 1 : 0;
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
  // Bildirim/e-posta bağlantısı (`?ai-davet=1`): AI öneri listesi açık gelir.
  const aiInviteParam = searchParams.get("ai-davet") === "1";
  const tn = useNavLabel();
  const td = useTranslations("web.domain");
  const locale = useLocale();
  const intl = intlLocale(locale);
  const { money: fmtMoney } = useFormatMoney();
  const listingStatusLabel = useListingStatusLabel();
  const orderStatusLabel = useOrderStatusLabel();
  const scopeLabel = useScopeLabel();
  const unitLabel = useUnitLabel();
  const quantity = useQuantityLabel();
  // Faz 2: hook koşulsuz çağrılmalı — erken dönüşlerin ARDINDA çağırmak
  // rules-of-hooks ihlali (render'lar arası hook sırası değişir).
  const saveToCatalog = useImportListingToCatalog();
  // Çift tık kalemleri kataloğa iki kez yazmasın (arayüz testi FX-00 O-061).
  const catalogLock = useSubmitLock();
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
  // 403 + COUNTRY_NOT_ELIGIBLE = talep yalnız belirli ülkelere açık (2026-09-27):
  // "ulaşılamıyor" değil kuralın kendisi (hangi ülkeler, davetle aşılır).
  const countryGate = countryGateFrom(error);
  const confirm = useConfirm();
  const award = useAwardListing(id);
  const awardPreview = useAwardPreview(id);
  const eliminate = useEliminateBid(id);
  const awardByItem = useAwardByItem(id);
  const awardByItemPreview = useAwardByItemPreview(id);
  const publish = usePublishListing(id);
  const pendingInvites = usePendingListingInvites(id);
  const cancelApproval = useCancelApproval();
  const categories = useCategoriesByIds(l?.categoryIds ?? []);
  const bidDocs = useBidDocuments(id);
  // Dosyalar sekmesinin sayacı — FilesTab aynı sorguyu paylaşır (tek fetch).
  const listingDocs = useListingDocuments(id, !!l);
  const { company } = useCompanyAuth();
  // "AI ile tedarikçi bul" (2026-09-17, kullanıcı: "bu tuş çok önemli, geri
  // getir") — ⋮ menüsünün içine gömülüydü ve menü yalnız ilanı OLUŞTURAN
  // kişiye çiziliyordu; başkasının açtığı talepte düğme hiç görünmüyordu.
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
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
  // Kazandırma ayrı izin (API award uçları `buy:award` ister) — yetki
  // tablosunda "Kazandırma" verilmemiş üyeye Kazandır / Kalem bazlı
  // kazandır sunulmaz (derin denetim LU-21). Ele buy:listing:manage ile kalır.
  const hasAwardPermission = useHasCompanyPermission("buy:award");
  // Onay isteğini iptal: API başlatan VEYA approvals:manage (arayüz testi D-252).
  const hasApprovalsManage = useHasCompanyPermission("approvals:manage");
  // Satınalma görüntüleme izni olmayan üye KENDİ firmasının talebini açınca
  // sunucu 404 döner (Faz O; sebep söylenmez) — kart bu olasılığı da anlatır
  // (arayüz testi D-024).
  const hasBuyView = useHasCompanyPermission("buy:view");
  const [itemAwardMode, setItemAwardMode] = useState(false);
  const [itemWinners, setItemWinners] = useState<Record<string, string>>({});
  const [itemQty, setItemQty] = useState<Record<string, string>>({});
  // Gelen Teklifler süzgeci ?teklifler= ile taşınır — teklif detayından geri
  // dönünce seçim korunur (arayüz testi D-109; ?tab= ile aynı kalıp).
  const [bidView, setBidViewState] = useState<BidView>(() =>
    parseBidView(searchParams.get("teklifler")),
  );
  const setBidView = (v: BidView) => {
    setBidViewState(v);
    const u = new URL(window.location.href);
    if (v === "all") u.searchParams.delete("teklifler");
    else u.searchParams.set("teklifler", v);
    window.history.replaceState(null, "", u.toString());
  };
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
        extractErrorMessage(err, t("onayDurumuDogrulanamadiTekrarDeneyin")),
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
        title: t("kazandir"),
        description: t("kazandirilsinMiBuIslemGeri", { bidderName: bidderName }),
        confirmLabel: t("evetKazandir"),
        destructive: true,
      }))
    )
      return;
    try {
      const res = await award.mutateAsync({ bidId });
      toast.success(
        res.pendingApproval
          ? t("kazandirmaOnayaGonderildi")
          : t("kazandirildiSiparisOlustu", { number: res.number ?? "" }),
      );
    } catch (err) {
      toast.error(extractErrorMessage(err, t("kazandirilamadi")));
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
            ? t("kazandirmaOnayaGonderildi")
            : t("kazandirildiSiparisOlustu", { number: res.number ?? "" }),
        );
      } else {
        const res = await awardByItem.mutateAsync({
          itemAwards: noteAction.itemAwards,
          approvalNote,
        });
        toast.success(
          res.pendingApproval
            ? t("kazandirmaOnayaGonderildi")
            : t("kazandirildiSiparisOlustu2", { count: res.count ?? 0 }),
        );
        setItemAwardMode(false);
      }
      setNoteAction(null);
    } catch (err) {
      toast.error(extractErrorMessage(err, t("islemBasarisiz")));
    }
  };

  const submitEliminate = async (reason: string) => {
    if (!eliminateTarget) return;
    try {
      await eliminate.mutateAsync({
        bidId: eliminateTarget.bidId,
        reason: reason.trim() || undefined,
      });
      toast.success(t("teklifElendi"));
      setEliminateTarget(null);
    } catch (err) {
      toast.error(extractErrorMessage(err, t("elenemedi")));
    }
  };

  const handleCancelApproval = async () => {
    if (!l?.pendingApprovalId) return;
    if (
      !(await confirm({
        title: t("onayIsteginiIptalEt"),
        description: t("onayIstegiIptalEdilsinMi"),
        confirmLabel: t("iptalEt"),
        destructive: true,
      }))
    )
      return;
    try {
      await cancelApproval.mutateAsync(l.pendingApprovalId);
      toast.success(t("onayIstegiIptalEdildi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("iptalEdilemedi")));
    }
  };

  const handlePublish = async () => {
    // Yayın onayı kaldırıldı — taslak doğrudan yayınlanır.
    // Derin denetim X22: hızlı talep taslağında bekletilen davetler (AI'ın
    // bulduğu adresler/üyeler) yayından SONRA buradan da gönderilir; eskiden
    // yalnız düzenleme kartı gönderiyordu, detaydan yayında sessizce düşüyordu.
    const pending = pendingInvites.read();
    const pendingCount = pending.external.length + pending.members.length;
    if (
      !(await confirm({
        title: t("satinAlmaTalebiniYayinla"),
        description:
          pendingCount > 0
            ? `${t("satinAlmaTalebiYayinlansinMi")} ${t("bekleyenDavetlerYayindaGonderilecek", { n: pendingCount })}`
            : t("satinAlmaTalebiYayinlansinMi"),
        confirmLabel: t("yayinla"),
      }))
    )
      return;
    try {
      await publish.mutateAsync(undefined);
      toast.success(t("satinAlmaTalebiYayinlandi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("yayinlanamadi")));
      return;
    }
    if (pendingCount > 0) await pendingInvites.flush();
  };

  // Kalem-bazlı: bir kalem için fiyat veren teklifler (TRY normalize; artan —
  // en düşük önde/ön-seçili). Karşılaştırma TRY üzerinden; gösterim KALEMİN
  // birimiyle (madde 9: kalem teklifin ana biriminden farklı birimde
  // fiyatlanabilir — derin denetim Y-14; eskiden ana birim + ana birim kuru
  // kullanılıyordu → 100 USD'lik kalem "100 ₺" görünüp ön-seçiliyordu).
  // Kur'suz (null) satırlar kıyaslanamaz → listenin SONUNA (ön-seçilmez).
  const bidsForItem = (itemId: string) =>
    rankBidsForItem(l?.bids ?? [], itemId);

  const itemQtyExceeds = (itemId: string, quantity: string | number) => {
    const q = Number(itemQty[itemId]);
    return Number.isFinite(q) && q > Number(quantity);
  };

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
    // Kalem miktarını aşan kısmi miktar (arayüz testi D-104): sunucu 400
    // verir; onay penceresi açılmadan alan üzerinde söylenir.
    const overQty = items.find(
      (it) => itemWinners[it.id] && itemQtyExceeds(it.id, it.quantity),
    );
    if (overQty) {
      toast.error(t("kazandirilacakMiktarKalemMiktariniAsamaz", { name: overQty.name }));
      return;
    }
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
      toast.error(t("enAzBirKalemIcin"));
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
        extractErrorMessage(err, t("onayDurumuDogrulanamadiTekrarDeneyin")),
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
        title: t("kalemBazliKazandir"),
        description:
          (skipped > 0
            ? t("kalemKazandirilacakKalemSecilmeyenTeklifsiz", { length: itemAwards.length, skipped: skipped })
            : t("kalemBazliKazandirilsinMi")) +
          " " +
          t("buIslemGeriAlinamazKazananFirmaBasina"),
        confirmLabel: t("evetKazandir"),
        destructive: true,
      }))
    )
      return;
    try {
      const res = await awardByItem.mutateAsync({ itemAwards });
      toast.success(
        res.pendingApproval
          ? t("kazandirmaOnayaGonderildi")
          : t("kazandirildiSiparisOlustu2", { count: res.count ?? 0 }),
      );
      setItemAwardMode(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, t("kazandirilamadi")));
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
    if (countryGate) {
      return <CountryNotEligibleCard targetCountries={countryGate.targetCountries} />;
    }
    if (tierRequired) {
      return (
        <div className="mx-auto max-w-3xl">
          <SilverLockCard
            title={t("buHerkeseAcikTalepSilver")}
            description={t("herkeseAcikSatinAlmaTaleplerini2")}
          />
        </div>
      );
    }
    if (notFound) {
      return (
        <div className="mx-auto max-w-3xl rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-center">
          <Text className="text-sm font-medium text-zinc-900">
            {t("satinAlmaTalebineUlasilamiyor")}
          </Text>
          <Text className="mt-1 text-sm text-zinc-500">
            {t("ilanKaldirilmisAdresHataliYa")}
          </Text>
          {!hasBuyView ? (
            <Text className="mt-2 text-sm text-zinc-600">
              {t("kendiFirmaTalebiYetkiNotu")}
            </Text>
          ) : null}
          <Button outline className="mt-3" href="/company">
            {t("paneleDon")}
          </Button>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <Text className="text-sm text-red-700">{t("ilanYuklenemedi")}</Text>
        <Button outline className="mt-3" onClick={() => refetch()}>
          {t("tekrarDene")}
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
        <Text className="text-sm text-zinc-500">{t("ilanBulunamadi")}</Text>
      </div>
    );
  }

  // Tutar + teklifin KENDİ para birimi (yoksa talebin); sembolün yeri dilden
  // (`affixCurrency`: İngilizcede önde).
  const withCur = (formatted: string, cur?: string | null) =>
    affixCurrency(formatted, cur || l.primaryCurrency || "TRY", intl);
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
  // Kazandırılabilir teklif: canlı (SUBMITTED) ∧ geçerliliği dolmamış — kalem
  // seçimi, hücre, "En iyi" rozeti ve tasarruf kıyası aynı kuralı okur
  // (arayüz testi O-090; sunucu `bidValidUntilMs` ile 400 verir).
  const isAwardableBid = (b: {
    status: string;
    submittedAt?: string | null;
    validityDays?: number | null;
  }) => b.status === "SUBMITTED" && !isBidExpired(b);
  // Yayında ve Değerlendirmede (IN_AWARD) kazandırma/eleme açık.
  const canDecide = l.status === "OPEN" || l.status === "IN_AWARD";
  // LOST teklifin etiketi: yalnız alıcının elediği "Elendi"; kazandırmada
  // kaybeden "Kaybetti", kazanansız/iptal kapanan "Kapandı" (arayüz testi D-102).
  const lostLabel = (b: { eliminatedAt?: string | null }) => {
    const outcome = lostBidOutcome(b, l.status);
    return outcome === "eliminated"
      ? t("elendi")
      : outcome === "lost"
        ? t("kaybetti")
        : t("kapandiTeklif");
  };
  // Kazandırma doğrulanmış firma ister (API assertVerified; KYC tablosu).
  // Firma yüklenmeden kilit basılmaz (sunucu zaten kapılı).
  const companyVerified =
    !company || company.companyVerificationStatus === "VERIFIED";
  // İncelemedeki (PENDING) firmaya "Doğrulamayı tamamlayın" denmez — düğme
  // yine pasif, not bağlantısız "inceleniyor" der (buyingGate/SilverLockCard
  // ile aynı kural).
  const verificationPending = company?.companyVerificationStatus === "PENDING";
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
    // Geçerliliği dolmuş teklif kazandırılamaz → toplu kıyasa da girmez (O-090).
    const bids = (l.bids ?? []).filter(isAwardableBid);
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
  // Şerit TALEBİN biriminde gösterilir (2026-09-27): kıyas TRY karşılığıyla
  // (teklif damgası) yapılır, tutar talep birimine o birimdeki teklifin
  // damgasıyla geri çevrilir. Damga yoksa (henüz o birimde teklif yok) TRY
  // karşılığı kalır — etiket hangisi olduğunu söyler. Eskiden EUR talepte
  // "₺ (TRY karşılığı)" basılıyordu.
  const stripRate =
    !l.primaryCurrency || l.primaryCurrency === "TRY"
      ? 1
      : ((l.bids ?? [])
          .map((b) => (b.currency === l.primaryCurrency ? bidRate(b) : null))
          .find((r): r is number => r != null && r > 0) ?? null);
  const stripCurrency = stripRate != null ? (l.primaryCurrency ?? "TRY") : "TRY";
  const toStrip = (vTry: number) => (stripRate != null ? vTry / stripRate : vTry);
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
            {itemSearch.trim()
              ? t("kalemlerSuzulmus", { visible: visibleItems.length, total: l.items.length })
              : t("kalemlerSayi", { count: l.items.length })}
          </Subheading>
          <div className="flex items-center gap-2">
            {l.items.length > ITEM_SEARCH_THRESHOLD ? (
              <SearchInput
                value={itemSearch}
                onChange={setItemSearch}
                placeholder={t("kalemAra")}
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
                disabled={saveToCatalog.isPending || catalogLock.locked}
                onClick={() => {
                  void catalogLock.run(() =>
                    saveToCatalog.mutateAsync(l.id).then(
                    (r) => {
                      if (r.added === 0) {
                        toast.info(
                          r.skipped > 0
                            ? t("buKalemlerKatalogunuzdaZatenVar")
                            : t("katalogaEklenecekKalemBulunamadi"),
                        );
                      } else {
                        toast.success(
                          r.skipped > 0
                            ? t("kalemKatalogaEklendiZatenVardi", { added: r.added, skipped: r.skipped })
                            : t("kalemKatalogaEklendi", { added: r.added }),
                        );
                      }
                    },
                    (err) =>
                      toast.error(
                        extractErrorMessage(err, t("katalogaKaydedilemedi")),
                      ),
                    ),
                  );
                }}
              >
                <PackagePlus className="h-4 w-4" />
                {t("katalogaKaydet")}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="card px-2 [--gutter:--spacing(4)]">
          <Table dense>
            <TableHead>
              <TableRow>
                <TableHeader>#</TableHeader>
                <TableHeader>{t("kalem")}</TableHeader>
                <TableHeader className="hidden text-right sm:table-cell">
                  {t("miktar")}
                </TableHeader>
                <TableHeader className="hidden text-right sm:table-cell">
                  {t("hedefFiyat")}
                </TableHeader>
                {showMyPriceCol ? (
                  <TableHeader className="text-right">
                    {t("benimBirimFiyatim")}
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
                    {t("aramanizlaEslesenKalemYok")}
                  </TableCell>
                </TableRow>
              ) : null}
              {visibleItems.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="text-zinc-400">{it.lineNo}</TableCell>
                  <TableCell className="whitespace-normal sm:whitespace-nowrap">
                    <div className="font-medium text-zinc-900">{it.name}</div>
                    {/* Mobilde miktar ve hedef fiyat sütunları gizli; ad altında
                        gösterilir, kaydırılan tabloda kırpılmaz (D-122). */}
                    <div className="mt-0.5 text-xs tabular-nums text-zinc-600 sm:hidden">
                      {t("miktar")}: {quantity(it.quantity, it.unit, it.unitCode)}
                      {it.targetPrice
                        ? ` · ${t("hedefFiyat")}: ${fmtMoney(it.targetPrice, l.primaryCurrency ?? "TRY")}`
                        : null}
                    </div>
                    {it.materialCode ? (
                      <div className="tabular-nums text-xs text-zinc-500">
                        {it.materialCode}
                      </div>
                    ) : null}
                    {it.description ? (
                      <div className="text-xs text-zinc-500">{it.description}</div>
                    ) : null}
                    {/* Alıcının kalem şartları (arayüz testi O-037): marka ·
                        parça no, muadil izni ve istenen teslim tarihi detayda
                        da görünür — teklif formuyla aynı anahtarlar. */}
                    {it.brand || it.mpn ? (
                      <div className="text-xs text-zinc-600">
                        {t("markaParcaNo", {
                          value: [it.brand, it.mpn].filter(Boolean).join(" · "),
                        })}
                      </div>
                    ) : null}
                    {it.requiredByDate ? (
                      <div className="text-xs text-zinc-600">
                        {t("istenenTeslim", {
                          date: formatDate(
                            `${it.requiredByDate.slice(0, 10)}T12:00:00+03:00`,
                            locale,
                          ),
                        })}
                      </div>
                    ) : null}
                    {it.alternativeAllowed === false ? (
                      <div className="mt-1 inline-flex">
                        <Badge color="amber">{t("muadilKabulEdilmez")}</Badge>
                      </div>
                    ) : null}
                    {/* Sorular dokunarak açılır (arayüz testi O-037/D-278):
                        eskiden yalnız `title` ipucundaydı, mobilde okunamıyordu. */}
                    {it.questions && it.questions.length > 0 ? (
                      <details className="group mt-1 text-xs">
                        <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-700 hover:bg-zinc-200 [&::-webkit-details-marker]:hidden">
                          {t("soru", { n: it.questions.length })}
                          <ChevronRight
                            aria-hidden
                            className="size-3 transition-transform group-open:rotate-90"
                          />
                        </summary>
                        <ul className="mt-1 max-w-md list-disc space-y-0.5 pl-4 whitespace-normal text-zinc-600">
                          {it.questions.map((q) => (
                            <li key={q.id}>
                              {q.text}
                              {q.required ? (
                                <span className="ml-1 text-zinc-500">{t("zorunlu")}</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums text-zinc-700 sm:table-cell">
                    {quantity(it.quantity, it.unit, it.unitCode)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums text-zinc-700 sm:table-cell">
                    {it.targetPrice
                      ? fmtMoney(it.targetPrice, l.primaryCurrency ?? "TRY")
                      : "—"}
                  </TableCell>
                  {showMyPriceCol ? (
                    <TableCell className="text-right font-medium tabular-nums text-zinc-900">
                      {(() => {
                        const bi = myPriceByItem.get(it.id);
                        return bi && Number(bi.unitPrice) > 0
                          ? fmtMoney(
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
          {t("davetliTedarikciler", { length: l.invitations.length })}
        </Subheading>
        <div className="flex flex-wrap gap-2">
          {l.invitations.map((iv) => (
            <span
              key={iv.rothernId ?? iv.companyName}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
            >
              {iv.companyName}{" "}
              <span className="tabular-nums text-xs text-zinc-500">
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
  // "Teklif Veren" = gönderilmiş her teklif (taslak/geri çekilmiş hariç).
  // Eskiden yalnız SUBMITTED sayılıyordu → kazandırma sonrası dört sayaç da
  // "0" okunuyordu (2026-09-19, kullanıcı ekran görüntüsü). Kararı bekleyen
  // sayı (SUBMITTED) ayrı: `submittedCount` yalnız durum bandında.
  const consideredBids = allBids.filter((b) => b.status !== "DRAFT" && b.status !== "WITHDRAWN");
  const submittedCount = allBids.filter((b) => b.status === "SUBMITTED").length;
  const bidderCount = consideredBids.length;
  const completeCount = consideredBids.filter(
    (b) =>
      bidItemCount > 0 &&
      (b.items?.filter((x) => Number(x.unitPrice) > 0).length ?? 0) >=
        bidItemCount,
  ).length;
  const incompleteCount = Math.max(0, bidderCount - completeCount);
  // Kalem karşılaştırma için fiyat haritaları (bidId → itemId → fiyat). Hücre
  // başına .find yerine tek seferde kurup O(1) erişim (matris perf).
  //  - priceMap: KALEMİN kendi birimindeki birim fiyat (gösterim).
  //  - priceTryMap: TRY karşılığı (satır içi min karşılaştırması — çok birim;
  //    kalem birimi ana birimden farklıysa fxToBase damgasıyla — Y-14).
  //  - currencyMap: kalemin birimi (null = teklifin ana birimi).
  const priceMap = new Map<string, Map<string, number>>();
  const priceTryMap = new Map<string, Map<string, number>>();
  const currencyMap = new Map<string, Map<string, string>>();
  //  - altMap: yalnız MUADİL beyanlı kalemler (derin denetim Y-16).
  const altMap = new Map<string, Map<string, ListingBidItemRow>>();
  for (const b of allBids) {
    const inner = new Map<string, number>();
    const innerTry = new Map<string, number>();
    const innerCur = new Map<string, string>();
    const innerAlt = new Map<string, ListingBidItemRow>();
    for (const bi of b.items ?? []) {
      inner.set(bi.itemId, Number(bi.unitPrice));
      const vTry = bidItemUnitPriceTry(b, bi);
      if (vTry != null) innerTry.set(bi.itemId, vTry);
      innerCur.set(bi.itemId, bidItemCurrency(b, bi));
      if (bi.isAlternative) innerAlt.set(bi.itemId, bi);
    }
    priceMap.set(b.id, inner);
    priceTryMap.set(b.id, innerTry);
    currencyMap.set(b.id, innerCur);
    altMap.set(b.id, innerAlt);
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
      .filter((b) => isAwardableBid(b) && cmpFullCovered(b.id))
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
        isAwardableBid(b) &&
        amountTryOf(b) != null &&
        cmpFullCovered(b.id),
    );
    if (subs.length === 0) return null;
    const sorted = [...subs].sort(
      (a, b) => amountTryOf(a)! - amountTryOf(b)!,
    );
    return sorted[0]?.id ?? null;
  })();

  // Kalem bazlı kazandırmada bir sipariş reddedildi ama öteki sürüyor →
  // talep AWARDED kalır (CLAUDE.md §7 İ-1). Sahip reddedilen siparişi,
  // gerekçeyi ve tedariksiz kalan kalemleri görmeli (arayüz testi O-028).
  const rejectedOrders =
    l.status === "AWARDED"
      ? (l.orders ?? []).filter((o) => o.status === "REJECTED")
      : [];
  const liveOrderItemNames = new Set(
    (l.orders ?? [])
      .filter((o) => o.status !== "REJECTED" && o.status !== "CANCELLED")
      .flatMap((o) => o.itemNames ?? []),
  );
  const unsuppliedItems = (l.items ?? []).filter(
    (it) =>
      rejectedOrders.some((o) => (o.itemNames ?? []).includes(it.name)) &&
      !liveOrderItemNames.has(it.name),
  );
  const rejectedSellerName = (sellerCompanyId?: string | null) =>
    (l.bids ?? []).find((b) => b.bidderCompanyId === sellerCompanyId)
      ?.bidderName ?? t("tedarikci");
  // Yeni talep Gold ∧ buy:listing:manage ister (paket kilidi buyLock aşağıda).
  const canStartReorder =
    hasManagePermission &&
    !!company &&
    buyingGate(user, company, "listing") === "ok";
  const rejectedOrdersBand =
    rejectedOrders.length > 0 ? (
      <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-semibold">{t("siparisReddedildiKalemlerTedariksiz")}</p>
        {rejectedOrders.map((o) => (
          <p key={o.id}>
            {t("siparisiReddetti", {
              seller: rejectedSellerName(o.sellerCompanyId),
              number: o.number ?? "—",
            })}
            {o.rejectedReason ? (
              <span className="block text-amber-800">
                {t("redGerekcesi", { reason: o.rejectedReason })}
              </span>
            ) : null}
          </p>
        ))}
        {unsuppliedItems.length > 0 ? (
          <p>
            {t("tedariksizKalemler", {
              items: unsuppliedItems.map((it) => it.name).join(", "),
            })}
          </p>
        ) : null}
        {canStartReorder && unsuppliedItems.length > 0 ? (
          <Button
            outline
            href={`/company/satinalma/taleplerim/yeni?from=${encodeURIComponent(l.id)}&kalemler=${unsuppliedItems
              .map((it) => encodeURIComponent(it.id))
              .join(",")}`}
          >
            {t("buKalemlerleYeniTalepOlustur")}
          </Button>
        ) : null}
      </div>
    ) : null;

  const visibleBids = (l.bids ?? []).filter((b) => {
    const covered =
      bidItemCount > 0 &&
      (b.items?.filter((x) => Number(x.unitPrice) > 0).length ?? 0) >=
        bidItemCount;
    if (bidView === "complete") return covered;
    if (bidView === "incomplete") return !covered;
    return true;
  });

  const ownerBidsSection = (
    <section className="space-y-3">
      <p className="text-xs text-zinc-400">{td("kdvHaricNote")}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Subheading>{t("gelenTeklifler", { count: l.bids?.length ?? 0 })}</Subheading>
          {l.english?.isEnglishAuction ? (
            <Badge color="amber">{t("tur3", { currentRound: l.english.currentRound })}</Badge>
          ) : null}
        </div>
      </div>

      {/* Durum bandı (eski sistemle aynı) */}
      {l.status === "OPEN" ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          {t("yayindaYeniTekliflerGeldikce")}
        </div>
      ) : l.status === "IN_AWARD" ? (
        <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm text-purple-800">
          {t("degerlendirmeAsamasiTeklifKarariniziBekliyor", { submittedCount: submittedCount })}
        </div>
      ) : l.status === "CLOSED" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {t("ilanPlatformYoneticisiTarafindanTeklifeKapatildi")}{" "}
          {l.cancelReason ? `${t("gerekce", { cancelReason: l.cancelReason })} ` : ""}
          {t("sorularinizIcinDestekIle")}
        </div>
      ) : l.status === "AWARDED" ? (
        rejectedOrdersBand ?? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
            {t("talepKazandirildiSiparisOlusturulduSiparisle")}
          </div>
        )
      ) : l.status === "CLOSED_NO_AWARD" ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-700">
          {t("kazananOlmadanKapatildi")}{" "}
          {l.cancelReason ? t("sebep", { cancelReason: l.cancelReason }) : ""}
        </div>
      ) : null}

      {/* Doğrulaması olmayan alıcı: Kazandır düğmeleri pasif, neden burada
          (arayüz testi D-044; API assertVerified 403 verirdi). */}
      {canDecide && canManage && hasAwardPermission && !companyVerified ? (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-900 ring-1 ring-amber-600/20">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {verificationPending
              ? t("dogrulamaIncelemedeOnaylanincaYayinlayipKazandirabilirsiniz")
              : t.rich("kazandirmakIcinFirmaDogrulamasiGerekir", {
                  link: (c) => (
                    <Link href={VERIFY_HREF} className="font-semibold underline">
                      {c}
                    </Link>
                  ),
                })}
          </span>
        </p>
      ) : null}

      {/* KPI kartları */}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: t("davetEdilen"), value: invitedCount },
          { label: t("teklifVeren"), value: bidderCount },
          { label: t("tamamina"), value: completeCount },
          { label: t("eksikVeren"), value: incompleteCount },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-zinc-950/5 bg-white px-4 py-3"
          >
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              {k.label}
            </dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">
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
              {cmpSearch.trim()
                ? t("kalemKarsilastirmaSuzulmus", { visible: cmpItems.length, total: l.items.length })
                : t("kalemKarsilastirma")}
            </Subheading>
            {l.items.length > ITEM_SEARCH_THRESHOLD ? (
              <SearchInput
                value={cmpSearch}
                onChange={setCmpSearch}
                placeholder={t("kalemAra")}
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
                    {t("kalem")}
                  </TableHeader>
                  {l.bids.map((b) => {
                    const priced = pricedCountById.get(b.id) ?? 0;
                    const totalItems = l.items?.length ?? 0;
                    return (
                      <TableHeader
                        key={b.id}
                        className="sticky top-0 z-10 bg-white text-right whitespace-normal shadow-table-top"
                      >
                        {/* Firma adı özel addır — başlığın CSS büyük harfi
                            EN/RU'da Türkçe harfleri bozuyordu ("TEDARIKÇI";
                            arayüz testi D-108). */}
                        <span className="normal-case">{b.bidderName}</span>
                        {/* Elenmiş teklif sütunu işaretli (derin denetim
                            LU-21) — fiyatları kıyasa girmez. */}
                        {b.status === "LOST" ? (
                          <span className="block text-xs font-medium text-zinc-500">
                            {lostLabel(b)}
                          </span>
                        ) : null}
                        {/* 2026-09-01: davetli/bağlantılı firma BELGESİZ
                            teklif verebiliyor. Alıcı bunu KAZANDIRMADAN ÖNCE
                            görmeli — aksi hâlde sipariş doğduktan sonra
                            öğrenir. Uyarı değil BİLGİ: alıcı zaten kendi
                            davet ettiği firmayı çoğu zaman umursamayacak. */}
                        {b.bidderVerified === false ? (
                          <span
                            className="block text-xs font-medium text-zinc-500"
                            title={t("buFirmaninBelgeDogrulamasiTamamlanmadi")}
                          >
                            {t("dogrulanmamisFirma")}
                          </span>
                        ) : null}
                        {priced < totalItems ? (
                          <span
                            className="block text-xs font-medium text-amber-600"
                            title={t("buTeklifTumKalemleriFiyatlamadi")}
                          >
                            {t("kalemOrani", { priced, total: totalItems })}
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
                      {t("aramanizlaEslesenKalemYok")}
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
                      // Kazandırılabilir (geçerliliği dolmamış) — seçim ve
                      // en iyi vurgusu yalnız bunlarda (O-090).
                      awardable: isAwardableBid(b),
                      price: v != null ? v : null,
                      priceTry: vTry != null ? vTry : null,
                      currency:
                        currencyMap.get(b.id)?.get(it.id) ?? b.currency,
                      // Muadil beyanı (derin denetim Y-16): fiyat aynı
                      // ürüne ait değilse alıcı hücrede görmeli.
                      bidItem: altMap.get(b.id)?.get(it.id),
                    };
                  });
                  // En iyi TRY karşılığı vurgulanır (birimler arası adil):
                  // en düşük. Karar aşamasında yalnız canlı (SUBMITTED)
                  // teklifler kıyaslanır — elenmiş teklif "en iyi" diye
                  // boyanmaz; toplam satırı / "En iyi" rozetiyle tutarlı
                  // (derin denetim LU-21).
                  const validTry = (canDecide ? cells.filter((c) => c.awardable) : cells)
                    .map((c) => c.priceTry)
                    .filter((p): p is number => p != null && p > 0);
                  const minTry = validTry.length ? Math.min(...validTry) : null;
                  return (
                    <TableRow key={it.id}>
                      <TableCell className="sticky left-0 z-[1] bg-white whitespace-normal text-zinc-900">
                        {it.name}{" "}
                        <span className="text-xs whitespace-nowrap text-zinc-400">
                          ({quantity(it.quantity, it.unit, it.unitCode)})
                        </span>
                      </TableCell>
                      {cells.map((c) => {
                        const priceText =
                          c.price != null
                            ? withCur(c.price.toLocaleString(intl, MONEY_FRACTION), c.currency)
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
                          c.awardable &&
                          c.price != null &&
                          c.price > 0;
                        const selected =
                          itemAwardMode && itemWinners[it.id] === c.bidId;
                        return (
                          <TableCell
                            key={c.bidId}
                            className={cn(
                              "whitespace-nowrap text-right tabular-nums",
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
                                aria-label={t("icinTeklifiniSec", { name: it.name, bidderName: c.bidderName })}
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
                            <AlternativeOfferNote bidItem={c.bidItem} compact />
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
                    {t("teklifToplami")}
                  </TableCell>
                  {l.bids.map((b) => {
                    const tTry = totalTryById.get(b.id);
                    const isBest =
                      bestTotalTry != null &&
                      tTry != null &&
                      isAwardableBid(b) &&
                      cmpFullCovered(b.id) &&
                      tTry === bestTotalTry;
                    return (
                      <TableCell
                        key={b.id}
                        className={cn(
                          "sticky bottom-0 z-10 bg-zinc-50 whitespace-nowrap text-right tabular-nums shadow-table-bottom",
                          isBest
                            ? "font-bold text-emerald-700"
                            : "font-semibold text-zinc-900",
                        )}
                      >
                        {withCur(Number(b.amount).toLocaleString(intl, MONEY_FRACTION), b.currency)}
                        {isBest ? (
                          <span className="block text-xs font-semibold text-emerald-600">
                            {t("enIyiToplam")}
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
                {t.rich("kalemBazliDagitimEkTasarrufSaglamiyor", {
                  amount: fmtMoney(toStrip(itemSavings.bestTotal), stripCurrency),
                  strong: (c) => <strong>{c}</strong>,
                })}
                <span className="ml-1 text-xs text-zinc-500">
                  {t("karsiligiylaCur", { currency: stripCurrency })}
                </span>
              </p>
            </div>
          ) : itemSavings?.kind === "ok" ? (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p>
                {t.rich("kalemBazliDagitimTasarruf", {
                  itemized: fmtMoney(toStrip(itemSavings.itemized), stripCurrency),
                  bestTotal: fmtMoney(toStrip(itemSavings.bestTotal), stripCurrency),
                  pct: formatPercent(itemSavings.pct, locale, { maximumFractionDigits: 1 }),
                  strong: (c) => <strong>{c}</strong>,
                })}
                <span className="ml-1 text-xs text-emerald-700/80">
                  {t("karsiligiylaCur", { currency: stripCurrency })}
                </span>
              </p>
            </div>
          ) : itemSavings?.kind === "missing" ? (
            <p className="text-xs text-zinc-400">
              {t("kalemdeFiyatliTeklifYokToplu", { missingItems: itemSavings.missingItems })}
            </p>
          ) : null}
          {itemAwardMode ? (
          <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
            <Subheading>{t("kalemBazliKazandirma")}</Subheading>
            <Text className="text-xs text-zinc-500">
              {t("herKalemIcinKazananTeklifi")}
            </Text>
            <div className="space-y-2">
              {l.items.map((it) => {
                const opts = bidsForItem(it.id);
                const qtyOver = itemQtyExceeds(it.id, it.quantity);
                // Mobilde (390 px) satır dikey dizilir, seçici daralabilir —
                // tek satırlık düzen sayfayı 555 px'e genişletiyordu (O-091).
                return (
                  <div
                    key={it.id}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                  >
                    <span className="min-w-0 text-sm text-zinc-900">
                      {it.name}
                      <span className="ml-1 text-xs text-zinc-500">
                        ({quantity(it.quantity, it.unit, it.unitCode)})
                      </span>
                    </span>
                    <div className="flex min-w-0 flex-col gap-1 sm:items-end">
                    <div className="flex min-w-0 items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={Number(it.quantity)}
                        step="0.001"
                        placeholder={t("miktar")}
                        aria-label={t("icinKazandirilacakMiktarBosTam", { name: it.name })}
                        aria-invalid={qtyOver || undefined}
                        title={t("kismiMiktarBosTam")}
                        value={itemQty[it.id] ?? ""}
                        onChange={(e) =>
                          setItemQty((q) => ({ ...q, [it.id]: e.target.value }))
                        }
                        className={cn(
                          "w-24 shrink-0 rounded-md border px-2 py-1 text-right text-sm",
                          qtyOver ? "border-red-500 text-red-700" : "border-zinc-300",
                        )}
                      />
                      <SelectMenu
                        value={itemWinners[it.id] ?? ""}
                        ariaLabel={t("icinKazananTeklif", { name: it.name })}
                        onChange={(v) =>
                          setItemWinners((w) => ({ ...w, [it.id]: v }))
                        }
                        className="min-w-0 flex-1 sm:w-auto sm:min-w-48 sm:flex-none"
                        options={[
                          { value: "", label: t("sec") },
                          ...opts.map((o) => ({
                            value: o.bidId,
                            label: `${o.bidderName} · ${fmtMoney(o.price, o.currency ?? "TRY")}`,
                          })),
                        ]}
                      />
                    </div>
                    {qtyOver ? (
                      <p role="alert" className="text-xs text-red-600">
                        {t("kazandirilacakMiktarEnFazla", {
                          qty: quantity(it.quantity, it.unit, it.unitCode),
                        })}
                      </p>
                    ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <Button plain onClick={() => setItemAwardMode(false)}>
                {t("vazgec")}
              </Button>
              <Button
                onClick={handleAwardByItem}
                disabled={awardByItem.isPending || !companyVerified}
              >
                {t("onaylaKazandir")}
              </Button>
            </div>
          </div>
          ) : hasAwardPermission ? (
            <Button
              outline
              onClick={startItemAward}
              disabled={!companyVerified}
              title={companyVerified ? undefined : t("kazandirmakIcinDogrulamaGerekirKisa")}
            >
              {t("kalemBazliKazandir2")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {!l.bids || l.bids.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-8 text-center">
          <Text className="text-sm text-zinc-500">{t("henuzTeklifYok")}</Text>
        </div>
      ) : (
        <div className="space-y-2">
          {/* İhale bazlı sıralama — Tümü / Tamamına / Eksik */}
          <div className="flex items-center gap-1 text-xs">
            {(
              [
                ["all", t("tumu", { bidderCount: bidderCount })],
                ["complete", t("tamamina2", { completeCount: completeCount })],
                ["incomplete", t("eksik", { incompleteCount })],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={bidView === key}
                onClick={() => setBidView(key)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  bidView === key
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {visibleBids.length === 0 ? (
            // Süzgece uyan teklif yok — boş alan metinsiz kalıyordu (D-109).
            <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500">
              {t("buSuzgeceUyanTeklifYok")}
            </p>
          ) : null}
          {visibleBids
            .map((b) => {
            // Geçerliliği dolmuş teklif kazandırılamaz (sunucu da reddeder);
            // rozetle aynı hesap. Pazarlıkta validityDays null → süresiz.
            const bidExpired = isBidExpired(b);
            return (
            // SATIR DÜZENİ (2026-09-19, kullanıcı: "daha nizami"): solda
            // her satırda AYNI yerde durum pili → firma adı → küçük meta
            // rozetler; sağda tutar (kalın) | ayraç | Mesaj · Ele · Kazandır.
            <div
              key={b.id}
              className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-xl border border-zinc-950/10 bg-white px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                {b.status === "SUBMITTED" ? <Badge color="violet">{t("degerlendirmede")}</Badge> : null}
                {b.status === "WON" ? <Badge color="green">{t("kazandi")}</Badge> : null}
                {b.status === "AWARDED_PARTIAL" ? (
                  <Badge color="green">{t("kismenKazandi")}</Badge>
                ) : null}
                {b.status === "LOST" ? <Badge color="zinc">{lostLabel(b)}</Badge> : null}
                <Link
                  href={`/company/ilan/${l.id}/teklif/${b.id}${bidViewQuery(bidView)}`}
                  className="text-[15px] font-semibold text-zinc-950 hover:text-blue-700 hover:underline"
                >
                  {b.bidderName}
                </Link>
                {b.id === bestBidId && canDecide ? (
                  <Badge color="green">{t("enIyi")}</Badge>
                ) : null}
                {/* Farklı ülkeden tedarikçi (2026-09-21): navlun/gümrük farkı
                    olabilir — alıcı kıyaslarken görsün. */}
                {b.bidderCountry && company?.country && b.bidderCountry !== company.country ? (
                  <Badge color="zinc">{countryDisplayName(b.bidderCountry, locale)}</Badge>
                ) : null}
                {/* Geçerlilik dolmuş canlı teklif — alıcı kazandırmadan önce
                    görsün (son gün = submittedAt + validityDays). */}
                {bidExpired ? <Badge color="amber">{t("gecerlilikDoldu")}</Badge> : null}
                {l.english?.isEnglishAuction && b.round ? (
                  <Badge color="zinc">{t("tur2", { round: b.round })}</Badge>
                ) : null}
                {/* v{n} rozeti kaldırıldı — teknik gürültü; Tur rozeti
                    güncellenmişlik bilgisini zaten veriyor. */}
                {/* Kısmi kapsam: toplamı diğerleriyle kıyaslanamaz — "En iyi"
                    kıyasına girmez (tablo başlığındaki rozetle aynı kural). */}
                {b.status === "SUBMITTED" &&
                bidItemCount > 0 &&
                !cmpFullCovered(b.id) ? (
                  <Badge color="amber">
                    {t("kalemOrani", { priced: pricedCountById.get(b.id) ?? 0, total: bidItemCount })}
                  </Badge>
                ) : null}
                {/* Muadil beyanlı kalem sayısı (derin denetim Y-16) — ayrıntı
                    karşılaştırma tablosunda ve teklif detayında. */}
                {(altMap.get(b.id)?.size ?? 0) > 0 ? (
                  <Badge color="amber" title={t("muadilRozetAciklama")}>
                    {t("muadilKalemSayisi", { count: altMap.get(b.id)?.size ?? 0 })}
                  </Badge>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-3">
                <span className="text-base font-bold tabular-nums text-zinc-950">
                  {fmtMoney(b.amount, b.currency ?? "TRY")}
                  {b.currency && b.currency !== "TRY" && b.amountTry ? (
                    <span className="ml-1 text-xs font-normal text-zinc-500">
                      ≈ {fmtMoney(b.amountTry, "TRY")}
                      {/* Kur arayüz dilinin ondalık ayracıyla (TR "49,0184";
                          arayüz testi D-107). */}
                      {b.exchangeRateSnapshot
                        ? ` ${t("kur", {
                            exchangeRateSnapshot: formatNumber(
                              Number(b.exchangeRateSnapshot),
                              locale,
                              { maximumFractionDigits: 4 },
                            ),
                          })}`
                        : ""}
                    </span>
                  ) : null}
                </span>
                <span aria-hidden className="hidden h-6 w-px bg-zinc-200 sm:block" />
                {b.bidderCompanyId ? (
                  <Link
                    href={`/company/mesajlar?with=${b.bidderCompanyId}&portal=satinalma`}
                    className="text-sm font-semibold text-blue-600 hover:underline"
                  >
                    {t("mesaj")}
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
                      {t("ele")}
                    </Button>
                    {hasAwardPermission ? (
                      <Button
                        onClick={() => handleAward(b.id, b.bidderName)}
                        disabled={award.isPending || bidExpired || !companyVerified}
                        title={
                          bidExpired
                            ? t("teklifinGecerlilikSuresiDolmusTedarikciden")
                            : !companyVerified
                              ? t("kazandirmakIcinDogrulamaGerekirKisa")
                              : undefined
                        }
                      >
                        {t("kazandir")}
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </div>
              {/* Süresi dolmuş teklifin nedeni yalnız title'daydı (mobilde
                  görünmez) — satırda okunur not (arayüz testi D-251). */}
              {bidExpired && canDecide && canManage && hasAwardPermission ? (
                <p className="text-xs text-amber-700 sm:col-span-2">
                  {t("teklifinGecerlilikSuresiDolmusTedarikciden")}
                </p>
              ) : null}
              {/* Teklif ekleri — satır başlığına sıkışmasın diye KENDİ
                  satırında (isim/rozet kümesinin içinde dosya çipi kafa
                  karıştırıyordu). Tam liste teklif detayında. */}
              {(bidDocs.data ?? []).some((d) => d.bidId === b.id) ? (
                <div className="flex w-full flex-wrap items-center gap-2 border-t border-zinc-100 pt-2 sm:col-span-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {t("teklifEkleri")}
                  </span>
                  {(bidDocs.data ?? [])
                    .filter((d) => d.bidId === b.id)
                    .map((d) => (
                      <a
                        key={d.id}
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        title={`${docKindLabel(d.kind)}: ${d.fileName}`}
                        className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-blue-600 hover:underline"
                      >
                        <span aria-hidden="true">📎</span>{" "}
                        {docKindLabel(d.kind)} —{" "}
                        {d.fileName.length > 16
                          ? `${d.fileName.slice(0, 14)}…`
                          : d.fileName}
                      </a>
                    ))}
                </div>
              ) : null}
            </div>
          );
          })}
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
          {t("teklifBelgeleri", { length: myDocs.length })}
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
      return { label: t("teklifVer"), href: bidHref };
    if (st === "DRAFT")
      return { label: t("taslagaDevamEt"), href: bidHref };
    if (st === "LOST")
      return { label: t("yenidenTeklifVer"), href: bidHref };
    if (st === "SUBMITTED" && l.english?.isEnglishAuction)
      return { label: t("yeniTeklifVer"), href: bidHref };
    // Yeni tura taşınmış RFQ teklifi: turda bir kez revize (sunucu kuralı).
    if (st === "SUBMITTED" && l.myBid.canReviseCarried)
      return { label: t("yeniTeklifVer"), href: bidHref };
    return null; // SUBMITTED RFQ (değişiklik yok) / WITHDRAWN
  })();
  // Pazarlıkta tur hakkı kullanıldıysa CTA pasif — yeni tur garanti değil.
  const bidCtaDisabled =
    !!l.english?.isEnglishAuction &&
    l.myBid?.status === "SUBMITTED" &&
    l.nextBidConstraint?.canBidThisRound === false;

  const sellerBidSection = (
    <section className="space-y-3">
      {/* Doğrulama teşviki (2026-09-28) — teklif verebilen doğrulanmamış firma.
          Gönderim doğrulama İSTİYORSA (D-028) teklif formundaki engelleyici
          kartın aynısı (yeniden doğrulama webC-01). */}
      {l.canBid && l.roleAllowsBid !== false && biddingOpen ? (
        <VerifyNudge required={!!l.bidRequiresVerification} />
      ) : null}
      {/* Paket/rol uyarıları yalnız teklif alımı açıkken — tamamlanmış talepte
          "Satışçı rolü gerekir" yanıltıcıydı (arayüz testi D-195). */}
      {!l.canBid && biddingOpen ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <Text className="text-sm text-amber-800">
            {t.rich("buIlanaTeklifVermekIcinSilverPaketi", {
              strong: (c) => <strong>{c}</strong>,
            })}
          </Text>
          <Button href={PRICING_HREF} className="shrink-0">
            {t("paketleriGor")}
          </Button>
        </div>
      ) : l.roleAllowsBid === false && biddingOpen ? (
        // Rol kapısı: sessiz buton yokluğu yerine açık yönlendirme.
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <Text className="text-sm text-amber-800">
            {t.rich("buAcikTalebeTeklifVermekIcinTeklifVermeYetkisi", {
              strong: (c) => <strong>{c}</strong>,
            })}
          </Text>
        </div>
      ) : (l.myBid?.status === "SUBMITTED" &&
          biddingOpen &&
          !l.english?.isEnglishAuction) ||
        bidDocsSection != null ? (
        // İçeriksiz beyaz kutu render etme: kapalı zarf notu sayfa
        // bandına taşındı (2026-09-19), kutu yalnız gönderilmiş teklif notu
        // ya da teklif belgesi varken çizilir.
        <div className="space-y-4 rounded-xl border border-zinc-950/10 bg-white p-5">
          {/* CTA butonu sekmenin EN ÜSTÜNE taşındı (aşağıdaki panel) —
              burada yalnız RFQ notları / belgeler kalır. */}
          {l.myBid?.status === "SUBMITTED" &&
          biddingOpen &&
          !l.english?.isEnglishAuction ? (
            <>
              <Text className="text-xs text-zinc-500">
                {l.myBid.canReviseCarried
                  ? t("tasinanTeklifBirKezRevize")
                  : t("gonderilmisTeklifGeriCekilemez")}
              </Text>
              <div className="rounded-lg bg-zinc-50 px-3 py-2">
                <Text className="text-sm">
                  {t.rich("mevcutTeklifin", {
                    money: fmtMoney(l.myBid.amount, l.myBid.currency ?? "TRY"),
                    strong: (c) => <strong>{c}</strong>,
                  })}
                </Text>
              </div>
            </>
          ) : null}
          {/* Pazarlıkta alttaki kural kutusu KALDIRILDI (bayat 'güncel en
              düşük' iddiası — kural kendi öncekinden düşük); kapalı zarf
              notu RFQ'da kalır. */}
          {/* Kapalı zarf notu sayfa düzeyindeki banda taşındı (2026-09-19). */}
          {bidDocsSection}
        </div>
      ) : null}
    </section>
  );

  // "Kazandırma Onayı" alıcının İÇ onay adımıdır — teklif veren onu
  // "Değerlendirmede" görür (arayüz testi D-278; seller-state ile aynı kural).
  const shownStatus =
    !l.isOwner && l.status === "IN_AWARD_APPROVAL" ? "IN_AWARD" : l.status;
  const statusMeta = {
    label: listingStatusLabel(shownStatus),
    color: LISTING_STATUS_COLOR[shownStatus] ?? ("zinc" as const),
  };

  // Dosyalar sekmesi: dosya varsa sayısı parantezde (2026-09-17, kullanıcı).
  const docCount = listingDocs.data?.length ?? 0;
  const filesTabLabel =
    docCount > 0 ? t("dosyalarSayi", { count: docCount }) : t("dosyalar");
  const filesTab = (
    <Tab className={TRIGGER_CLASSES}>
      <Paperclip className="h-4 w-4" aria-hidden="true" />
      {filesTabLabel}
    </Tab>
  );
  const itemsTab = (
    <Tab className={TRIGGER_CLASSES}>
      <Layers className="h-4 w-4" aria-hidden="true" />
      {t("kalemler")}
      <TabBadge count={l.items?.length ?? 0} />
    </Tab>
  );
  // AI tedarikçi keşfi: API `company/ai/supplier-discovery` = buy:listing:manage
  // + GOLD; taslak/yayındaki talepte anlamlı (kapanmışa davet gitmez). Davet
  // ucu talebi YÖNETENİ ister (assertListingManageRole) → talebi açmamış
  // meslektaşa düğme gösterilip her davet 403 alıyordu (arayüz testi O-089);
  // Kazandır ile aynı kapı.
  const canDiscover =
    !!l.isOwner &&
    canManage &&
    (l.status === "DRAFT" || l.status === "OPEN");
  const discoverTierOk = !!company && tierAtLeast(company.tier, BUYING_TIER);
  // Paket kilidi (arayüz testi O-058, kullanıcı kararı T-06): Gold'u düşen /
  // süresi biten firmada yeni iş (yayın, düzenleme, davet, yeni tur, uzatma)
  // kilitli; doğrulanmamışsa CTA doğrulama, değilse Gold. Firma yüklenmeden
  // kilit basılmaz (paketli kullanıcıda yanıp sönmesin; sunucu zaten kapılı).
  const ownerGate = company ? buyingGate(user, company, "listing") : "ok";
  const buyLock =
    ownerGate === "verify" || ownerGate === "upgrade" ? ownerGate : null;

  // P2 (denetim §10.4): OrderStatusStrip — kazandırma sonrası ihale detayı,
  // doğan siparişin durumuna bağlanır ("Tamamlandı / Kazandın / Teslime hazır"
  // üç kopuk ekranı birleşir). myOrder = çağıranın taraf olduğu sipariş.
  // Sahip dalında kalem bazlı kazandırma birden çok sipariş doğurur: şerit
  // CANLI siparişlerin hepsini gösterir; reddedilen/iptal edilen sipariş yeşil
  // "başarı" şeridinde öne çıkmaz (reddedilen ayrıca amber bantta). Hiç canlı
  // sipariş yoksa en yenisi nötr tonla (yeniden doğrulama webB-05).
  const isLiveOrder = (status: string) =>
    status !== "REJECTED" && status !== "CANCELLED";
  const stripOrders: { id: string; number: string | null; status: string }[] =
    (() => {
      if (l.isOwner && (l.orders?.length ?? 0) > 0) {
        const all = l.orders ?? [];
        const live = all.filter((o) => isLiveOrder(o.status));
        return live.length > 0 ? live : all.slice(0, 1);
      }
      return l.myOrder ? [l.myOrder] : [];
    })();
  const orderStrip =
    stripOrders.length > 0 ? (
      <div className="space-y-2">
        {stripOrders.map((o) => {
          const live = isLiveOrder(o.status);
          return (
            <div
              key={o.id}
              data-testid="order-strip"
              className={
                live
                  ? "flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5"
                  : "flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5"
              }
            >
              <p className={live ? "text-sm text-emerald-900" : "text-sm text-zinc-700"}>
                {t.rich("siparisNumarasi", {
                  number: o.number ?? "—",
                  no: (c) => <span className="font-semibold tabular-nums">{c}</span>,
                })}
                <span className={live ? "mx-1.5 text-emerald-400" : "mx-1.5 text-zinc-400"}>·</span>
                {orderStatusLabel(orderStatusMeta(o.status as CompanyOrderStatus).labelKey)}
              </p>
              <Link
                href={`/company/siparis/${o.id}`}
                className={
                  live
                    ? "inline-flex items-center gap-1 text-sm font-semibold text-emerald-800 hover:underline"
                    : "inline-flex items-center gap-1 text-sm font-semibold text-zinc-700 hover:underline"
                }
              >
                {t("sipariseGit")}
                <ArrowRightIcon className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          );
        })}
      </div>
    ) : null;

  const header = (
    <div className="space-y-3">
      {/* Üst satır: numara (eyebrow) + durum */}
      {/* BAŞLIK KARTI v2 (2026-09-19, kullanıcı mockup'ı): numara · durum
          pili, büyük başlık, tonlu tip çipleri (ikonlu), anahtar kelimeler,
          alıcı firma ikon karosuyla, açıklama. */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
        {l.number ? <span className="tabular-nums font-medium">{l.number}</span> : null}
        {l.number ? <span aria-hidden className="text-zinc-300">|</span> : null}
        <Badge color={statusMeta.color}>{statusMeta.label}</Badge>
      </div>

      <Heading className="text-3xl/9 font-bold">{l.title}</Heading>
      <AutoTranslatedNote from={l.translatedFrom} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-2.5 py-1 text-sm font-medium text-zinc-700">
          {(l.targetCountries ?? []).length === 0 ? <Globe aria-hidden className="size-4" /> : <MapPin aria-hidden className="size-4" />}
          {scopeLabel(l.targetCountries ?? [], company?.country)}
        </span>
        {l.format ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-purple-50 px-2.5 py-1 text-sm font-medium text-purple-700">
            <FileText aria-hidden className="size-4" />
            {l.format === "RFQ" ? t("teklifToplama") : t("pazarlikEksiltme")}
          </span>
        ) : null}
      </div>

      {/* Anahtar kelimeler */}
      {l.keywords && l.keywords.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-zinc-500">{t("anahtarKelimeler")}</span>
          {l.keywords.map((kw) => (
            <span key={kw} className="rounded-lg bg-zinc-100 px-2.5 py-1 text-sm text-zinc-600">
              {kw}
            </span>
          ))}
        </div>
      ) : null}

      {/* Alıcı firma */}
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
          {l.owner ? <Building2 className="size-5" /> : <Lock className="size-5" />}
        </span>
        <span className="min-w-0">
          <span className="block text-xs text-zinc-500">{t("aliciFirma")}</span>
          <span className="block truncate text-base font-semibold text-zinc-950">{l.owner ? l.owner.name : t("gizliFirma")}</span>
        </span>
      </div>

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
    ? { href: "/company/satinalma/taleplerim", label: t("taleplerim") }
    : { href: "/company/satis#acik-talepler", label: t("acikTalepler") };
  const breadcrumb = (
    <Link
      href={fromHref ?? defaultBack.href}
      className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
    >
      <ArrowLeftIcon className="h-4 w-4" />
      {fromHref ? (fromLabel ? (tn.has(fromLabel as never) ? tn(fromLabel as never) : fromLabel) : t("firmaProfili")) : defaultBack.label}
    </Link>
  );

  // ───────────── SAHİP: sekmeli talep detayı ─────────────
  if (l.isOwner) {
    // Birincil yönetim eylemleri (Yayınla / Onayı iptal et). Derin denetim
    // S059: yalnız yapışkan şeritteydi ve şerit başlık görünürken `invisible`
    // — taslağı açan sahip ilk ekranda "Yayınla"yı hiç görmüyordu (kısa
    // sayfada/yüksek ekranda kaydırma olmadığı için HİÇ). Teklifçi dalındaki
    // 2026-09-10 düzeltmesiyle aynı: başlık kartı taşır, şerit kaydırınca devralır.
    // Yayınlama Gold ister (API publishWork) — kilitte düğme yok, menüdeki
    // paket notu nedenini ve CTA'yı söyler.
    const canPublishNow = canManage && !!l.canPublish && !buyLock;
    // Yayın doğrulanmış firma ister (API assertVerified) — Gold ama
    // doğrulanmamış firmada düğme pasif + not (arayüz testi D-027; hızlı
    // talep formuyla aynı kural).
    const publishNeedsVerify = canPublishNow && !companyVerified;
    // Onay isteğini BAŞLATAN ya da onay akışı yöneticisi iptal eder — API
    // cancelRequest ile aynı (arayüz testi D-252). Başlatan bilgisi sunucudan
    // (`pendingApprovalMine`); talebi yönetmek başlatmakla aynı şey değil
    // (arayüz testi T3). Eski yanıtta alan yoksa talep yöneticisine düşer.
    const isApprovalRequester = l.pendingApprovalMine ?? canManage;
    const canCancelApproval =
      !!l.pendingApprovalId && (isApprovalRequester || hasApprovalsManage);
    const ownerPrimaryActions =
      canCancelApproval || canPublishNow ? (
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {canCancelApproval ? (
              <Button
                outline
                onClick={handleCancelApproval}
                disabled={cancelApproval.isPending}
              >
                {t("onayiIptalEt")}
              </Button>
            ) : null}
            {canPublishNow ? (
              <Button
                onClick={handlePublish}
                disabled={publish.isPending || publishNeedsVerify}
              >
                {t("yayinla")}
              </Button>
            ) : null}
          </div>
          {publishNeedsVerify ? (
            <p className="text-right text-xs text-amber-800">
              {verificationPending
                ? t("dogrulamaIncelemedeOnaylanincaYayinlayipKazandirabilirsiniz")
                : t.rich("yayinIcinFirmaDogrulamasiGerekir", {
                    link: (c) => (
                      <Link href={VERIFY_HREF} className="font-semibold underline">
                        {c}
                      </Link>
                    ),
                  })}
            </p>
          ) : null}
        </div>
      ) : null;
    // Talebi yalnız açan kişi yönetir (assertListingManageRole; SAHİP
    // istisnası yok) — başkası düğmesiz sayfada nedenini görmeli (D-110).
    // Talebi AÇAN ama rolünde buy:listing:manage olmayan kişiye "yalnız açan
    // kişi" demek yanlış neden olur — ona yetki notu gösterilir.
    const isCreator = !!l.createdById && l.createdById === user?.id;
    const manageOnlyCreatorNote =
      !canManage &&
      (l.status === "DRAFT" || l.status === "OPEN" || l.status === "IN_AWARD") ? (
        <p className="mt-4 flex items-start gap-2 border-t border-zinc-950/5 pt-4 text-sm text-zinc-600">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-zinc-500" />
          {isCreator
            ? t("buTalebiYonetmeYetkinizYok")
            : t("buTalebiYalnizAcanKisiYonetebilir")}
        </p>
      ) : null;
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
                  {t("kapanisZaman", { dateTime: formatDateTime(l.closesAt, locale) })}
                </span>
              ) : null}
            </div>
            {ownerPrimaryActions}
          </div>
        </div>

        {orderStrip}

        {/* YAYIN SONRASI AI ÖNERİLERİ (2026-09-27, Faz 1): sahibin görünümünde
            bant — bulunan tedarikçiler SEÇİLİ, tek tıkla davet; "Gizle" kapatır. */}
        {canDiscover && discoverTierOk && l.status === "OPEN" ? (
          <ListingSuggestions
            listingId={l.id}
            itemNames={(l.items ?? []).map((i) => i.name)}
            buyerCountry={company?.country}
            variant="band"
            defaultOpen={aiInviteParam}
          />
        ) : null}

        <div className="card p-5">
          <div className="min-w-0" ref={setHeaderEl}>{header}</div>
          {ownerPrimaryActions ? (
            <div className="mt-4 flex justify-end border-t border-zinc-950/5 pt-4">
              {ownerPrimaryActions}
            </div>
          ) : null}
          {/* İşlemler — görünür buton çubuğu (kutu içinde). F7: 10 aksiyonun
              tamamı backend'de assertListingManageRole ister → menü yalnız
              canManage'e görünür; etiket-only gözetim sayfayı yine görür. */}
          {manageOnlyCreatorNote}
          {l.isOwner && l.publicPath ? (
            <div className="mt-4 border-t border-zinc-950/5 pt-4">
              <ShareListing publicPath={l.publicPath} title={l.title} compact />
            </div>
          ) : null}
          {canDiscover ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-zinc-950/5 pt-4">
              <Button
                onClick={() => setDiscoveryOpen(true)}
                disabled={!discoverTierOk}
                title={discoverTierOk ? undefined : t("aiIleTedarikciBulmaGold")}
              >
                <Sparkles data-slot="icon" />
                {t("aiIleTedarikciBul")}
              </Button>
              <Text className="text-xs text-zinc-500">
                {t("kategoriyeUyanFirmalariPlatformdanVe")}
              </Text>
            </div>
          ) : null}
          {canManage ? (
          <div className="mt-4 border-t border-zinc-950/5 pt-4">
            <TenderActionsMenu
              id={l.id}
              status={l.status}
              format={l.format}
              closesAt={l.closesAt}
              internalNotes={l.internalNotes ?? null}
              canEdit={l.canEdit}
              buyLock={buyLock}
              invitedCodes={(l.invitations ?? [])
                .map((iv) => iv.rothernId)
                .filter((c): c is string => !!c)}
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
                ? t("onayBekliyorYayinAskidaOnaylandiginda")
                : t("kazandirmaOnayiBekliyorOnaylandigindaKazandi")}
            </p>
          </div>
        ) : null}

        {/* İptal sebebi bandı */}
        {(l.status === "CANCELLED" || l.status === "CLOSED_NO_AWARD") &&
        l.cancelReason ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span className="font-semibold">
              {l.status === "CANCELLED" ? t("iptalSebebi") : t("kapatmaSebebi")}:
            </span>{" "}
            {l.cancelReason}
          </div>
        ) : null}

        {/* Meta bar — bölünmüş istatistik şeridi */}
        <section>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200/80 bg-zinc-950/[0.06] lg:grid-cols-5">
            <MetaItem
              icon={Layers}
              label={t("kalem")}
              value={t("kalemSayisi", { count: l.items?.length ?? 0 })}
            />
            <MetaItem
              icon={Wallet}
              label={
                (l.allowedCurrencies?.length ?? 0) > 1
                  ? t("paraBirimleri")
                  : t("paraBirimi")
              }
              value={currencyListLabel(l)}
              title={currencyListLabel(l)}
            />
            <MetaItem
              icon={CalendarClock}
              label={t("kapanis2")}
              multiline
              value={
                l.closesAt ? (
                  <>
                    <span className="block leading-tight">
                      {formatDate(l.closesAt, locale)}
                    </span>
                    <span className="block text-xs font-medium leading-tight text-zinc-500">
                      {formatTime(l.closesAt, locale)}
                    </span>
                  </>
                ) : (
                  "—"
                )
              }
            />
            <MetaItem
              icon={Users}
              label={t("davetli")}
              value={t("tedarikciSayisi", { count: l.invitations?.length ?? 0 })}
            />
            <MetaItem
              icon={Gavel}
              label={t("teklif")}
              value={`${l.bids?.length ?? 0}`}
              className="col-span-2 lg:col-span-1"
            />
          </dl>
        </section>

        {/* DÜZEN (2026-09-17, kullanıcı kararı): teklifler sekme değil, sayfanın
            üstünde AYRI KUTU; altında sekmeler yalnız "Kalemler" (kalemler +
            genel bilgi + davetliler tek akış) ve "Dosyalar (N)". Eski dört
            sekme (Teklifler · Genel Bilgi · Kalemler · Dosyalar) kalktı. */}
        <div className="card p-5">{ownerBidsSection}</div>

        <TabGroup
          defaultIndex={initialTab}
          onChange={rememberTab}
          className="space-y-5"
        >
          <TabList
            className="flex flex-wrap border-b border-zinc-950/10"
            aria-label={t("satinAlmaTalebiDetaySekmeleri")}
          >
            {itemsTab}
            {filesTab}
          </TabList>

          <TabPanels>
            <TabPanel className="space-y-6 outline-none">
              {itemsSection}
              <GeneralInfoTab l={l} />
              {invitationsSection}
            </TabPanel>
            <TabPanel className="outline-none">
              <FilesTab
                listingId={l.id}
                isOwner={!!l.isOwner}
                canEdit={false}
                // "Düzenle ekranından yönetilir" yalnız talep gerçekten
                // düzenlenebilirken (arayüz testi D-250).
                manageHint={canManage && !!l.canEdit && !buyLock}
              />
            </TabPanel>
          </TabPanels>
        </TabGroup>

        <SupplierDiscoveryModal
          isOpen={discoveryOpen}
          onClose={() => setDiscoveryOpen(false)}
          categoryIds={[]}
          listingId={l.id}
        />

        <ReasonDialog
          open={!!eliminateTarget}
          onClose={() => setEliminateTarget(null)}
          onSubmit={submitEliminate}
          title={t("teklifiEle")}
          description={
            eliminateTarget
              ? t("elensinMiYenidenTeklifVerebilir", { bidderName: eliminateTarget.bidderName })
              : undefined
          }
          confirmLabel={t("ele")}
          destructive
          pending={eliminate.isPending}
        />

        {/* Onay akışı devrede — başlatıcı notu (onaycılara iletilir, opsiyonel) */}
        <ReasonDialog
          open={!!noteAction}
          onClose={() => setNoteAction(null)}
          onSubmit={submitNoteAction}
          title={t("kazandirmayiOnayaGonder")}
          description={
            noteAction?.kind === "award"
              ? t("icinKazandirmaOnayaGonderilecekSiparis", { bidderName: noteAction.bidderName })
              : t("kalemBazliKazandirmaOnayaGonderilecek")
          }
          confirmLabel={t("onayaGonder")}
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
        <div className="flex items-center justify-between gap-3">
          {breadcrumb}
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(window.location.href).then(
                () => toast.success(t("baglantiKopyalandi")),
                () => toast.error(t("baglantiKopyalanamadi")),
              );
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
          >
            <Share2 aria-hidden className="size-4" />
            {t("paylas")}
          </button>
        </div>

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
                  {t("kapanisZaman", { dateTime: formatDateTime(l.closesAt, locale) })}
                </span>
              ) : null}
            </div>
            {bidCta ? (
              bidCtaDisabled ? (
                <Button
                  disabled
                  title={t("buTurdakiTeklifinizVerildiIlan")}
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

        <div className="card p-5 sm:p-6">
          {/* İKİ SÜTUN (2026-09-19 mockup): solda başlık, sağda geri sayım
              kartı + büyük "Teklif Ver"; "Takip et" YOK (kullanıcı kararı). */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0" ref={setHeaderEl}>{header}</div>
            {/* Geri sayım kartı kapanış tarihine, CTA teklif hakkına bağlı —
                kapanışsız (eski) açık talepte CTA kaybolmasın (arayüz testi D-176). */}
            {biddingOpen && (l.closesAt || bidCta) ? (
              <div className="flex flex-col gap-3 lg:border-l lg:border-zinc-950/5 lg:pl-6">
                {l.closesAt ? (
                <div className="flex items-center gap-3 rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-950/5">
                  <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-zinc-700 ring-1 ring-zinc-950/10">
                    <Clock className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">{t("kapanmasina")}</p>
                    <CountdownFull deadline={l.closesAt} />
                    <p className="mt-0.5 text-xs text-zinc-500">{formatDateTime(l.closesAt, locale)}</p>
                  </div>
                </div>
                ) : null}
                {/* BUG (2026-09-10, kullanıcı: "talebi görüyorum ama teklif
                    veremiyorum"): CTA yalnız yapışkan çubuktaydı ve çubuk
                    başlık görünürken `invisible` — kısa sayfada (birkaç kalem)
                    kaydırma olmadığı için düğme HİÇ çıkmıyordu. Başlık kartı
                    ilk ekranda CTA'yı taşır; yapışkan çubuk kaydırınca devralır. */}
                {bidCta ? (
                  bidCtaDisabled ? (
                    <Button
                      disabled
                      className="w-full py-3 text-base"
                      title={t("buTurdakiTeklifinizVerildiIlan")}
                    >
                      {bidCta.label}
                    </Button>
                  ) : (
                    <Button href={bidCta.href} className="w-full py-3 text-base">
                      <CalendarClock data-slot="icon" />
                      {bidCta.label}
                      <ChevronRight data-slot="icon" />
                    </Button>
                  )
                ) : null}
              </div>
            ) : l.status === "IN_AWARD" ||
              l.status === "IN_AWARD_APPROVAL" ? (
              // Izgara öğesi gerilmesin (dev gri oval) — hap boyunda kalır.
              <span className="inline-flex shrink-0 items-center self-start justify-self-start rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600">
                {t("teklifAlimiKapandiDegerlendirmeAsamasinda")}
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
              label={t("aliciFirma")}
              value={l.owner?.name ?? t("gizliFirma")}
            />
            <MetaItem
              icon={Layers}
              label={t("kalem")}
              value={t("kalemSayisi", { count: l.itemCount ?? l.items?.length ?? 0 })}
            />
            <MetaItem
              icon={Wallet}
              label={
                (l.allowedCurrencies?.length ?? 0) > 1
                  ? t("paraBirimleri")
                  : t("paraBirimi")
              }
              value={currencyListLabel(l)}
              title={currencyListLabel(l)}
            />
            <MetaItem
              icon={CalendarClock}
              label={t("kapanis2")}
              value={l.closesAt ? formatDateTime(l.closesAt, locale) : "—"}
            />
          </dl>
        </section>

        {/* KAPALI ZARF BANDI (2026-09-19 mockup) — RFQ'da, teklif alımı açıkken. */}
        {!l.english?.isEnglishAuction && biddingOpen ? (
          <div className="flex flex-wrap items-center gap-4 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-950/5">
            <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <Lock className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-zinc-950">{t("kapaliZarfDigerTekliflerinTutarini")}</p>
              <p className="text-xs text-zinc-500">{t("tekliflerKapanisTarihindenSonraAlici")}</p>
            </div>
            {/* Dil farkında Link — ham <a> EN/RU'da Türkçe sayfayı açıyordu
                (derin denetim LU-21). */}
            <Link
              href="/nasil-calisir#nasil"
              target="_blank"
              rel="noopener"
              className="inline-flex shrink-0 items-center text-sm font-medium text-blue-700 hover:text-blue-800"
            >
              {t("nasilCalisir")}
            </Link>
          </div>
        ) : null}

        {/* DÜZEN (2026-09-17, kullanıcı kararı): "Teklifim" sekmesi yok —
            teklif durumu sayfanın üstünde AYRI KUTU (MyBidStatusPanel kendi
            dikdörtgenini çizer); altında sekmeler yalnız "Kalemler" (kalemler +
            genel bilgi tek akış) ve "Dosyalar (N)". Teklif CTA'sı yapışkan
            çubukta / başlık kartında, burada tekrar edilmez. */}
        <section className="space-y-3" aria-label={t("teklifim")}>
          {/* Başlık yalnız teklif VARKEN — teklifsizken altında kutu olmayan
              yalnız bir başlık kalıyordu (staging'de görüldü); uyarı/kapalı
              zarf notları başlıksız da anlaşılır. */}
          {l.myBid ? <Subheading>{t("teklifim")}</Subheading> : null}
          <MyBidStatusPanel l={l} />
          {sellerBidSection}
        </section>

        <TabGroup defaultIndex={initialTab} onChange={rememberTab}>
          <TabList
            className="flex flex-wrap gap-1 border-b border-zinc-950/10"
            aria-label={t("satinAlmaTalebiBolumleri")}
          >
            {itemsTab}
            {filesTab}
          </TabList>

          <TabPanels className="pt-5">
            <TabPanel className="space-y-6 outline-none">
              {/* Maskede de kalemler görünür (teaser: isim/miktar/birim);
                  fiyat/detay itemsSection içinde gizlenir + upsell notu. */}
              {itemsSection}
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
