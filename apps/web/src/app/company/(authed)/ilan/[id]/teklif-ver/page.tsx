"use client";

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
  useBuyNow,
  useListingDetail,
  usePlaceBid,
  type ListingDetail,
  type ListingItemRow,
} from "@/hooks/use-company-listings";
import { useAddresses } from "@/hooks/use-company-addresses";
import { BUYER_ADDRESS_REQUIRED_TERMS } from "@/lib/tenders/labels";
import type { DeliveryTerm } from "@/lib/tenders/types";
import { extractErrorMessage } from "@/lib/tenders/error";
import { formatDateTime, todayLocalISO } from "@/lib/tenders/date";
import { subscribeRealtime } from "@/lib/realtime";
import { daysUntil } from "@/lib/tenders/seller-state";
import { cn } from "@/lib/utils";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import {
  AlertTriangle,
  FileText,
  Info,
  Lock,
  Paperclip,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AuctionLiveCard } from "../_components/auction-live-card";

/** Kalem başına form durumu. null fiyat = "bu kaleme teklif verme". */
interface ItemState {
  price: string | null;
  deliveryDate: string;
  answers: Record<string, string>;
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
        İhale Detayına Dön
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
  const searchParams = useSearchParams();
  const detail = useListingDetail(id);
  const placeBid = usePlaceBid(id);
  const buyNow = useBuyNow(id);
  const bidDocs = useBidDocuments(id);
  const uploadDoc = useUploadBidDoc(id);
  const deleteDoc = useDeleteBidDoc(id);

  const l = detail.data;
  const detailHref = `/company/ilan/${id}`;
  // SATIS ihalede teklifçi ALICI'dır; ilan sahibi satıcıdır ve en yüksek
  // teklif kazanır (taban fiyat altı kabul edilmez).
  const isSatis = l?.type === "SATIS";
  const isKalemPricing = isSatis && l?.priceScope === "KALEM";
  // Hemen-Al modu: fiyatlar hemen-al değerleriyle KİLİTLİ; alıcı yalnızca
  // detayları (teslim/geçerlilik/not/belge) girer; gönderim buyNow ile.
  const isBuyNowMode =
    searchParams.get("hemenAl") === "1" &&
    !!l &&
    isSatis &&
    (isKalemPricing
      ? (l.items ?? []).some((it) => it.buyNowUnitPrice != null)
      : l.buyNowPrice != null);

  // ── Form durumu ──
  const [itemState, setItemState] = useState<Record<string, ItemState>>({});
  const [singleAmount, setSingleAmount] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  // SATIS: alıcının teslimat adresi (kendi adres defterinden) — adrese-teslim
  // şartlı ilanda gönderimde zorunlu.
  const [deliveryAddressId, setDeliveryAddressId] = useState("");
  const [validityDays, setValidityDays] = useState("30");
  const [currency, setCurrency] = useState("");
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [seeded, setSeeded] = useState(false);
  // Henüz teklif kaydı yokken seçilen dosyalar — kayıt sonrası yüklenir.
  const [stagedFiles, setStagedFiles] = useState<
    { file: File; kind: BidDocKind }[]
  >([]);
  // Sürükle-bırak alanı görsel geri bildirimi.
  const [dragActive, setDragActive] = useState(false);

  // WS: canlı artırma/eksiltme — rakip teklifi anında yansısın.
  useEffect(() => subscribeRealtime("listing", id), [id]);

  // İlan değişirse (client-side geçiş) önceki formun state'i taşınmasın.
  useEffect(() => {
    setSeeded(false);
    setItemState({});
    setSingleAmount("");
    setDeliveryDate("");
    setDeliveryAddressId("");
    setValidityDays("30");
    setCurrency("");
    setNote("");
    setStagedFiles([]);
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
      // Hemen-Al modunda kalem fiyatı hemen-al değeriyle sabitlenir;
      // hemen-al fiyatı olmayan kalem otomatik kapsam dışı (null = opt-out).
      const buyNowSeed =
        isBuyNowMode && l.priceScope === "KALEM"
          ? it.buyNowUnitPrice != null
            ? String(Number(it.buyNowUnitPrice))
            : null
          : undefined;
      next[it.id] = {
        price:
          buyNowSeed !== undefined
            ? buyNowSeed
            : bi
              ? String(Number(bi.unitPrice))
              : "",
        deliveryDate: bi?.deliveryDate ? bi.deliveryDate.slice(0, 10) : "",
        answers,
      };
    }
    setItemState(next);
    if (isBuyNowMode && !l.items?.length && l.buyNowPrice) {
      setSingleAmount(String(Number(l.buyNowPrice)));
    }
    if (bid) {
      if (!l.items?.length && !isBuyNowMode)
        setSingleAmount(String(Number(bid.amount)));
      if (bid.deliveryDate) setDeliveryDate(bid.deliveryDate.slice(0, 10));
      if (bid.validityDays) setValidityDays(String(bid.validityDays));
      if (bid.deliveryAddressId) setDeliveryAddressId(bid.deliveryAddressId);
      if (bid.note) setNote(bid.note);
      if (bid.currency) setCurrency(bid.currency);
    }
  }, [l, seeded, isBuyNowMode]);

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

  // SATIS: teslimat adresi seçimi. Adres defterinden TESLIMAT/ILETISIM tipli
  // adresler; adrese-teslim şartlı ilanda gönderimde zorunlu.
  const { data: myAddresses } = useAddresses();
  const deliveryAddrs = (myAddresses ?? []).filter(
    (a) => a.type === "TESLIMAT" || a.type === "ILETISIM",
  );
  const addressRequired =
    isSatis &&
    !!l?.deliveryTerm &&
    BUYER_ADDRESS_REQUIRED_TERMS.includes(l.deliveryTerm as DeliveryTerm);

  const pricedItems = useMemo(
    () =>
      items.filter((it) => {
        const st = itemState[it.id];
        return st?.price !== null && st?.price !== "" && st !== undefined;
      }),
    [items, itemState],
  );

  const total = useMemo(() => {
    // Hemen-Al TOPLU: tutar ilan geneli hemen-al fiyatıdır (kalem fiyatı yok).
    if (isBuyNowMode && l?.priceScope !== "KALEM") {
      return Number(l?.buyNowPrice ?? 0);
    }
    if (!hasItems) return Number(singleAmount) || 0;
    return pricedItems.reduce((sum, it) => {
      const p = Number(itemState[it.id]?.price ?? 0);
      return sum + (Number.isFinite(p) ? p * Number(it.quantity) : 0);
    }, 0);
  }, [hasItems, singleAmount, pricedItems, itemState, isBuyNowMode, l]);

  if (detail.isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-sm text-zinc-500">
        Yükleniyor…
      </div>
    );
  }
  if (!l) {
    // İlan yüklenemedi — tipi (ALIM/SATIS) bilinmediğinden nötr hedef.
    return <Blocked title="İhale bulunamadı" detailHref="/company" />;
  }

  // ── Kapılar ──
  if (l.isOwner) {
    return <Blocked title="Kendi ilanınıza teklif veremezsiniz" detailHref={detailHref} />;
  }
  if (l.masked || !l.canBid) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <Lock className="mx-auto h-8 w-8 text-amber-500" aria-hidden="true" />
        <Heading className="mt-3">Teklif için premium üyelik gerekir</Heading>
        <Text className="mt-2 text-sm text-zinc-500">
          Bu herkese açık ihaleye teklif vermek için firmanızı doğrulayıp
          premium&apos;a geçin veya ilan sahibiyle bağlantı kurun.
        </Text>
        <div className="mt-5 flex items-center justify-center gap-3">
          <Button href="/company/premium">Premium&apos;a Geç</Button>
          <Button href={detailHref} outline>
            İhale Detayına Dön
          </Button>
        </div>
      </div>
    );
  }
  if (l.roleAllowsBid === false) {
    return (
      <Blocked
        title={
          isSatis
            ? "Satış ilanına teklif (alım) için Satın Almacı rolü gerekir — firma yöneticinizden rol isteyin"
            : "Alım ihalesine teklif (satış) için Satışçı rolü gerekir — firma yöneticinizden rol isteyin"
        }
        detailHref={detailHref}
      />
    );
  }
  if (l.status !== "OPEN") {
    return <Blocked title="Bu ihaleye artık teklif verilemez" detailHref={detailHref} />;
  }
  if (l.myBid?.status === "WITHDRAWN") {
    return (
      <Blocked
        title="Teklifinizi geri çektiniz — yeniden teklif veremezsiniz"
        detailHref={detailHref}
      />
    );
  }
  if (isBuyNowMode && l.myBid?.status === "SUBMITTED" && l.myBid.isBuyNow) {
    return (
      <Blocked
        title="Hemen-Al teklifin zaten gönderildi — satıcı onayı bekleniyor"
        detailHref={detailHref}
      />
    );
  }
  if (
    !isBuyNowMode &&
    l.myBid?.status === "SUBMITTED" &&
    !l.english?.isEnglishAuction
  ) {
    return (
      <Blocked
        title={`Teklif zaten verildi (v${l.myBid.version ?? 1}) — değişiklik için ${isSatis ? "satıcıyla" : "alıcıyla"} iletişime geçin`}
        detailHref={detailHref}
      />
    );
  }

  const isRebidAfterLoss = l.myBid?.status === "LOST";
  const isAuctionRebid =
    l.myBid?.status === "SUBMITTED" && !!l.english?.isEnglishAuction;
  const pageTitle = isBuyNowMode
    ? "Hemen Al"
    : isAuctionRebid
      ? isSatis
        ? "Yeni Teklif Ver (Fiyat Artır)"
        : "Yeni Teklif Ver (Fiyat Düşür)"
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
      [itemId]: { ...(s[itemId] ?? { price: "", deliveryDate: "", answers: {} }), ...patch },
    }));

  // ── Doğrulama (gönderim) ──
  const submitProblems = (): string[] => {
    const problems: string[] = [];
    // Hemen-Al modunda fiyatlar sabittir — fiyat problemleri üretilmez;
    // yalnızca detaylar (teslim/geçerlilik/belge/zorunlu soru) doğrulanır.
    if (hasItems && !isBuyNowMode) {
      if (pricedItems.length === 0)
        problems.push("En az bir kaleme birim fiyat girin.");
      if (l.requireAllItems && pricedItems.length < items.length)
        problems.push("Bu ihalede tüm kalemlere teklif vermelisiniz.");
    } else if (!hasItems && !isBuyNowMode) {
      if (!singleAmount || Number(singleAmount) <= 0)
        problems.push("Geçerli bir tutar girin.");
    }
    if (hasItems) {
      const scope = isBuyNowMode
        ? items.filter((it) => itemState[it.id]?.price !== null)
        : pricedItems;
      for (const it of scope) {
        for (const q of it.questions ?? []) {
          if (q.required && !(itemState[it.id]?.answers[q.id] ?? "").trim()) {
            problems.push(`"${it.name}" kalemi için zorunlu soru cevaplanmadı.`);
            break;
          }
        }
      }
      if (isBuyNowMode && l.requireAllItems && scope.length < items.length)
        problems.push(
          "Bu ihalede tüm kalemlere teklif zorunlu — kalem kapsam dışı bırakılamaz.",
        );
    }
    if (
      hasItems &&
      !isBuyNowMode &&
      pricedItems.some((it) => Number(itemState[it.id]?.price ?? 0) <= 0)
    )
      problems.push("Fiyatlanan her kalemin birim fiyatı sıfırdan büyük olmalı.");
    if (!deliveryDate)
      problems.push(
        isSatis ? "İstenen teslim tarihi zorunlu." : "Teslim tarihi zorunlu.",
      );
    if (addressRequired && !deliveryAddressId)
      problems.push(
        "Bu ilanda teslim şekli adrese teslim — teslimat adresi seçin.",
      );
    if (!validityDays || Number(validityDays) < 1)
      problems.push("Geçerlilik süresi zorunlu.");
    if (l.requireBidDocument && myDocs.length + stagedFiles.length === 0)
      problems.push("Bu ihalede teklif dosyası zorunlu.");
    // SATIS: taban/hemen-al kıyası yalnız ilanın kendi para biriminde anlamlı.
    if (
      isSatis &&
      !isBuyNowMode &&
      effectiveCurrency === (l.primaryCurrency ?? "TRY")
    ) {
      if (l.minPrice && total > 0 && total < Number(l.minPrice))
        problems.push(
          `Toplam teklif taban fiyatın (${money(Number(l.minPrice), effectiveCurrency)}) altında olamaz.`,
        );
      if (l.buyNowPrice && total >= Number(l.buyNowPrice))
        problems.push(
          `Teklif Hemen-Al fiyatına (${money(Number(l.buyNowPrice), effectiveCurrency)}) ulaştı — ihale detayından Hemen Al kullanın.`,
        );
      // KALEM fiyatlandırma: kalem tabanı/hemen-al'ı gönderimden ÖNCE yakala
      // (backend de aynı kuralı zorlar — 400 yerine anlık geri bildirim).
      if (l.priceScope === "KALEM") {
        for (const it of pricedItems) {
          const p = Number(itemState[it.id]?.price ?? 0);
          if (!(p > 0)) continue; // fiyat problemi ayrıca üretiliyor
          if (it.minUnitPrice != null && p < Number(it.minUnitPrice))
            problems.push(
              `"${it.name}" birim fiyatı tabanın (${money(Number(it.minUnitPrice), effectiveCurrency)}) altında olamaz.`,
            );
          if (it.buyNowUnitPrice != null && p >= Number(it.buyNowUnitPrice))
            problems.push(
              `"${it.name}" birim fiyatı Hemen-Al fiyatına (${money(Number(it.buyNowUnitPrice), effectiveCurrency)}) ulaştı — bu kalemi Hemen Al ile alın.`,
            );
        }
      }
    }
    // İngiliz usulü yeniden teklif: kendi gönderilmiş teklifine karşı
    // monotonluk ön-kontrolü (ALIM'da düşmeli, SATIS'ta yükselmeli) — adım
    // kuralı sunucuda (rakip referansı kapalı zarfta görünmeyebilir).
    if (
      !isBuyNowMode &&
      l.english?.isEnglishAuction &&
      l.myBid?.status === "SUBMITTED" &&
      total > 0 &&
      effectiveCurrency === (l.myBid.currency ?? l.primaryCurrency ?? "TRY")
    ) {
      const own = Number(l.myBid.amount);
      if (isSatis && total <= own)
        problems.push(
          `Açık artırma: yeni teklifin önceki teklifinin (${money(own, effectiveCurrency)}) üzerinde olmalı.`,
        );
      if (!isSatis && total >= own)
        problems.push(
          `Açık eksiltme: yeni teklifin önceki teklifinin (${money(own, effectiveCurrency)}) altında olmalı.`,
        );
    }
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
    deliveryDate: deliveryDate || undefined,
    validityDays: validityDays ? Number(validityDays) : undefined,
    deliveryAddressId: (isSatis && deliveryAddressId) || undefined,
    currency: currency || undefined,
    ...(hasItems
      ? {
          items: pricedItems.map((it) => {
            const st = itemState[it.id]!;
            return {
              itemId: it.id,
              unitPrice: Number(st.price),
              deliveryDate: st.deliveryDate || undefined,
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
      if (isBuyNowMode) {
        // Hemen-Al: fiyatlar sunucuda hemen-al değerlerinden hesaplanır —
        // istemci fiyatı güvenilmez. KALEM modda kapsam = fiyatı açık kalemler.
        await buyNow.mutateAsync({
          note: note.trim() || undefined,
          // Ham YYYY-MM-DD gönder (placeBid ile aynı biçim). Backend `new Date()`
          // ile UTC-gece-yarısına çevirir; istemcide `.toISOString()` yapmak
          // aynı instant'ı üretir ama iki yol arasında biçim tutarsızlığı yaratırdı.
          deliveryDate: deliveryDate || undefined,
          validityDays: validityDays ? Number(validityDays) : undefined,
          deliveryAddressId: deliveryAddressId || undefined,
          itemIds:
            l && l.priceScope === "KALEM"
              ? items
                  .filter((it) => itemState[it.id]?.price !== null)
                  .map((it) => it.id)
              : undefined,
        });
        toast.success(
          "Hemen-Al teklifin gönderildi — satıcı onayı bekleniyor",
        );
      } else {
        await placeBid.mutateAsync(buildPayload(false));
        toast.success("Teklifiniz gönderildi");
      }
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
    <div className="mx-auto max-w-5xl space-y-5">
      <Link
        href={detailHref}
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
        {l.number ?? "İhale"}
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

      {isSatis && l.priceScope === "KALEM" && !isBuyNowMode ? (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-semibold">Kalem bazlı taban fiyat:</span>{" "}
            her kalemin birim fiyatı kendi tabanının altına inemez; hemen-al
            fiyatlı kalemler o fiyattan anında alınabilir. En yüksek teklif
            kazanır.
          </p>
        </div>
      ) : null}
      {isSatis && l.priceScope !== "KALEM" && l.minPrice ? (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-semibold">
              Taban fiyat: {money(Number(l.minPrice), l.primaryCurrency ?? "TRY")}
            </span>{" "}
            — altındaki teklifler kabul edilmez.
            {effectiveCurrency !== (l.primaryCurrency ?? "TRY")
              ? " Farklı para birimi seçtiniz — taban kıyası sunucuda yapılır."
              : ""}
            {l.buyNowPrice
              ? ` Hemen-Al: ${money(Number(l.buyNowPrice), l.primaryCurrency ?? "TRY")} (bu fiyata ulaşan teklif yerine ihale detayındaki Hemen Al kullanılır).`
              : ""}{" "}
            En yüksek teklif kazanır.
          </p>
        </div>
      ) : null}

      {isBuyNowMode ? (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-semibold">Hemen-Al modu:</span> fiyatlar
            hemen-al değerleriyle sabittir, değiştirilemez.{" "}
            {l.priceScope === "KALEM"
              ? "İstemediğin kalemi kapsam dışı bırakabilirsin (✕); hemen-al fiyatı olmayan kalemler zaten kapsam dışıdır."
              : ""}
            İstenen teslim tarihini ve geçerlilik süresini girip onayla —
            satıcı kazandırınca sipariş oluşur.
          </p>
        </div>
      ) : null}

      {l.english?.isEnglishAuction ? <AuctionLiveCard l={l} /> : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Sol — form */}
        <div className="space-y-5 lg:col-span-2">
          {/* İhale özeti */}
          <section className="rounded-2xl border border-zinc-950/10 bg-white p-5">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-zinc-500">{isSatis ? "Satıcı" : "Alıcı"}</dt>
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
                Para birimi {isSatis ? "satıcı" : "alıcı"} tarafından belirlendi.
              </Text>
            ) : null}
          </section>

          {/* Kalem fiyatları */}
          {hasItems ? (
            <section className="space-y-3">
              <Subheading>Kalem Fiyatları</Subheading>
              {l.requireAllItems ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Bu ihalede <strong>tüm kalemlere</strong> teklif vermek zorunlu.
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
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-zinc-100 text-[11px] font-semibold text-zinc-600">
                              {idx + 1}
                            </span>
                            <p className="font-medium text-zinc-900">{it.name}</p>
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
                              ? ` · ${isSatis ? "İstenen" : "Hedef"}: ${money(Number(it.targetPrice), effectiveCurrency)}`
                              : ""}
                            {it.minUnitPrice != null
                              ? ` · Taban: ${money(Number(it.minUnitPrice), effectiveCurrency)}`
                              : ""}
                            {it.buyNowUnitPrice != null
                              ? ` · Hemen-Al: ${money(Number(it.buyNowUnitPrice), effectiveCurrency)}`
                              : ""}
                          </p>
                        </div>

                        {optedOut ? (
                          // Hemen-Al modunda: fiyat hemen-al değeriyle geri
                          // gelir; hemen-al fiyatı olmayan kalem kapsama hiç
                          // alınamaz (buton yok) — backend zaten reddeder.
                          !isBuyNowMode || it.buyNowUnitPrice != null ? (
                            <button
                              type="button"
                              onClick={() =>
                                setItem(it.id, {
                                  price: isBuyNowMode
                                    ? String(Number(it.buyNowUnitPrice))
                                    : "",
                                })
                              }
                              className="text-xs font-semibold text-blue-600 hover:underline"
                            >
                              {isBuyNowMode ? "Kapsama al" : "Teklif ver"}
                            </button>
                          ) : (
                            <span className="text-xs text-zinc-400">
                              Hemen-al fiyatı yok
                            </span>
                          )
                        ) : (
                          <div className="flex items-start gap-2">
                            <div className="w-36">
                              <Field>
                                <Label>Birim Fiyat</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  aria-label={`${it.name} birim fiyat`}
                                  value={st?.price ?? ""}
                                  disabled={isBuyNowMode}
                                  onChange={(e) =>
                                    setItem(it.id, { price: e.target.value })
                                  }
                                />
                              </Field>
                              {lineTotal !== null ? (
                                <p className="mt-1 text-right text-xs font-semibold text-zinc-700 tabular-nums">
                                  = {money(lineTotal, effectiveCurrency)}
                                </p>
                              ) : null}
                            </div>
                            {!l.requireAllItems ? (
                              <button
                                type="button"
                                aria-label="Bu kaleme teklif verme"
                                title="Bu kaleme teklif verme"
                                onClick={() =>
                                  setItem(it.id, { price: null })
                                }
                                className="mt-7 text-zinc-400 hover:text-red-600"
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>

                      {!optedOut ? (
                        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-zinc-50 pt-3 sm:grid-cols-2">
                          <Field>
                            <Label>
                              {isSatis
                                ? "Kalem İçin İstenen Teslim (opsiyonel)"
                                : "Kalem Teslim Tarihi (opsiyonel)"}
                            </Label>
                            <Input
                              type="date"
                              aria-label={`${it.name} teslim tarihi`}
                              min={todayLocalISO()}
                              value={st?.deliveryDate ?? ""}
                              onChange={(e) =>
                                setItem(it.id, { deliveryDate: e.target.value })
                              }
                            />
                          </Field>
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
              <div className="rounded-xl border border-zinc-950/10 bg-white p-4">
                <Field>
                  <Label>Tutar ({effectiveCurrency})</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={singleAmount}
                    disabled={isBuyNowMode}
                    onChange={(e) => setSingleAmount(e.target.value)}
                  />
                </Field>
              </div>
            </section>
          )}

          {/* Teslim & geçerlilik — SATIS'ta teslim eden SATICI'dır (ilan
              sahibi); alıcı tarih taahhüt etmez, İSTEDİĞİ tarihi belirtir. */}
          <section className="space-y-3">
            <Subheading>Teslim &amp; Geçerlilik</Subheading>
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-950/10 bg-white p-4 sm:grid-cols-3">
              <Field>
                <Label>
                  {isSatis ? "İstenen Teslim Tarihi *" : "Genel Teslim Tarihi *"}
                </Label>
                <Input
                  type="date"
                  min={todayLocalISO()}
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
              </Field>
              <Field>
                <Label>Geçerlilik (gün) *</Label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={validityDays}
                  onChange={(e) => setValidityDays(e.target.value)}
                />
              </Field>
              {(l.allowedCurrencies?.length ?? 0) > 1 ? (
                <Field>
                  <Label>Para Birimi</Label>
                  <Select
                    value={currency || l.primaryCurrency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    {l.allowedCurrencies!.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>
            {isSatis ? (
              <div className="rounded-xl border border-zinc-950/10 bg-white p-4">
                <Field>
                  <Label>
                    Teslimat Adresiniz{addressRequired ? " *" : ""}
                  </Label>
                  <Select
                    value={deliveryAddressId}
                    onChange={(e) => setDeliveryAddressId(e.target.value)}
                  >
                    <option value="">
                      {deliveryAddrs.length === 0
                        ? "Adres defterinizde teslimat adresi yok"
                        : addressRequired
                          ? "— Seçiniz —"
                          : "— Seçiniz (opsiyonel) —"}
                    </option>
                    {deliveryAddrs.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                        {a.city ? ` — ${a.city}` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Text className="mt-2 text-xs text-zinc-400">
                  {addressRequired
                    ? "Bu ilanda teslim şekli adrese teslim — satıcı bu adrese gönderir. "
                    : "Satıcının teslimatı planlaması için (opsiyonel). "}
                  Adres yoksa Ayarlar → Adresler&apos;den ekleyin.
                </Text>
              </div>
            ) : null}
            <Text className="text-xs text-zinc-400">
              {isSatis
                ? "İstenen teslim tarihi satıcıya iletilir; kesin teslim tarihini satıcı sipariş onayında verir."
                : "Kalem-özel teslim tarihi girilmeyen kalemler için genel teslim tarihi geçerlidir."}
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
                placeholder={`${isSatis ? "Satıcıya" : "Alıcıya"} iletmek istediğin not (opsiyonel)`}
              />
            </div>
          </section>

          {/* Teklif dosyaları — sürükle-bırak + dosya başına kategori. Teminat
              burada YOK; ihale sonrası sipariş aşamasında yüklenir. */}
          <section className="space-y-3">
            <Subheading>
              Teklif Dosyaları{l.requireBidDocument ? " (zorunlu)" : ""}
            </Subheading>
            <div className="space-y-3 rounded-xl border border-zinc-950/10 bg-white p-4">
              {l.requireBidDocument ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Bu ihalede teklif dosyası zorunlu — en az bir dosya ekleyin.
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
                className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
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
                      <span className="hidden shrink-0 rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 sm:inline">
                        {BID_DOC_KIND_LABELS[d.kind]}
                      </span>
                      <span className="shrink-0 text-[11px] font-medium text-emerald-600">
                        Yüklendi
                      </span>
                      <button
                        type="button"
                        aria-label={`${d.fileName} belgesini sil`}
                        disabled={deleteDoc.isPending}
                        onClick={async () => {
                          if (!confirm(`"${d.fileName}" silinsin mi?`)) return;
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
                        <p className="text-[11px] text-zinc-400">
                          {formatBytes(sf.file.size)} · gönderimde yüklenecek
                        </p>
                      </div>
                      <select
                        value={sf.kind}
                        aria-label={`${sf.file.name} kategorisi`}
                        onChange={(e) =>
                          setStagedFiles((s) =>
                            s.map((x, j) =>
                              j === i
                                ? { ...x, kind: e.target.value as BidDocKind }
                                : x,
                            ),
                          )
                        }
                        className="shrink-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                      >
                        {BID_DOC_SELECTABLE_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {BID_DOC_KIND_LABELS[k]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        aria-label={`${sf.file.name} dosyasını kaldır`}
                        onClick={() =>
                          setStagedFiles((s) => s.filter((_, j) => j !== i))
                        }
                        className="shrink-0 text-zinc-400 hover:text-red-600"
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
                {money(total, effectiveCurrency)}
              </p>
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
              disabled={
                problems.length > 0 || placeBid.isPending || buyNow.isPending
              }
              onClick={() => setConfirmOpen(true)}
            >
              {isBuyNowMode ? "Hemen Al" : "Teklif Gönder"}
            </Button>
            {/* Auction'da GÖNDERİLMİŞ teklif taslağa çekilemez (yarıştan
                düşürürdü) — rebid'de taslak butonu gizli; backend de reddeder. */}
            {!isBuyNowMode && !isAuctionRebid ? (
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
                {problems.map((p) => (
                  <li key={p}>• {p}</li>
                ))}
              </ul>
            ) : null}

            <p className="text-center text-[11px] text-zinc-400">
              {l.english?.isEnglishAuction
                ? `Açık ${isSatis ? "artırma" : "eksiltme"}: tutarlar rakiplere ayara göre görünür.`
                : `Kapalı zarf: teklifin diğer ${isSatis ? "alıcılara" : "tedarikçilere"} gösterilmez.`}
            </p>
          </div>
        </div>
      </div>

      {/* Mobil yapışkan CTA — toplam + gönder (masaüstünde sağ kolon var) */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div>
          <p className="text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
            Toplam Teklif
          </p>
          <p className="text-base font-bold text-zinc-950 tabular-nums">
            {money(total, effectiveCurrency)}
          </p>
        </div>
        <Button
          color="emerald"
          disabled={
            problems.length > 0 || placeBid.isPending || buyNow.isPending
          }
          onClick={() => setConfirmOpen(true)}
        >
          {isBuyNowMode ? "Hemen Al" : "Teklif Gönder"}
        </Button>
      </div>
      {/* Yapışkan çubuk içeriği örtmesin */}
      <div className="h-16 lg:hidden" />

      {/* Gönderim onayı */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>
          {isBuyNowMode
            ? "Hemen Al — Onayla"
            : isAuctionRebid || isRebidAfterLoss
              ? "Teklifi Revize Et"
              : "Teklif Gönder"}
        </DialogTitle>
        <DialogBody>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
            <p className="text-xs font-semibold text-emerald-700">Toplam Teklif</p>
            <p className="mt-1 text-2xl font-bold text-emerald-800 tabular-nums">
              {money(total, effectiveCurrency)}
            </p>
          </div>
          <Text className="mt-3 text-sm text-zinc-500">
            Gönderilen teklif düzenlenemez; yalnızca geri çekilebilir veya
            (elenirse / açık eksiltme-artırmada) yeni versiyonla güncellenir.
          </Text>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setConfirmOpen(false)}>
            Vazgeç
          </Button>
          <Button
            color="emerald"
            onClick={submit}
            disabled={placeBid.isPending || buyNow.isPending}
          >
            {placeBid.isPending || buyNow.isPending
              ? "Gönderiliyor…"
              : isBuyNowMode
                ? "Hemen Al"
                : "Teklifi Gönder"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
