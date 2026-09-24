"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  countryDisplayName,
  useListingStatusLabel,
  useNavLabel,
  useScopeLabel,
  useUnitLabel,
} from "@/i18n/domain";
import { AutoTranslatedNote } from "@/components/marketplace/auto-translated-note";
import { AuctionLiveCard } from "./_components/auction-live-card";
import { MyBidStatusPanel } from "./_components/my-bid-status-panel";
import { PRICING_HREF, SilverLockCard } from "@/components/company/silver-lock-card";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { CountdownFull } from "@/components/tenders/countdown-full";
import { FilesTab } from "@/components/tenders/files-tab";
import { GeneralInfoTab } from "@/components/tenders/general-info-tab";
import { ReasonDialog } from "@/components/tenders/reason-dialog";
import { TenderActionsMenu } from "@/components/tenders/tender-actions-menu";
import { SupplierDiscoveryModal } from "@/components/tenders/supplier-discovery-modal";
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
import { useCompanyAuth, useHasCompanyPermission } from "@/hooks/use-company-auth";
import { useListingDocuments } from "@/hooks/use-listing-documents";
import { BUYING_TIER, tierAtLeast } from "@rothern/shared";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { activePortalFromPath } from "@/lib/company/portals";
import { usePortalStore } from "@/lib/company/portal-store";
import { canManageListing } from "@/lib/tenders/can-manage-listing";
import { SearchInput } from "@/components/list/search-input";
import { extractErrorMessage } from "@/lib/tenders/error";
import { formatDate, formatDateTime, formatTime } from "@/lib/tenders/date";
import { subscribeRealtime } from "@/lib/realtime";
import { CURRENCY_SYMBOL } from "@/lib/tenders/labels";
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
  Sparkles,
  Wallet, PackagePlus, FileText, Clock, ChevronRight, Share2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
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
      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
        <Icon className="size-5 text-zinc-700" />
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
  const tn = useNavLabel();
  const td = useTranslations("web.domain");
  const locale = useLocale();
  const listingStatusLabel = useListingStatusLabel();
  const scopeLabel = useScopeLabel();
  const unitLabel = useUnitLabel();
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
    if (
      !(await confirm({
        title: t("satinAlmaTalebiniYayinla"),
        description:
          t("satinAlmaTalebiYayinlansinMi"),
        confirmLabel: t("yayinla"),
      }))
    )
      return;
    try {
      await publish.mutateAsync(undefined);
      toast.success(t("satinAlmaTalebiYayinlandi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("yayinlanamadi")));
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
                disabled={saveToCatalog.isPending}
                onClick={() => {
                  saveToCatalog.mutate(l.id, {
                    onSuccess: (r) => {
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
                    onError: (err) =>
                      toast.error(
                        extractErrorMessage(err, t("katalogaKaydedilemedi")),
                      ),
                  });
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
                <TableHeader className="text-right">{t("miktar")}</TableHeader>
                <TableHeader className="text-right">
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
                  <TableCell>
                    <div className="font-medium text-zinc-900">{it.name}</div>
                    {it.materialCode ? (
                      <div className="tabular-nums text-xs text-zinc-500">
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
                          {t("soru", { n: it.questions.length })}
                        </Badge>
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-zinc-700">
                    {Number(it.quantity).toLocaleString("tr-TR")} {unitLabel(it.unit, it.unitCode)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-zinc-700">
                    {it.targetPrice
                      ? formatMoney(it.targetPrice, l.primaryCurrency ?? "TRY")
                      : "—"}
                  </TableCell>
                  {showMyPriceCol ? (
                    <TableCell className="text-right font-medium tabular-nums text-zinc-900">
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
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {t("talepKazandirildiSiparisOlusturulduSiparisle")}
        </div>
      ) : l.status === "CLOSED_NO_AWARD" ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-700">
          {t("kazananOlmadanKapatildi")}{" "}
          {l.cancelReason ? t("sebep", { cancelReason: l.cancelReason }) : ""}
        </div>
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
                        {b.bidderName}
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
                          ({Number(it.quantity).toLocaleString("tr-TR")} {unitLabel(it.unit, it.unitCode)})
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
                      b.status === "SUBMITTED" &&
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
                        {Number(b.amount).toLocaleString("tr-TR")}{" "}
                        {symFor(b.currency)}
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
                  amount: itemSavings.bestTotal.toLocaleString("tr-TR", {
                    maximumFractionDigits: 2,
                  }),
                  strong: (c) => <strong>{c}</strong>,
                })}
                <span className="ml-1 text-xs text-zinc-500">
                  {t("tryKarsiligiyla")}
                </span>
              </p>
            </div>
          ) : itemSavings?.kind === "ok" ? (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p>
                {t.rich("kalemBazliDagitimTasarruf", {
                  itemized: itemSavings.itemized.toLocaleString("tr-TR", {
                    maximumFractionDigits: 2,
                  }),
                  bestTotal: itemSavings.bestTotal.toLocaleString("tr-TR", {
                    maximumFractionDigits: 2,
                  }),
                  pct: itemSavings.pct.toLocaleString("tr-TR", {
                    maximumFractionDigits: 1,
                  }),
                  strong: (c) => <strong>{c}</strong>,
                })}
                <span className="ml-1 text-xs text-emerald-700/80">
                  {t("tryKarsiligiyla")}
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
                return (
                  <div
                    key={it.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-sm text-zinc-900">
                      {it.name}
                      <span className="ml-1 text-xs text-zinc-400">
                        ({Number(it.quantity).toLocaleString("tr-TR")} {unitLabel(it.unit, it.unitCode)})
                      </span>
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        step="0.001"
                        placeholder={t("miktar")}
                        aria-label={t("icinKazandirilacakMiktarBosTam", { name: it.name })}
                        title={t("kismiMiktarBosTam")}
                        value={itemQty[it.id] ?? ""}
                        onChange={(e) =>
                          setItemQty((q) => ({ ...q, [it.id]: e.target.value }))
                        }
                        className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-right text-sm"
                      />
                      <SelectMenu
                        value={itemWinners[it.id] ?? ""}
                        ariaLabel={t("icinKazananTeklif", { name: it.name })}
                        onChange={(v) =>
                          setItemWinners((w) => ({ ...w, [it.id]: v }))
                        }
                        className="min-w-48"
                        options={[
                          { value: "", label: t("sec") },
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
                {t("vazgec")}
              </Button>
              <Button onClick={handleAwardByItem} disabled={awardByItem.isPending}>
                {t("onaylaKazandir")}
              </Button>
            </div>
          </div>
          ) : (
            <Button outline onClick={startItemAward}>
              {t("kalemBazliKazandir2")}
            </Button>
          )}
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
            .map((b) => {
            // Geçerliliği dolmuş teklif kazandırılamaz (sunucu da reddeder);
            // rozetle aynı hesap. Pazarlıkta validityDays null → süresiz.
            const bidExpired =
              b.status === "SUBMITTED" &&
              !!b.submittedAt &&
              !!b.validityDays &&
              new Date(b.submittedAt).getTime() + b.validityDays * 86_400_000 < Date.now();
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
                {b.status === "LOST" ? <Badge color="zinc">{t("elendi")}</Badge> : null}
                <Link
                  href={`/company/ilan/${l.id}/teklif/${b.id}`}
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
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-3">
                <span className="text-base font-bold tabular-nums text-zinc-950">
                  {formatMoney(b.amount, b.currency ?? "TRY")}
                  {b.currency && b.currency !== "TRY" && b.amountTry ? (
                    <span className="ml-1 text-xs font-normal text-zinc-500">
                      ≈ {formatMoney(b.amountTry, "TRY")}
                      {b.exchangeRateSnapshot
                        ? t("kur", { exchangeRateSnapshot: b.exchangeRateSnapshot })
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
                    <Button
                      onClick={() => handleAward(b.id, b.bidderName)}
                      disabled={award.isPending || bidExpired}
                      title={
                        bidExpired
                          ? t("teklifinGecerlilikSuresiDolmusTedarikciden")
                          : undefined
                      }
                    >
                      {t("kazandir")}
                    </Button>
                  </>
                ) : null}
              </div>
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
            {t.rich("buIlanaTeklifVermekIcinSilverPaketi", {
              strong: (c) => <strong>{c}</strong>,
            })}
          </Text>
          <Button href={PRICING_HREF} className="shrink-0">
            {t("paketleriGor")}
          </Button>
        </div>
      ) : l.roleAllowsBid === false ? (
        // Rol kapısı: sessiz buton yokluğu yerine açık yönlendirme.
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <Text className="text-sm text-amber-800">
            {t.rich("buAcikTalebeTeklifVermekIcinSatisciRolu", {
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
                {t("gonderilmisTeklifGeriCekilemez")}
              </Text>
              <div className="rounded-lg bg-zinc-50 px-3 py-2">
                <Text className="text-sm">
                  {t.rich("mevcutTeklifin", {
                    money: formatMoney(l.myBid.amount, l.myBid.currency ?? "TRY"),
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

  const statusMeta = {
    label: listingStatusLabel(l.status),
    color: LISTING_STATUS_COLOR[l.status] ?? ("zinc" as const),
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
  // + GOLD; taslak/yayındaki talepte anlamlı (kapanmışa davet gitmez).
  const canDiscover =
    !!l.isOwner &&
    hasManagePermission &&
    (l.status === "DRAFT" || l.status === "OPEN");
  const discoverTierOk = !!company && tierAtLeast(company.tier, BUYING_TIER);

  // P2 (denetim §10.4): OrderStatusStrip — kazandırma sonrası ihale detayı,
  // doğan siparişin durumuna bağlanır ("Tamamlandı / Kazandın / Teslime hazır"
  // üç kopuk ekranı birleşir). myOrder = çağıranın taraf olduğu sipariş.
  const orderStrip = l.myOrder ? (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
      <p className="text-sm text-emerald-900">
        {t.rich("siparisNumarasi", {
          number: l.myOrder.number ?? "—",
          no: (c) => <span className="font-semibold tabular-nums">{c}</span>,
        })}
        <span className="mx-1.5 text-emerald-400">·</span>
        {orderStatusMeta(l.myOrder.status as CompanyOrderStatus).label}
      </p>
      <Link
        href={`/company/siparis/${l.myOrder.id}`}
        className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-800 hover:underline"
      >
        {t("sipariseGit")}
        <ArrowRightIcon className="h-4 w-4" aria-hidden />
      </Link>
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
                  {t("kapanis", { formatDateTime: formatDateTime(l.closesAt) })}
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
                  {t("onayiIptalEt")}
                </Button>
              ) : null}
              {canManage && l.canPublish ? (
                <Button onClick={handlePublish} disabled={publish.isPending}>
                  {t("yayinla")}
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
                  {t("kapanis", { formatDateTime: formatDateTime(l.closesAt) })}
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
            {biddingOpen && l.closesAt ? (
              <div className="flex flex-col gap-3 lg:border-l lg:border-zinc-950/5 lg:pl-6">
                <div className="flex items-center gap-3 rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-950/5">
                  <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-zinc-700 ring-1 ring-zinc-950/10">
                    <Clock className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">{t("kapanmasina")}</p>
                    <CountdownFull deadline={l.closesAt} />
                    <p className="mt-0.5 text-xs text-zinc-500">{formatDateTime(l.closesAt)}</p>
                  </div>
                </div>
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
              <span className="inline-flex shrink-0 items-center rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600">
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
              value={l.closesAt ? formatDateTime(l.closesAt) : "—"}
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
            <a
              href="/nasil-calisir#nasil"
              target="_blank"
              rel="noopener"
              className="inline-flex shrink-0 items-center text-sm font-medium text-blue-700 hover:text-blue-800"
            >
              {t("nasilCalisir")}
            </a>
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
