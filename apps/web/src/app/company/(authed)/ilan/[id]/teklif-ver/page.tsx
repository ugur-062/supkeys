"use client";

import { PRICING_HREF, SilverLockCard } from "@/components/company/silver-lock-card";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Heading, Subheading } from "@/components/catalyst/heading";
import { Input } from "@/components/catalyst/input";
import { MoneyInput } from "@/components/ui/money-input";
import { SelectMenu } from "@/components/ui/select-menu";
import { Select } from "@/components/catalyst/select";
import { Text } from "@/components/catalyst/text";
import { Textarea } from "@/components/catalyst/textarea";
import {
  BID_DOC_KIND_LABELS,
  BID_DOC_SELECTABLE_KINDS,
  useBidDocuments,
  useDeleteBidDoc,
  useUploadBidDoc,
  type BidDocKind,
} from "@/hooks/use-bid-documents";
import {
  useListingDetail,
  usePlaceBid,
  type ListingDetail,
  type ListingItemRow,
} from "@/hooks/use-company-listings";
import { KDV_HARIC_NOTE } from "@/lib/tenders/labels";
import { extractErrorMessage } from "@/lib/tenders/error";
import { moneyInputError } from "@/lib/money-input";
import { formatDateTime, todayLocalISO } from "@/lib/tenders/date";
import {
  BID_DELIVERY_TIMES,
  BID_DELIVERY_TIME_LABELS,
  bidDeliveryTimeLabel,
} from "@rothern/shared";
import { subscribeRealtime } from "@/lib/realtime";
import { daysUntil } from "@/lib/tenders/seller-state";
import { cn } from "@/lib/utils";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import {
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  Lock,
  Paperclip,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { BidImportDialog, type BidImportApplyRow, type BidImportVariant } from "@/components/bids/bid-import-dialog";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { tierAtLeast } from "@rothern/shared";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/providers/confirm-dialog";
import { AuctionLiveCard } from "../_components/auction-live-card";
import {
  AuctionBidWorkbench,
  type WorkbenchTarget,
} from "../_components/auction-bid-workbench";
import {
  cmpDecimal,
  decSub,
  exactTotal,
  unitStep,
} from "@/lib/tenders/distribute";

/** Kalem başına form durumu. null fiyat = "bu kaleme teklif verme". */
interface ItemState {
  price: string | null;
  /** Teslim SÜRESİ (BID_DELIVERY_TIMES; "" = genel süre geçerli). */
  deliveryTime: string;
  /** Kalem para birimi ("" = teklifin ana birimi) — madde 9, yalnız ALIM RFQ. */
  currency: string;
  answers: Record<string, string>;
  // ── Faz 3: MUADİL beyanı (yalnız alıcı izin verdiyse görünür) ──────────
  isAlternative: boolean;
  offeredBrand: string;
  offeredMpn: string;
}

function money(v: number, currency: string): string {
  return `${v.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${
    currency === "TRY" ? "₺" : currency
  }`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function Blocked({ title, detailHref }: { title: string; detailHref: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <AlertTriangle
        className="mx-auto h-8 w-8 text-amber-500"
        aria-hidden="true"
      />
      <Heading className="mt-3">{title}</Heading>
      <Button href={detailHref} className="mt-5" outline>
        Satın Alma Talebi Detayına Dön
      </Button>
    </div>
  );
}

function AnswerInput({
  q,
  value,
  onChange,
}: {
  q: NonNullable<ListingItemRow["questions"]>[number];
  value: string;
  onChange: (v: string) => void;
}) {
  const label = (
    <Label>
      {q.text}
      {q.required ? <span className="text-red-600"> *</span> : null}
    </Label>
  );
  if (q.answerType === "YES_NO") {
    return (
      <Field>
        {label}
        <Select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Seçin…</option>
          <option value="Evet">Evet</option>
          <option value="Hayır">Hayır</option>
        </Select>
      </Field>
    );
  }
  return (
    <Field>
      {label}
      <Input
        type={
          q.answerType === "NUMBER"
            ? "number"
            : q.answerType === "DATE"
              ? "date"
              : "text"
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export default function TeklifVerPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const detail = useListingDetail(id);
  const placeBid = usePlaceBid(id);
  const bidDocs = useBidDocuments(id);
  const uploadDoc = useUploadBidDoc(id);
  const deleteDoc = useDeleteBidDoc(id);
  const confirm = useConfirm();

  const l = detail.data;
  const detailHref = `/company/ilan/${id}`;

  // ── Form durumu ──
  const [itemState, setItemState] = useState<Record<string, ItemState>>({});
  const [singleAmount, setSingleAmount] = useState("");
  // Teslim SÜRESİ (2026-08-02; tarih yerine merdiven) — "" = seçilmedi.
  const [deliveryTime, setDeliveryTime] = useState("");
  const [validityDays, setValidityDays] = useState("30");
  const [currency, setCurrency] = useState("");
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [seeded, setSeeded] = useState(false);
  // Pazarlık çalışma masası: kilitli kalemler + taşınan (diff/Sıfırla) fiyatlar.
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
  // Fiyat içe aktarma dialog durumu + paket (hook'lar erken return'den ÖNCE).
  const [bidImport, setBidImport] = useState<BidImportVariant | null>(null);
  const { company: authCompany } = useCompanyAuth();
  const [initialPrices, setInitialPrices] = useState<Record<string, string>>(
    {},
  );
  // Henüz teklif kaydı yokken seçilen dosyalar — kayıt sonrası yüklenir.
  const [stagedFiles, setStagedFiles] = useState<
    { file: File; kind: BidDocKind }[]
  >([]);
  // Sürükle-bırak alanı görsel geri bildirimi.
  const [dragActive, setDragActive] = useState(false);

  // WS: canlı eksiltme — rakip teklifi anında yansısın.
  useEffect(() => subscribeRealtime("listing", id), [id]);

  // İlan değişirse (client-side geçiş) önceki formun state'i taşınmasın.
  useEffect(() => {
    setSeeded(false);
    setItemState({});
    setSingleAmount("");
    setDeliveryTime("");
    setValidityDays("30");
    setCurrency("");
    setNote("");
    setStagedFiles([]);
    setLockedIds(new Set());
    setInitialPrices({});
  }, [id]);

  // Mevcut tekliften tohumla (taslak devam / eleme sonrası / eksiltme yeni tur).
  useEffect(() => {
    if (!l || seeded) return;
    setSeeded(true);
    const bid = l.myBid;
    const next: Record<string, ItemState> = {};
    const answerByQ = new Map(
      (bid?.answers ?? []).map((a) => [a.questionId, a.value] as const),
    );
    for (const it of l.items ?? []) {
      const bi = bid?.items?.find((x) => x.itemId === it.id);
      const answers: Record<string, string> = {};
      for (const q of it.questions ?? []) {
        answers[q.id] = answerByQ.get(q.id) ?? "";
      }
      next[it.id] = {
        price: bi ? String(Number(bi.unitPrice)) : "",
        deliveryTime: bi?.deliveryTime ?? "",
        currency: bi?.currency ?? "",
        answers,
        // Faz 3 — mevcut teklif düzenleniyorsa muadil beyanı geri yüklenir.
        isAlternative: bi?.isAlternative ?? false,
        offeredBrand: bi?.offeredBrand ?? "",
        offeredMpn: bi?.offeredMpn ?? "",
      };
    }
    setItemState(next);
    // Taşınan fiyatların anlık görüntüsü — çalışma masası diff ve Sıfırla
    // için (kullanıcı fiyatları değiştirdikçe bu sabit kalır).
    const initP: Record<string, string> = {};
    for (const [iid, stt] of Object.entries(next)) {
      if (stt.price) initP[iid] = stt.price;
    }
    setInitialPrices(initP);
    if (bid) {
      if (!l.items?.length) setSingleAmount(String(Number(bid.amount)));
      if (bid.deliveryTime) setDeliveryTime(bid.deliveryTime);
      if (bid.validityDays) setValidityDays(String(bid.validityDays));
      if (bid.note) setNote(bid.note);
      if (bid.currency) setCurrency(bid.currency);
    }
  }, [l, seeded]);

  const items = l?.items ?? [];
  const hasItems = items.length > 0;
  const myDocs = (bidDocs.data ?? []).filter((d) => d.mine);

  // Dosya ekleme — dropzone ve dosya seçici ortak kullanır. Yeni dosyalar
  // varsayılan "Teklif Mektubu" kategorisiyle gelir; kullanıcı satırdan değiştirir.
  const addFiles = (files: File[]) => {
    const MAX = 50 * 1024 * 1024;
    const tooBig = files.filter((f) => f.size > MAX);
    if (tooBig.length) {
      toast.error(
        `${tooBig.map((f) => f.name).join(", ")} 50MB sınırını aşıyor`,
      );
    }
    const ok = files
      .filter((f) => f.size <= MAX)
      .map((file) => ({ file, kind: "TEKLIF_MEKTUBU" as BidDocKind }));
    if (ok.length) setStagedFiles((s) => [...s, ...ok].slice(0, 10));
  };
  const effectiveCurrency =
    currency || l?.primaryCurrency || "TRY";
  // Madde 9 — kalem bazlı para birimi: yalnız kapalı zarf talebinde ve
  // talep birden çok birime izin veriyorsa (backend aynı kuralı zorlar).
  const canItemCurrency =
    (l?.allowedCurrencies?.length ?? 0) > 1 &&
    !l?.english?.isEnglishAuction;

  const pricedItems = useMemo(
    () =>
      items.filter((it) => {
        const st = itemState[it.id];
        return st?.price !== null && st?.price !== "" && st !== undefined;
      }),
    [items, itemState],
  );

  // Teklif verilen kalemler.
  const bidItemsForDelivery = hasItems ? pricedItems : [];
  // Genel teslim süresi, teklif verilen HER kalemin kendi süresi varsa
  // GEREKSİZ (tedarikçi ayrı ayrı girdi) → zorunlu değil, gizlenir.
  const everyBidItemHasDelivery =
    hasItems &&
    bidItemsForDelivery.length > 0 &&
    bidItemsForDelivery.every((it) => !!itemState[it.id]?.deliveryTime);

  const total = useMemo(() => {
    if (!hasItems) return Number(singleAmount) || 0;
    return pricedItems.reduce((sum, it) => {
      const p = Number(itemState[it.id]?.price ?? 0);
      return sum + (Number.isFinite(p) ? p * Number(it.quantity) : 0);
    }, 0);
  }, [hasItems, singleAmount, pricedItems, itemState]);

  // Madde 9 — birim bazında ara toplamlar: karma birimli teklifte tek sayı
  // toplamak yanıltıcı olur; birim başına gösterilir, ana birime çevrimi
  // sunucu kur damgasıyla yapar (bid.amount).
  const totalsByCurrency = useMemo(() => {
    const m = new Map<string, number>();
    if (!hasItems) return m;
    for (const it of pricedItems) {
      const st = itemState[it.id];
      const p = Number(st?.price ?? 0);
      if (!Number.isFinite(p) || p <= 0) continue;
      const cur = st?.currency || effectiveCurrency;
      m.set(cur, (m.get(cur) ?? 0) + p * Number(it.quantity));
    }
    return m;
  }, [hasItems, pricedItems, itemState, effectiveCurrency]);
  const mixedCurrency = totalsByCurrency.size > 1;
  const totalLabel = mixedCurrency
    ? [...totalsByCurrency.entries()]
        .map(([c, v]) => money(v, c))
        .join(" + ")
    : money(total, effectiveCurrency);

  // ── Pazarlık çalışma masası hesapları ──
  // Minimum pay kaldırıldı (2026-07-13): tek kural "kendi öncekinden kesin
  // iyi" + turda tek aktif gönderim. Hedef = kendi son teklifinin bir adım
  // altı; toplam kıyasları kesin aritmetikle (float drifti sunucunun
  // Decimal doğrulamasıyla çelişmesin).
  const isAuction = !!l?.english?.isEnglishAuction;
  const auctionItemsMode = isAuction && hasItems;
  const decimals = l?.decimalPlaces ?? 2;
  // Kendi son toplam — birim kilidi gereği hep teklifçinin kendi biriminde;
  // kilit yokken (ilk teklif) zaten null.
  const ownLastTotal =
    (isAuction &&
      l?.nextBidConstraint?.ownCurrency === effectiveCurrency &&
      l?.nextBidConstraint?.ownLastTotal) ||
    null;
  const canBidThisRound = l?.nextBidConstraint?.canBidThisRound ?? true;

  // Kalem id → formdaki fiyat (çalışma masası prop'u; null = kapsam dışı).
  const priceMap = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const it of items) m[it.id] = itemState[it.id]?.price ?? "";
    return m;
  }, [items, itemState]);

  const exactTotalStr = useMemo(() => {
    if (!isAuction) return "0";
    if (!hasItems) {
      return singleAmount && Number(singleAmount) > 0 ? singleAmount : "0";
    }
    return exactTotal(
      pricedItems.map((it) => ({
        quantity: it.quantity,
        unitPrice: itemState[it.id]?.price ?? "0",
      })),
    );
  }, [isAuction, hasItems, singleAmount, pricedItems, itemState]);

  // KIYAS AYNI KALEMLER BAZINDA: monotonluk, önceki teklifte FİYATLANMIŞ
  // kalemlerin yeni ara toplamına bakar — önceki toplam da yalnız onları
  // kapsıyordu (elma-elma). Yeni eklenen kalem serbest (ilk teklif
  // muamelesi, kıyasa girmez); önceden fiyatlanmış kalem BIRAKILAMAZ
  // (sunucu da reddeder). Kalemsizde ara toplam = toplam.
  const prevPricedIds = useMemo(() => {
    if (!isAuction || l?.myBid?.status !== "SUBMITTED")
      return new Set<string>();
    return new Set(
      (l?.myBid?.items ?? [])
        .filter((x) => Number(x.unitPrice) > 0)
        .map((x) => x.itemId),
    );
  }, [isAuction, l?.myBid]);
  const comparableTotalStr = useMemo(() => {
    if (!hasItems || prevPricedIds.size === 0) return exactTotalStr;
    return exactTotal(
      items
        .filter((it) => prevPricedIds.has(it.id))
        .map((it) => {
          const p = itemState[it.id]?.price;
          return {
            quantity: it.quantity,
            unitPrice: p && Number(p) > 0 ? p : "0",
          };
        }),
    );
  }, [hasItems, prevPricedIds, exactTotalStr, items, itemState]);
  // Kapsam genişledi mi (yeni kalem fiyatlandı) — mesaj dili buna göre.
  const scopeExpanded =
    hasItems &&
    prevPricedIds.size > 0 &&
    pricedItems.some((it) => !prevPricedIds.has(it.id));

  // Efektif hedef = monotonluk sınırı: kendi son teklifinin bir adım
  // altı ("kesin daha iyi" kuralının sayısal karşılığı). İlk teklifte
  // (ownLast yok) hedef kısıtı yoktur.
  const effectiveTarget = useMemo(() => {
    if (!ownLastTotal) return null;
    return decSub(ownLastTotal, unitStep(decimals));
  }, [ownLastTotal, decimals]);

  const workbenchTarget: WorkbenchTarget = useMemo(() => {
    // met/kalan kıyası AYNI KALEMLER ara toplamıyla (kapsam genişletme
    // toplamı büyütse de kural sağlanabilir).
    const hasAmount = cmpDecimal(comparableTotalStr, "0") === 1;
    const met =
      effectiveTarget != null &&
      hasAmount &&
      cmpDecimal(comparableTotalStr, effectiveTarget) <= 0;
    return {
      effectiveTarget,
      ownLastTotal,
      exactTotalStr,
      comparableTotalStr,
      met,
      remaining:
        effectiveTarget != null && !met && hasAmount
          ? decSub(comparableTotalStr, effectiveTarget)
          : "0",
      noReference: !ownLastTotal,
    };
  }, [effectiveTarget, ownLastTotal, exactTotalStr, comparableTotalStr]);

  if (detail.isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-sm text-zinc-500">
        Yükleniyor…
      </div>
    );
  }
  if (!l) {
    // 403 TIER_REQUIRED (ücretsiz üye, herkese açık talep, 2026-09-06): "bulunamadı"
    // yalan olurdu — talep var, paket yok. Talep sayfasıyla aynı kilit kartı.
    const err = (detail.error as { response?: { status?: number; data?: { code?: string } } } | null)?.response;
    if (err?.status === 403 && err.data?.code === "TIER_REQUIRED") {
      return (
        <div className="mx-auto max-w-3xl px-4 py-10">
          <SilverLockCard
            title="Bu herkese açık talebe teklif Silver paketiyle açılır"
            description="Herkese açık satın alma taleplerini görmek ve teklif vermek Silver ile gelir. Bağlantı davetiyle gelen taleplere ücretsiz teklif verirsiniz."
          />
        </div>
      );
    }
    // Talep yüklenemedi — nötr hedef.
    return <Blocked title="Satın Alma Talebi bulunamadı" detailHref="/company" />;
  }

  // ── Kapılar ──
  if (l.isOwner) {
    return <Blocked title="Kendi ilanınıza teklif veremezsiniz" detailHref={detailHref} />;
  }
  if (!l.canBid) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <Lock className="mx-auto h-8 w-8 text-amber-500" aria-hidden="true" />
        <Heading className="mt-3">Teklif için Silver paketi gerekir</Heading>
        <Text className="mt-2 text-sm text-zinc-500">
          Herkese açık satın alma taleplerine teklif vermek Silver ile gelir. Bağlantı
          davetiyle gelen taleplere ücretsiz teklif verirsiniz.
        </Text>
        <div className="mt-5 flex items-center justify-center gap-3">
          <Button href={PRICING_HREF}>Paketleri Gör</Button>
          <Button href={detailHref} outline>
            Satın Alma Talebi Detayına Dön
          </Button>
        </div>
      </div>
    );
  }
  if (l.roleAllowsBid === false) {
    return (
      <Blocked
        title="Açık talebe teklif için Satışçı rolü gerekir — firma yöneticinizden rol isteyin"
        detailHref={detailHref}
      />
    );
  }
  // GÖNDERİM SÜRERKEN/AZ ÖNCE GÖNDERİLDİĞİNDE: onSuccess içindeki cache
  // yazımı isSuccess bayrağından ÖNCE ulaşır — aşağıdaki kapılar (zaten
  // verildi / tur hakkı doldu) router.push tamamlanmadan devreye girip
  // "Satın Alma Talebi Detayına Dön" ekranı flaşlıyordu. Pending dahil tek durum
  // ekranı göster; dönüş otomatik.
  if (placeBid.isPending || placeBid.isSuccess) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center text-sm text-zinc-500">
        {placeBid.isSuccess
          ? "Teklifin gönderildi — satın alma talebi detayına dönülüyor…"
          : "Teklifin gönderiliyor…"}
      </div>
    );
  }
  if (l.status !== "OPEN") {
    return <Blocked title="Bu satın alma talebine artık teklif verilemez" detailHref={detailHref} />;
  }
  if (l.myBid?.status === "WITHDRAWN") {
    return (
      <Blocked
        title="Teklifinizi geri çektiniz — yeniden teklif veremezsiniz"
        detailHref={detailHref}
      />
    );
  }
  if (l.myBid?.status === "SUBMITTED" && !l.english?.isEnglishAuction) {
    return (
      <Blocked
        title="Teklif zaten verildi — değişiklik için alıcıyla iletişime geçin"
        detailHref={detailHref}
      />
    );
  }
  // Pazarlıkta turda tek aktif gönderim: hak kullanıldıysa form kapalı.
  // Taşınan (carry-over) teklif hak yakmaz — sunucu ayrımı yapar (canBidThisRound).
  if (
    l.english?.isEnglishAuction &&
    l.myBid?.status === "SUBMITTED" &&
    !canBidThisRound
  ) {
    return (
      <Blocked
        title="Bu turdaki teklifiniz verildi — ilan sahibi yeni tur açarsa güncelleyebilirsiniz"
        detailHref={detailHref}
      />
    );
  }

  const isRebidAfterLoss = l.myBid?.status === "LOST";
  const isAuctionRebid =
    l.myBid?.status === "SUBMITTED" && !!l.english?.isEnglishAuction;
  const pageTitle = isAuctionRebid
    ? "Yeni Teklif Ver"
    : isRebidAfterLoss
      ? "Yeniden Teklif Ver"
      : "Teklif Ver";

  const days = daysUntil(l.closesAt);
  const deadlineClass =
    days !== null && days <= 1
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : days !== null && days <= 3
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-zinc-200 bg-zinc-50 text-zinc-600";

  const setItem = (itemId: string, patch: Partial<ItemState>) =>
    setItemState((s) => ({
      ...s,
      [itemId]: { ...(s[itemId] ?? { price: "", deliveryTime: "", currency: "", answers: {}, isAlternative: false, offeredBrand: "", offeredMpn: "" }), ...patch },
    }));

  // Fiyat içe aktarma (Faz 2, 2026-08-22): "Excel Şablonu ile Fiyatla" (AI'sız,
  // her paket) + "Belgeden Fiyatla (AI)" (Silver+). Yalnız itemState dolar;
  // gönderme aynı akış (monotonluk/award nöbetçisi/zorunlu-kalem kapıları aynen).
  const aiAllowed = tierAtLeast(authCompany?.tier ?? "STANDART", "SILVER");
  const applyImportedPrices = (rows: BidImportApplyRow[]) => {
    setItemState((s) => {
      const out = { ...s };
      for (const r of rows) {
        if (lockedIds.has(r.itemId)) continue; // çalışma masasında kilitli kalem korunur
        const prev = out[r.itemId] ?? { price: "", deliveryTime: "", currency: "", answers: {}, isAlternative: false, offeredBrand: "", offeredMpn: "" };
        out[r.itemId] = {
          ...prev,
          price: String(r.unitPrice),
          // Kalem bazlı para birimi YALNIZ `canItemCurrency` koşullarında
          // geçerli (Madde 9: kapalı zarf + çok birimli talep). Eskiden
          // yalnız `multiCurrency` bakılıyordu; pazarlık taleplerinde forma
          // birim yazılıp gönderim backend kapısına takılıyordu
          // (denetim 2026-08-24 Parça 6).
          currency: canItemCurrency && r.currency ? r.currency : prev.currency,
          deliveryTime: r.deliveryTime ?? prev.deliveryTime,
        };
      }
      return out;
    });
    const skipped = rows.filter((r) => lockedIds.has(r.itemId)).length;
    toast.success(
      `${rows.length - skipped} kalemin fiyatı forma yazıldı${skipped ? ` (${skipped} kilitli kalem atlandı)` : ""} — göndermeden önce kontrol edin`,
    );
  };
  const bidImportButtons =
    hasItems && l ? (
      <div className="flex flex-wrap items-center gap-2">
        <Button outline onClick={() => setBidImport("excel")}>
          <FileSpreadsheet className="h-4 w-4" />
          Excel Şablonu ile Fiyatla
        </Button>
        <Button
          outline
          disabled={!aiAllowed}
          title={aiAllowed ? undefined : "Belgeden fiyatlama Silver ve üzeri paketlerde"}
          onClick={() => setBidImport("ai")}
        >
          <Sparkles className="h-4 w-4" />
          Belgeden Fiyatla (AI)
          {!aiAllowed ? <Lock className="h-3.5 w-3.5 text-zinc-400" aria-hidden /> : null}
        </Button>
      </div>
    ) : null;

  // Çalışma masası araçları: toplu fiyat yazımı + kalem kilidi.
  const applyPrices = (next: Record<string, string>) =>
    setItemState((s) => {
      const out = { ...s };
      for (const [iid, p] of Object.entries(next)) {
        out[iid] = {
          ...(out[iid] ?? { price: "", deliveryTime: "", currency: "", answers: {}, isAlternative: false, offeredBrand: "", offeredMpn: "" }),
          price: p,
        };
      }
      return out;
    });
  const toggleLock = (itemId: string) =>
    setLockedIds((s) => {
      const n = new Set(s);
      if (n.has(itemId)) n.delete(itemId);
      else n.add(itemId);
      return n;
    });
  // Tablo satırının genişleyen ek alanları — kart görünümüyle aynı bileşenler
  // (teslim tarihi + kalem soruları), tek kaynak.
  // Çalışma masası satır durumu: fiyatlanmış kalemde CEVAPSIZ zorunlu soru
  // (amber rozet + satır açık gelir) + girilmiş kalem teslim tarihi özeti —
  // ikisi de chevron arkasında gizli kalıp gözden kaçmasın.
  const workbenchRowMeta = (it: ListingItemRow) => {
    const st = itemState[it.id];
    const priced = st?.price != null && st.price !== "" && Number(st.price) > 0;
    const requiredMissing =
      priced &&
      (it.questions ?? []).some(
        (q) => q.required && !(st?.answers[q.id] ?? "").trim(),
      );
    const note = st?.deliveryTime
      ? `Teslim: ${bidDeliveryTimeLabel(st.deliveryTime)}`
      : null;
    return { requiredMissing, note };
  };

  const renderItemExtras = (it: ListingItemRow) => {
    const st = itemState[it.id];
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isAuctionRebid ? null : (
        <Field>
          <Label>Kalem Teslim Süresi (opsiyonel)</Label>
          <Select
            aria-label={`${it.name} teslim süresi`}
            value={st?.deliveryTime ?? ""}
            onChange={(e) => setItem(it.id, { deliveryTime: e.target.value })}
          >
            <option value="">Genel süre geçerli</option>
            {BID_DELIVERY_TIMES.map((t) => (
              <option key={t} value={t}>
                {BID_DELIVERY_TIME_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        )}
        {canItemCurrency ? (
          <Field>
            <Label>Kalem Para Birimi</Label>
            <Select
              aria-label={`${it.name} para birimi`}
              value={st?.currency ?? ""}
              onChange={(e) => setItem(it.id, { currency: e.target.value })}
            >
              <option value="">Ana birim ({effectiveCurrency})</option>
              {(l.allowedCurrencies ?? [])
                .filter((c) => c !== effectiveCurrency)
                .map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
            </Select>
          </Field>
        ) : null}
        {/* Faz 3 — MUADİL beyanı. Yalnız alıcı izin verdiyse görünür; izin
            yoksa alan HİÇ çıkmaz (tedarikçiye uygulanamayacak bir seçenek
            göstermek kafa karıştırır). Alıcının istediği marka varsa
            hatırlatılır ki tedarikçi ne yerine ne önerdiğini bilsin. */}
        {it.alternativeAllowed !== false ? (
          <Field className="sm:col-span-2">
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-zinc-300"
                checked={st?.isAlternative ?? false}
                onChange={(e) =>
                  setItem(it.id, { isAlternative: e.target.checked })
                }
              />
              <span className="text-sm">
                <span className="font-medium text-zinc-800">
                  Muadil (eşdeğer) ürün teklif ediyorum
                </span>
                {it.brand || it.mpn ? (
                  <span className="block text-xs text-zinc-500">
                    İstenen: {[it.brand, it.mpn].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
              </span>
            </label>
          </Field>
        ) : null}
        {it.alternativeAllowed !== false && st?.isAlternative ? (
          <>
            <Field>
              <Label>Teklif Ettiğiniz Marka</Label>
              <Input
                aria-label={`${it.name} teklif edilen marka`}
                value={st?.offeredBrand ?? ""}
                onChange={(e) =>
                  setItem(it.id, { offeredBrand: e.target.value })
                }
              />
            </Field>
            <Field>
              <Label>Teklif Ettiğiniz Parça No</Label>
              <Input
                aria-label={`${it.name} teklif edilen parça no`}
                value={st?.offeredMpn ?? ""}
                onChange={(e) => setItem(it.id, { offeredMpn: e.target.value })}
              />
            </Field>
          </>
        ) : null}
        {(it.questions ?? []).map((q) => (
          <AnswerInput
            key={q.id}
            q={q}
            value={st?.answers[q.id] ?? ""}
            onChange={(v) =>
              setItem(it.id, {
                answers: { ...(st?.answers ?? {}), [q.id]: v },
              })
            }
          />
        ))}
      </div>
    );
  };

  // ── Doğrulama (gönderim) ──
  const submitProblems = (): string[] => {
    const problems: string[] = [];
    // Form mevcut tekliften henüz tohumlanmadıysa susmalı — boş state'e
    // bakıp "fiyat gir / bırakılamaz" gibi SAHTE hatalar flaşlıyordu.
    if (!seeded) return problems;
    if (hasItems) {
      if (pricedItems.length === 0)
        problems.push("En az bir kaleme birim fiyat girin.");
      if (l.requireAllItems && pricedItems.length < items.length)
        problems.push("Bu satın alma talebinde tüm kalemlere teklif vermelisiniz.");
    } else {
      // F4: min 0.01 + 2 ondalık + MAX_MONEY (backend place-bid.dto birebir).
      if (!singleAmount) problems.push("Geçerli bir tutar girin.");
      else {
        const e = moneyInputError(Number(singleAmount));
        if (e) problems.push(e);
      }
    }
    if (hasItems) {
      for (const it of pricedItems) {
        for (const q of it.questions ?? []) {
          if (q.required && !(itemState[it.id]?.answers[q.id] ?? "").trim()) {
            problems.push(`"${it.name}" kalemi için zorunlu soru cevaplanmadı.`);
            break;
          }
        }
      }
      // F4: fiyatlanan her kalem >0 + 2 ondalık + MAX_MONEY (backend unitPrice birebir).
      for (const it of pricedItems) {
        const e = moneyInputError(Number(itemState[it.id]?.price ?? 0));
        if (e) {
          problems.push(`"${it.name}" kalemi birim fiyatı: ${e}.`);
          break;
        }
      }
    }
    // Genel teslim süresi yalnız kalem süresi GİRİLMEYEN kalem varsa zorunlu.
    // Madde 14: pazarlık rebid'inde teslim bilgisi taşınan tekliften korunur —
    // yeniden istenmez (backend de mevcut değeri korur).
    if (!isAuctionRebid && !everyBidItemHasDelivery && !deliveryTime)
      problems.push(
        "Teslim süresi zorunlu (süre girmediğiniz kalemler için).",
      );
    // Madde 15: pazarlıkta geçerlilik sorulmaz — teklif süresizdir.
    if (!isAuction && (!validityDays || Number(validityDays) < 1))
      problems.push("Geçerlilik süresi zorunlu.");
    if (l.requireBidDocument && myDocs.length + stagedFiles.length === 0)
      problems.push("Bu satın alma talebinde teklif dosyası zorunlu.");
    // İngiliz usulü yeniden teklif: monotonluk ön-kontrolü AYNI KALEMLER
    // ara toplamıyla (düşmeli) — yeni eklenen kalem kıyasa girmez, önceden
    // fiyatlanmış kalem bırakılamaz (sunucu da aynı kuralları zorlar; burada
    // anlık geri bildirim).
    if (
      l.english?.isEnglishAuction &&
      l.myBid?.status === "SUBMITTED" &&
      effectiveCurrency === (l.myBid.currency ?? l.primaryCurrency ?? "TRY")
    ) {
      if (hasItems && prevPricedIds.size > 0) {
        for (const it of items) {
          if (!prevPricedIds.has(it.id)) continue;
          const p = itemState[it.id]?.price;
          if (!(p != null && Number(p) > 0))
            problems.push(
              `Pazarlıkta önceden fiyatladığınız kalem bırakılamaz — "${it.name}" için fiyat girin.`,
            );
        }
      }
      const own = Number(l.myBid.amount);
      const scopeNote = scopeExpanded
        ? "önceden fiyatladığınız kalemlerin toplamı"
        : "yeni teklifin";
      if (cmpDecimal(comparableTotalStr, "0") === 1) {
        if (cmpDecimal(comparableTotalStr, l.myBid.amount) >= 0)
          problems.push(
            `Açık eksiltme: ${scopeNote} önceki teklifinin (${money(own, effectiveCurrency)}) altında olmalı.`,
          );
      }
    }
    // NOT: eski "toplam en fazla X olabilir" (sınır = öncekinin 1 kuruş
    // altı) uyarısı kaldırıldı — yukarıdaki "öncekinden düşük olmalı"
    // kuralının kafa karıştıran kuruşlu tekrarıydı; kuruş-altı uç
    // durumda sunucu kesin Decimal kıyasla zaten reddeder.
    return problems;
  };

  /**
   * Seçilen dosyaları yükler. Başarısız olanlar STAGED listede KALIR (kullanıcı
   * tekrar deneyebilir — eskiden sessizce kayboluyordu). Başarı sayısını döner.
   */
  const uploadStaged = async (): Promise<{ ok: boolean }> => {
    if (stagedFiles.length === 0) return { ok: true };
    const failed: { file: File; kind: BidDocKind }[] = [];
    let lastError: unknown = null;
    for (const sf of stagedFiles) {
      try {
        await uploadDoc.mutateAsync(sf);
      } catch (err) {
        lastError = err;
        failed.push(sf);
      }
    }
    setStagedFiles(failed);
    if (failed.length > 0) {
      toast.error(
        `${failed.length} dosya yüklenemedi (${extractErrorMessage(
          lastError,
          "bilinmeyen hata",
        )}) — listede kaldı, tekrar deneyin`,
      );
      return { ok: false };
    }
    return { ok: true };
  };

  const buildPayload = (asDraft: boolean) => ({
    asDraft,
    note: note.trim() || undefined,
    deliveryTime: deliveryTime || undefined,
    validityDays:
      isAuction ? undefined : validityDays ? Number(validityDays) : undefined,
    currency: currency || undefined,
    ...(hasItems
      ? {
          items: pricedItems.map((it) => {
            const st = itemState[it.id]!;
            return {
              itemId: it.id,
              unitPrice: Number(st.price),
              deliveryTime: st.deliveryTime || undefined,
              currency: st.currency || undefined,
              // Faz 3: yalnız alıcı izin verdiyse anlamlı. Sunucu zaten
              // bayrağı `alternativeAllowed`a göre düşürüyor (tedarikçi
              // kuralı aşamaz) — burada da göndermiyoruz.
              isAlternative:
                it.alternativeAllowed !== false && st.isAlternative
                  ? true
                  : undefined,
              offeredBrand: st.offeredBrand.trim() || undefined,
              offeredMpn: st.offeredMpn.trim() || undefined,
              answers: (it.questions ?? [])
                .map((q) => ({
                  questionId: q.id,
                  value: (st.answers[q.id] ?? "").trim(),
                }))
                .filter((a) => a.value),
            };
          }),
        }
      : { amount: Number(singleAmount) }),
  });

  const saveDraft = async () => {
    try {
      await placeBid.mutateAsync(buildPayload(true));
      const up = await uploadStaged();
      if (up.ok) {
        toast.success("Taslak kaydedildi");
        router.push(detailHref);
      } else {
        // Yükleme başarısız: taslak kaydedildi ama dosyalar bekliyor —
        // çelişkili success yerine tek net mesaj (hata toast'ı uploadStaged attı).
        toast.info("Taslak kaydedildi — yüklenemeyen dosyalar listede bekliyor");
      }
    } catch (err) {
      toast.error(extractErrorMessage(err, "Taslak kaydedilemedi"));
    }
  };

  /**
   * İKİ AŞAMALI gönderim: dosya varsa önce TASLAK kaydet → dosyaları yükle →
   * sonra gönder. Böylece belge-zorunlu ihalede teklif hiçbir zaman belgesiz
   * SUBMITTED kalmaz (backend de submit'te belge sayısını doğrular).
   */
  const submit = async () => {
    setConfirmOpen(false);
    try {
      if (stagedFiles.length > 0) {
        // Taslak adımı yalnız hiç teklif kaydı yokken (dosyaların bağlanacağı
        // satır oluşsun diye). Mevcut kayıt varsa atlanır — özellikle açık
        // eksiltmede gönderilmiş teklifi DRAFT'a düşürmek yarıştan düşürürdü.
        if (!l.myBid) {
          await placeBid.mutateAsync(buildPayload(true));
        }
        const up = await uploadStaged();
        if (!up.ok) return; // staged korunur; kullanıcı tekrar dener
      }
      await placeBid.mutateAsync(buildPayload(false));
      toast.success("Teklifiniz gönderildi");
      router.push(detailHref);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Teklif gönderilemedi"));
    }
  };

  const problems = submitProblems();
  const filledRatio = hasItems
    ? Math.round((pricedItems.length / Math.max(items.length, 1)) * 100)
    : singleAmount
      ? 100
      : 0;

  return (
    // P1 (denetim §4.2): sayfa mantıksal bir form — Enter, doğrulama
    // temizse onay diyaloğunu açar (buton akışıyla birebir).
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (problems.length === 0 && !placeBid.isPending) {
          setConfirmOpen(true);
        }
      }}
    >
      <Link
        href={detailHref}
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
        {l.number ?? "Satın Alma Talebi"}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading>{pageTitle}</Heading>
        {l.closesAt ? (
          <span
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-semibold",
              deadlineClass,
            )}
          >
            Kapanış: {formatDateTime(l.closesAt)}
            {days !== null && days >= 0
              ? ` · ${days === 0 ? "bugün" : `${days} gün`}`
              : ""}
          </span>
        ) : null}
      </div>

      {isRebidAfterLoss && l.myBid?.eliminationReason ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-semibold">Önceki teklifin eleme gerekçesi:</span>{" "}
            {l.myBid.eliminationReason}
          </p>
        </div>
      ) : null}

      {l.english?.isEnglishAuction ? (
        <AuctionLiveCard l={l} bidderCurrency={effectiveCurrency} />
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Sol — form */}
        <div className="space-y-5 lg:col-span-2">
          {/* Talep özeti */}
          <section className="card p-5">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-zinc-500">Alıcı</dt>
                <dd className="truncate font-medium text-zinc-900">
                  {l.owner?.name ?? "Gizli firma"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Kapanış</dt>
                <dd className="font-medium text-zinc-900">
                  {l.closesAt ? formatDateTime(l.closesAt) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Kalem</dt>
                <dd className="font-medium text-zinc-900">{items.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Para Birimi</dt>
                <dd className="font-medium text-zinc-900">
                  {effectiveCurrency}
                </dd>
              </div>
            </dl>
            {(l.allowedCurrencies?.length ?? 0) <= 1 ? (
              <Text className="mt-2 text-xs text-zinc-400">
                Para birimi alıcı tarafından belirlendi.
              </Text>
            ) : null}
          </section>

          {l && bidImport ? (
            <BidImportDialog
              open
              variant={bidImport}
              listingId={l.id}
              currencyLabel={effectiveCurrency}
              onClose={() => setBidImport(null)}
              onApply={applyImportedPrices}
            />
          ) : null}

          {/* Kalem fiyatları — pazarlıkta çalışma masası (hedef çubuğu +
              toplu araçlar + kompakt tablo), diğer akışlarda kart listesi. */}
          {hasItems && auctionItemsMode ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Subheading>Kalem Fiyatları</Subheading>
                {bidImportButtons}
              </div>
              {l.requireAllItems ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Bu satın alma talebinde <strong>tüm kalemlere</strong> teklif vermek zorunlu.
                </div>
              ) : null}
              <AuctionBidWorkbench
                items={items}
                prices={priceMap}
                initialPrices={initialPrices}
                setPrice={(iid, p) => setItem(iid, { price: p })}
                applyPrices={applyPrices}
                lockedIds={lockedIds}
                toggleLock={toggleLock}
                currency={effectiveCurrency}
                decimals={decimals}
                target={workbenchTarget}
                defaultPercent="5"
                requireAllItems={!!l.requireAllItems}
                mandatoryIds={prevPricedIds}
                rowMeta={workbenchRowMeta}
                renderItemExtras={renderItemExtras}
              />
            </section>
          ) : hasItems ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Subheading>Kalem Fiyatları</Subheading>
                {bidImportButtons}
              </div>
              {l.requireAllItems ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Bu satın alma talebinde <strong>tüm kalemlere</strong> teklif vermek zorunlu.
                </div>
              ) : null}
              <div className="space-y-3">
                {items.map((it, idx) => {
                  const st = itemState[it.id];
                  const optedOut = st?.price === null;
                  const lineTotal =
                    st?.price && Number(st.price) > 0
                      ? Number(st.price) * Number(it.quantity)
                      : null;
                  return (
                    <div
                      key={it.id}
                      className={cn(
                        "rounded-xl border bg-white p-4",
                        optedOut
                          ? "border-zinc-100 opacity-60"
                          : "border-zinc-950/10",
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-zinc-100 text-xs font-semibold text-zinc-600">
                              {idx + 1}
                            </span>
                            <p className="font-medium text-zinc-900">{it.name}</p>
                            {optedOut ? (
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                                Hariç
                              </span>
                            ) : null}
                            {(it.questions?.length ?? 0) > 0 ? (
                              <Badge color="zinc">
                                {it.questions!.length} soru
                              </Badge>
                            ) : null}
                          </div>
                          {it.description ? (
                            <p className="mt-1 text-xs text-zinc-500">
                              {it.description}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-zinc-500">
                            {Number(it.quantity)} {it.unit}
                            {it.materialCode ? ` · ${it.materialCode}` : ""}
                            {it.targetPrice
                              ? ` · Hedef: ${money(Number(it.targetPrice), effectiveCurrency)}`
                              : ""}
                          </p>
                        </div>

                        {optedOut ? (
                          <button
                            type="button"
                            onClick={() => setItem(it.id, { price: "" })}
                            className="text-xs font-semibold text-blue-600 hover:underline"
                          >
                            Kalemi geri ekle
                          </button>
                        ) : (
                          <div className="flex items-start gap-2">
                            <div className="w-36">
                              <Field>
                                <Label>Birim Fiyat</Label>
                                <MoneyInput
                                  aria-label={`${it.name} birim fiyat`}
                                  value={st?.price ?? ""}
                                  onChange={(raw) =>
                                    setItem(it.id, { price: raw })
                                  }
                                />
                              </Field>
                              {lineTotal !== null ? (
                                <p className="mt-1 text-right text-xs font-semibold text-zinc-700 tabular-nums">
                                  = {money(lineTotal, st?.currency || effectiveCurrency)}
                                </p>
                              ) : null}
                            </div>
                            {!l.requireAllItems ? (
                              /* §10.4: anlamı belirsiz × yerine etiketli
                                 anahtar — geri alma "Kalemi geri ekle". */
                              <button
                                type="button"
                                onClick={() =>
                                  setItem(it.id, { price: null })
                                }
                                className="mt-7 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-red-50 hover:text-red-600"
                              >
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="hidden sm:inline">
                                  Bu kaleme teklif vermiyorum
                                </span>
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>

                      {!optedOut ? (
                        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-zinc-50 pt-3 sm:grid-cols-2">
                          {isAuctionRebid ? null : (
                          <Field>
                            <Label>Kalem Teslim Süresi (opsiyonel)</Label>
                            <Select
                              aria-label={`${it.name} teslim süresi`}
                              value={st?.deliveryTime ?? ""}
                              onChange={(e) =>
                                setItem(it.id, { deliveryTime: e.target.value })
                              }
                            >
                              <option value="">Genel süre geçerli</option>
                              {BID_DELIVERY_TIMES.map((t) => (
                                <option key={t} value={t}>
                                  {BID_DELIVERY_TIME_LABELS[t]}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          )}
                          {canItemCurrency ? (
                            <Field>
                              <Label>Kalem Para Birimi</Label>
                              <Select
                                aria-label={`${it.name} para birimi`}
                                value={st?.currency ?? ""}
                                onChange={(e) =>
                                  setItem(it.id, { currency: e.target.value })
                                }
                              >
                                <option value="">
                                  Ana birim ({effectiveCurrency})
                                </option>
                                {(l.allowedCurrencies ?? [])
                                  .filter((c) => c !== effectiveCurrency)
                                  .map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                              </Select>
                            </Field>
                          ) : null}
                          {(it.questions ?? []).map((q) => (
                            <AnswerInput
                              key={q.id}
                              q={q}
                              value={st?.answers[q.id] ?? ""}
                              onChange={(v) =>
                                setItem(it.id, {
                                  answers: { ...(st?.answers ?? {}), [q.id]: v },
                                })
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-zinc-400 italic">
                          Bu kaleme teklif verilmeyecek.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="space-y-3">
              <Subheading>Teklif Tutarı</Subheading>
              <p className="text-xs text-zinc-400">{KDV_HARIC_NOTE}</p>
              <div className="rounded-xl border border-zinc-950/10 bg-white p-4">
                <Field>
                  <Label>Tutar ({effectiveCurrency})</Label>
                  <MoneyInput value={singleAmount} onChange={setSingleAmount} />
                </Field>
                {isAuction && effectiveTarget ? (
                  <p
                    className={cn(
                      "mt-2 text-xs",
                      workbenchTarget.met
                        ? "text-emerald-700"
                        : "text-amber-700",
                    )}
                  >
                    Önceki teklifinden düşük olmalı:{" "}
                    <strong className="tabular-nums">
                      ≤ {money(Number(effectiveTarget), effectiveCurrency)}
                    </strong>
                    {workbenchTarget.met ? " — uygun ✓" : ""}
                  </p>
                ) : null}
              </div>
            </section>
          )}

          {/* Teslim & geçerlilik */}
          <section className="space-y-3">
            <Subheading>Teslim &amp; Geçerlilik</Subheading>
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-950/10 bg-white p-4 sm:grid-cols-3">
              <Field>
                <Label>
                  Genel Teslim Süresi
                  {everyBidItemHasDelivery || isAuctionRebid ? "" : " *"}
                </Label>
                {isAuctionRebid ? (
                  <p className="pt-2 text-xs text-zinc-500">
                    Teslim bilgisi mevcut teklifinizden taşındı — yeniden
                    sorulmaz.
                  </p>
                ) : everyBidItemHasDelivery ? (
                  <p className="pt-2 text-xs text-emerald-700">
                    Her kaleme ayrı teslim süresi girdiniz — genel süreye gerek
                    yok.
                  </p>
                ) : (
                  <>
                    <Select
                      value={deliveryTime}
                      onChange={(e) => setDeliveryTime(e.target.value)}
                      aria-label="Genel teslim süresi"
                    >
                      <option value="">Seçin…</option>
                      {BID_DELIVERY_TIMES.map((t) => (
                        <option key={t} value={t}>
                          {BID_DELIVERY_TIME_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                    {hasItems ? (
                      <p className="mt-1 text-xs text-zinc-400">
                        Kalem süresi girmediğiniz kalemler için geçerli olur.
                      </p>
                    ) : null}
                  </>
                )}
              </Field>
              <Field>
                <Label>
                  Teklif Geçerlilik Süresi{isAuction ? "" : " (gün) *"}
                </Label>
                {isAuction ? (
                  <p className="pt-2 text-xs text-zinc-500">
                    Pazarlıkta teklifler <strong>süresiz</strong> geçerlidir —
                    ayrıca sorulmaz.
                  </p>
                ) : (
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={validityDays}
                    onChange={(e) => setValidityDays(e.target.value)}
                  />
                )}
              </Field>
              {(l.allowedCurrencies?.length ?? 0) > 1 ? (
                <Field>
                  <Label>Para Birimi</Label>
                  <Select
                    value={currency || l.primaryCurrency}
                    onChange={(e) => setCurrency(e.target.value)}
                    // Açık eksiltmede birim ilk gönderilmiş teklifle kilitlenir
                    // (backend de reddeder) — kur oynamasıyla adım kuralı
                    // oynanamaz; azaltma hep kendi biriminde işler.
                    disabled={isAuctionRebid}
                  >
                    {l.allowedCurrencies!.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                  {isAuctionRebid ? (
                    <p className="mt-1 text-xs text-zinc-400">
                      Açık eksiltmede para birimi ilk teklifle kilitlenir.
                    </p>
                  ) : null}
                </Field>
              ) : null}
            </div>
            <Text className="text-xs text-zinc-400">
              Kalem-özel teslim tarihi girilmeyen kalemler için genel teslim
              tarihi geçerlidir.
            </Text>
          </section>

          {/* Not */}
          <section className="space-y-3">
            <Subheading>Teklif Notu</Subheading>
            <div className="rounded-xl border border-zinc-950/10 bg-white p-4">
              <Textarea
                rows={3}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Alıcıya iletmek istediğiniz not (opsiyonel)"
              />
            </div>
          </section>

          {/* Teklif dosyaları — sürükle-bırak + dosya başına kategori. Teminat
              burada YOK; kazandırma sonrası sipariş aşamasında yüklenir. */}
          <section className="space-y-3">
            <Subheading>
              Teklif Dosyaları{l.requireBidDocument ? " (zorunlu)" : ""}
            </Subheading>
            <div className="space-y-3 rounded-xl border border-zinc-950/10 bg-white p-4">
              {l.requireBidDocument ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Bu satın alma talebinde teklif dosyası zorunlu — en az bir dosya ekleyin.
                </p>
              ) : null}

              {/* Sürükle-bırak alanı */}
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  addFiles(Array.from(e.dataTransfer.files));
                }}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
                  dragActive
                    ? "border-blue-400 bg-blue-50"
                    : "border-zinc-200 bg-zinc-50/60 hover:border-zinc-300"
                }`}
              >
                <UploadCloud className="h-6 w-6 text-zinc-400" aria-hidden="true" />
                <p className="text-sm font-medium text-zinc-700">
                  Dosyaları sürükleyin ya da{" "}
                  <span className="text-blue-600">seçmek için tıklayın</span>
                </p>
                <p className="text-xs text-zinc-400">
                  PDF, görsel veya Excel · dosya başına en fazla 50 MB
                </p>
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls"
                  aria-label="Teklif dosyası seç"
                  onChange={(e) => {
                    addFiles(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
              </label>

              {/* Dosya listesi — yüklü belgeler + gönderimde yüklenecek dosyalar */}
              {myDocs.length === 0 && stagedFiles.length === 0 ? (
                <p className="text-center text-xs text-zinc-400">
                  Henüz dosya eklenmedi.
                </p>
              ) : (
                <ul className="space-y-2">
                  {myDocs.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-2"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1 truncate text-sm text-blue-600 hover:underline"
                      >
                        {d.fileName}
                      </a>
                      <span className="hidden shrink-0 rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 sm:inline">
                        {BID_DOC_KIND_LABELS[d.kind]}
                      </span>
                      <span className="shrink-0 text-xs font-medium text-emerald-600">
                        Yüklendi
                      </span>
                      <button
                        type="button"
                        aria-label={`${d.fileName} belgesini sil`}
                        disabled={deleteDoc.isPending}
                        onClick={async () => {
                          if (
                            !(await confirm({
                              title: "Belge silinsin mi?",
                              description: `"${d.fileName}" kalıcı olarak silinecek.`,
                              confirmLabel: "Sil",
                              destructive: true,
                            }))
                          )
                            return;
                          try {
                            await deleteDoc.mutateAsync(d.id);
                            toast.success("Belge silindi");
                          } catch (err) {
                            toast.error(
                              extractErrorMessage(err, "Belge silinemedi"),
                            );
                          }
                        }}
                        className="shrink-0 text-zinc-400 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                  {stagedFiles.map((sf, i) => (
                    <li
                      key={`${sf.file.name}-${i}`}
                      className="flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2"
                    >
                      <Paperclip className="h-4 w-4 shrink-0 text-blue-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-zinc-800">
                          {sf.file.name}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {formatBytes(sf.file.size)} · gönderimde yüklenecek
                        </p>
                      </div>
                      <SelectMenu
                        value={sf.kind}
                        ariaLabel={`${sf.file.name} kategorisi`}
                        onChange={(v) =>
                          setStagedFiles((s) =>
                            s.map((x, j) =>
                              j === i ? { ...x, kind: v as BidDocKind } : x,
                            ),
                          )
                        }
                        className="w-40 shrink-0"
                        options={BID_DOC_SELECTABLE_KINDS.map((k) => ({
                          value: k,
                          label: BID_DOC_KIND_LABELS[k],
                        }))}
                      />
                      <button
                        type="button"
                        aria-label={`${sf.file.name} dosyasını kaldır`}
                        onClick={() =>
                          setStagedFiles((s) => s.filter((_, j) => j !== i))
                        }
                        className="-m-2 shrink-0 rounded-md p-2 text-zinc-400 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* Sağ — yapışkan toplam */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="space-y-3">
            <div className="rounded-2xl bg-emerald-700 p-5 text-white">
              <p className="text-xs font-semibold tracking-wide text-emerald-200 uppercase">
                Toplam Teklif
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {totalLabel}
              </p>
              {/* Sınır yerine YAPILAN indirim (öncekine göre). */}
              {isAuction && effectiveTarget && workbenchTarget.ownLastTotal ? (
                <p className="mt-1 text-xs text-emerald-200">
                  {workbenchTarget.met ? (
                    <>
                      İndirim:{" "}
                      <span className="tabular-nums">
                        {money(
                          Number(
                            decSub(
                              workbenchTarget.ownLastTotal,
                              workbenchTarget.comparableTotalStr,
                            ),
                          ),
                          effectiveCurrency,
                        )}
                      </span>{" "}
                      ✓
                    </>
                  ) : (
                    <>
                      Öncekinden ({money(Number(workbenchTarget.ownLastTotal), effectiveCurrency)}){" "}
                      düşük olmalı
                    </>
                  )}
                </p>
              ) : null}
              {hasItems ? (
                <>
                  <p className="mt-3 text-xs text-emerald-200">
                    Fiyatlandırılan kalem {pricedItems.length}/{items.length}
                  </p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-emerald-900/60">
                    <div
                      className="h-full bg-white transition-all"
                      style={{ width: `${filledRatio}%` }}
                    />
                  </div>
                </>
              ) : null}
            </div>

            <Button
              color="emerald"
              className="w-full"
              disabled={problems.length > 0 || placeBid.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              Teklif Gönder
            </Button>
            {/* Auction'da GÖNDERİLMİŞ teklif taslağa çekilemez (yarıştan
                düşürürdü) — rebid'de taslak butonu gizli; backend de reddeder. */}
            {!isAuctionRebid ? (
              <Button
                outline
                className="w-full"
                disabled={placeBid.isPending}
                onClick={saveDraft}
              >
                Taslak Olarak Kaydet
              </Button>
            ) : null}
            <Link
              href={detailHref}
              className="block text-center text-sm text-zinc-500 hover:text-zinc-700"
            >
              Vazgeç
            </Link>

            {problems.length > 0 ? (
              <ul className="space-y-1 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 text-xs text-zinc-500">
                {/* key=metin OLMAZ: aynı adlı iki kalem aynı mesajı üretip
                    çift key ile bayat <li> bırakıyordu. */}
                {problems.map((p, i) => (
                  <li key={`${i}-${p}`}>• {p}</li>
                ))}
              </ul>
            ) : (
              /* §10.4: liste tamamlanınca kaybolmaz — yeşil "hazır" hâli
                 (alan dolu kalır, panel zıplamaz). */
              <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                Gönderime hazır — tüm zorunlu alanlar tamam.
              </p>
            )}

            {/* Pazarlıkta görünürlük notu kaldırıldı (belirsiz/mantıksızdı —
                ne görüneceğini canlı kart zaten gösteriyor); kapalı zarf
                notu RFQ'da kalır. */}
            {!l.english?.isEnglishAuction ? (
              <p className="text-center text-xs text-zinc-400">
                Kapalı zarf: teklifin diğer tedarikçilere gösterilmez.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Mobil yapışkan CTA — toplam + gönder (masaüstünde sağ kolon var) */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div>
          <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            Toplam Teklif
          </p>
          <p className="text-base font-bold text-zinc-950 tabular-nums">
            {totalLabel}
          </p>
          {/* Sınır yerine YAPILAN indirim (öncekine göre). */}
          {isAuction && effectiveTarget && workbenchTarget.ownLastTotal ? (
            <p
              className={cn(
                "text-xs tabular-nums",
                workbenchTarget.met ? "text-emerald-600" : "text-amber-600",
              )}
            >
              {workbenchTarget.met
                ? `İndirim: ${money(
                    Number(
                      decSub(
                        workbenchTarget.ownLastTotal,
                        workbenchTarget.comparableTotalStr,
                      ),
                    ),
                    effectiveCurrency,
                  )} ✓`
                : "Öncekinden düşük olmalı"}
            </p>
          ) : null}
        </div>
        <Button
          color="emerald"
          disabled={problems.length > 0 || placeBid.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          Teklif Gönder
        </Button>
      </div>
      {/* Yapışkan çubuk içeriği örtmesin */}
      <div className="h-16 lg:hidden" />

      {/* Gönderim onayı */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>
          {isAuctionRebid || isRebidAfterLoss
            ? "Teklifi Revize Et"
            : "Teklif Gönder"}
        </DialogTitle>
        <DialogBody>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
            <p className="text-xs font-semibold text-emerald-700">Toplam Teklif</p>
            <p className="mt-1 text-2xl font-bold text-emerald-800 tabular-nums">
              {totalLabel}
            </p>
            {mixedCurrency ? (
              <p className="mt-1 text-xs text-emerald-700">
                Karma birimli teklif: karşılaştırma toplamı ana birime (
                {effectiveCurrency}) güncel TCMB kuruyla sistemce çevrilir.
              </p>
            ) : null}
          </div>
          {l.english?.isEnglishAuction ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <p>
                <span className="font-semibold">
                  Bu turda tek teklif hakkın var.
                </span>{" "}
                Gönderdikten sonra bu turda değiştiremezsin — yeni fiyat ancak
                alıcı yeni tur açarsa verilebilir.
              </p>
            </div>
          ) : (
            <Text className="mt-3 text-sm text-zinc-500">
              Gönderilen teklif düzenlenemez; yalnızca geri çekilebilir veya
              (elenirse) yeni versiyonla güncellenir.
            </Text>
          )}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setConfirmOpen(false)}>
            Vazgeç
          </Button>
          <Button color="emerald" onClick={submit} disabled={placeBid.isPending}>
            {placeBid.isPending ? "Gönderiliyor…" : "Teklifi Gönder"}
          </Button>
        </DialogActions>
      </Dialog>
    </form>
  );
}
