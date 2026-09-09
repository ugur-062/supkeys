"use client";

import { useCompanyAuth, useHasCompanyPermission } from "@/hooks/use-company-auth";
import { AttributeFields } from "./attribute-fields";
import { SearchVisibilityCard } from "@/components/seo/search-visibility-card";
import { useAiSeoEnrich } from "@/hooks/use-ai-seo-enrich";
import { useCategoriesByIds } from "@/hooks/use-categories";
import { useCompanyProfile } from "@/hooks/use-company-profile";
import { productSeo } from "@/lib/seo/entities";
import { snippetFromMetadata } from "@/lib/seo/snippet";
import { PRODUCT_STATUS, productStatusKey } from "@/lib/company/product-status";
import { ImageUploader } from "./image-uploader";
import { PriceModeField } from "./price-mode-field";
import { CategorySelectorButton } from "@/components/categories/category-selector-button";
import { Badge } from "@/components/catalyst/badge";
import { MissingFields } from "@/components/ui/missing-fields";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import {
  useCategoryAttributes,
  useCreateProduct,
  usePublishProduct,
  useUpdateShowcase,
  useUploadProductDocument,
  type PriceTier,
  type ProductShowcase,
} from "@/hooks/use-company-items";
import { CheckCircleIcon, ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/20/solid";
import {
  COMMON_UNIT_CODES,
  MIN_DESCRIPTION,
  PRODUCT_MEDIA_TIER,
  UNITS,
  getUnit,
  productCompletion,
  productPublishBlockers,
  productSeoReadiness,
  generateSlug,
  slugifyText,
  tierAtLeast,
  type ProductLike,
} from "@rothern/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const MAX_KEYWORDS = 15;
/** Katalog/teknik föy — Europages ürün kartındaki gibi az sayıda, seçilmiş. */
const MAX_DOCUMENTS = 3;

const INPUT =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";

/** Bölüm çipleri — tıkla-kaydır. Kimlikler bölüm başlıklarıyla eşleşir. */
const SECTIONS = [
  { id: "urun-temel", label: "Temel bilgiler" },
  { id: "urun-gorsel", label: "Görseller" },
  { id: "urun-ozellik", label: "Özellikler" },
  { id: "urun-fiyat", label: "Fiyat ve sipariş" },
  { id: "urun-ekler", label: "Ekler" },
] as const;

/**
 * ÜRÜN VİTRİN FORMU — tek sayfa, beş numaralı bölüm (2026-09-09 düzeni).
 *
 * Dört şey aynı anda yaşıyor ve ayrımları bilinçli:
 *  · DURUM — Taslak / Onay bekliyor / Yayında / Reddedildi (moderasyon:
 *    her ürün vitrine çıkmadan admin onayından geçer, `isPublic` yalnız
 *    onayla true olur).
 *  · TAMAMLANMA SKORU — yönlendirir, engellemez. Canlı güncellenir.
 *  · ONAY KAPISI — engeller. Skordan AYRI ve daha dar liste.
 *  · KAYDET / ONAYA GÖNDER — kaydetmek taslakta bırakır; göndermek ayrı jest.
 *
 * Skoru kapı yapmadık: "80 puan olmadan gönderemezsin" demek kullanıcıyı
 * puan toplamak için alan uydurmaya iterdi.
 *
 * Nitelik alanları ELLE YAZILMAZ — kategori seçilince ata zincirinden miras
 * set gelir ve form ondan kurulur (`useCategoryAttributes`).
 */
export function ProductShowcaseForm({
  product,
  unit,
  onClose,
  mode = "edit",
  onCreated,
  publishLimitReached,
}: {
  product: ProductShowcase;
  /** Kalemin ölçü birimi — fiyat ve MOQ satırlarında gösterilir. */
  unit: string;
  onClose: () => void;
  /**
   * "new": kayıt HENÜZ YOK; ilk kaydetmede tek çağrıyla oluşur.
   *
   * İlan açma bir SİHİRBAZDIR (adımlar, miktar, teslim, kapanış); ürün ekleme
   * TEK SAYFADIR — Europages'te de öyle. Bu yüzden "önce kalem aç, sonra
   * vitrini doldur" diye ikiye bölmüyoruz.
   */
  mode?: "edit" | "new";
  onCreated?: (created: ProductShowcase) => void;
  /**
   * Ücretsiz paket YAYINDA+ONAYDA ürün tavanına dayandı (`PRODUCT_LIMITS`,
   * API aynası): "Onaya gönder" kilitlenir, taslak kaydetme serbest kalır.
   */
  publishLimitReached?: boolean;
}) {
  const isNew = mode === "new";
  // Belge (PDF) ve video PAKETLİ (Silver+): ücretsiz firmada alanlar hiç
  // çizilmez, kısa bir kilit notu çizilir; API de bu alanları dokunmadan bırakır.
  const { company } = useCompanyAuth();
  const mediaAllowed = !company || tierAtLeast(company.tier, PRODUCT_MEDIA_TIER);
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? "");
  const [categoryId, setCategoryId] = useState(product.categoryId ?? "");
  const [images, setImages] = useState<string[]>(product.images);
  const [keywords, setKeywords] = useState<string[]>(product.keywords);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [attributes, setAttributes] = useState<Record<string, string | string[]>>(
    product.attributes ?? {},
  );
  const [priceMode, setPriceMode] = useState(product.priceMode);
  const [priceAmount, setPriceAmount] = useState(product.priceAmount ?? "");
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>(product.priceTiers ?? []);
  const [priceCurrency, setPriceCurrency] = useState(product.priceCurrency);
  const [moq, setMoq] = useState(product.moq ?? "");
  const [externalUrl, setExternalUrl] = useState(product.externalUrl ?? "");
  const [videoUrl, setVideoUrl] = useState(product.videoUrl ?? "");
  // Birim: ürün kaydından; kaydı olmayan (yeni) üründe prop'tan.
  const [unitCode, setUnitCode] = useState(
    product.unitCode ?? getUnit(product.unit || unit)?.code ?? "PCE",
  );
  const [documents, setDocuments] = useState<{ url: string; title: string }[]>(
    product.documents ?? [],
  );
  const docInput = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState<(typeof SECTIONS)[number]["id"]>("urun-temel");

  const { data: attributeDefs = [] } = useCategoryAttributes(categoryId);
  const save = useUpdateShowcase();
  const create = useCreateProduct();
  const publish = usePublishProduct();
  // Kaydet/gönder = "Ürün ve vitrin yönetimi" işlem izni (API aynası); izinsiz salt okur.
  const canManage = useHasCompanyPermission("sell:product:manage");
  const uploadDoc = useUploadProductDocument();

  const unitDef = getUnit(unitCode);
  const unitLabel = unitDef?.nameTr ?? unit;

  /**
   * Kategori DEĞİŞİNCE eski nitelikler taşınmaz: yeni kategoride tanımsız
   * anahtarlar zaten serviste düşüyor, ama formda da göstermemek gerek —
   * kullanıcı doldurduğu bir alanın sessizce kaybolduğunu görmemeli.
   */
  useEffect(() => {
    if (categoryId === (product.categoryId ?? "")) return;
    setAttributes((prev) => {
      const allowed = new Set(attributeDefs.map((d) => d.key));
      const next: Record<string, string | string[]> = {};
      for (const [k, v] of Object.entries(prev)) if (allowed.has(k)) next[k] = v;
      return next;
    });
  }, [categoryId, attributeDefs, product.categoryId]);

  const patch = useMemo(
    () => ({
      name: name.trim(),
      description: description.trim(),
      categoryId: categoryId || null,
      images,
      keywords,
      attributes,
      priceMode,
      priceAmount: priceMode === "FIXED" && priceAmount ? Number(priceAmount) : null,
      priceTiers: priceMode === "TIERED" ? priceTiers : [],
      priceCurrency,
      moq: moq ? Number(moq) : null,
      externalUrl: externalUrl.trim() || null,
      videoUrl: videoUrl.trim() || null,
      documents,
      unitCode,
      unit: unitLabel,
    }),
    [name, description, categoryId, images, keywords, attributes, priceMode, priceAmount, priceTiers, priceCurrency, moq, externalUrl, videoUrl, documents, unitCode, unitLabel],
  );

  /**
   * KAYDEDİLMEMİŞ DEĞİŞİKLİK: kayıttaki hâl ile formun anlık hâli ayrışınca
   * sekme kapatma/yenileme tarayıcı uyarısı ister. Uygulama içi "Ürünlere
   * dön" de aynı bayrağı okur (`onClose` öncesi onay).
   */
  const initial = useRef(JSON.stringify(patch));
  const dirty = JSON.stringify(patch) !== initial.current;
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  /**
   * CANLI tamamlanma + onay kapısı — sunucuyla AYNI kurallar
   * (`@rothern/shared` product-completion).
   */
  const live = useMemo(() => {
    const like: ProductLike = {
      name: patch.name,
      categoryId: patch.categoryId,
      description: patch.description,
      images,
      keywords,
      priceMode,
      priceAmount: patch.priceAmount,
      priceTiers: patch.priceTiers,
      moq: patch.moq,
      attributes,
    };
    return {
      completion: productCompletion(like, {
        requiredAttributeKeys: attributeDefs.filter((d) => d.isRequired).map((d) => d.key),
      }),
      blockers: productPublishBlockers(like),
    };
  }, [patch, images, keywords, priceMode, attributes, attributeDefs]);

  /* ARAMA GÖRÜNÜRLÜĞÜ (SEO Parça 8): puan + Google parçacığı + AI taslağı.
     Parçacık sayfanın GERÇEK şablonundan (`productSeo`) — ayrı metin yok. */
  const { data: categoryRows = [] } = useCategoriesByIds(categoryId ? [categoryId] : []);
  const categoryName = categoryRows[0]?.nameTr ?? null;
  const seoEnrich = useAiSeoEnrich();
  // Şehir/sektör oturum anlık görüntüsünde yok → profil sorgusu (önbellekli).
  const profileQ = useCompanyProfile();
  const seo = useMemo(() => {
    const attributeEntries = Object.entries(attributes).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : !!v));
    const readiness = productSeoReadiness({
      name: patch.name,
      description: patch.description,
      images,
      keywords,
      categoryId: patch.categoryId,
      attributeCount: attributeEntries.length,
      brand: null,
      mpn: null,
      moq: patch.moq,
      priceMode,
    });
    const companySlug = company?.slug ?? (company ? generateSlug(company.name) || "firma" : "firma");
    const snippet = snippetFromMetadata(
      productSeo({
        companySlug,
        product: {
          name: patch.name || "Ürün",
          slug: product.slug ?? (slugifyText(patch.name) || "urun"),
          description: patch.description,
          images,
          brand: null,
          mpn: null,
          unit: unitLabel,
          moq: patch.moq != null ? String(patch.moq) : null,
          priceMode,
          priceAmount: patch.priceAmount != null ? String(patch.priceAmount) : null,
          priceTiers: priceMode === "TIERED" ? priceTiers : null,
          priceCurrency,
          category: categoryId && categoryName ? { id: categoryId, name: categoryName } : null,
          keywords,
        },
        company: {
          name: company?.name ?? "Firma",
          slug: companySlug,
          city: profileQ.data?.city ?? null,
          country: company?.country ?? null,
          industry: profileQ.data?.industry ?? null,
        },
        indexable: true,
      }).metadata,
    );
    const facts = attributeEntries.map(([k, v]) => {
      const def = attributeDefs.find((d) => d.key === k);
      return `${def?.nameTr ?? k}: ${Array.isArray(v) ? v.join(", ") : v}`;
    });
    return { readiness, snippet, facts };
  }, [patch, images, keywords, attributes, attributeDefs, priceMode, priceTiers, priceCurrency, unitLabel, categoryId, categoryName, company, profileQ.data, product.slug]);
  const aiAvailable = !!company && tierAtLeast(company.tier, "SILVER");

  /** Anahtar kelime ÖNERİLERİ: kategori adı + ürün adındaki anlamlı sözcükler. */
  const keywordSuggestions = useMemo(() => {
    const out: string[] = [];
    const push = (s: string) => {
      const k = s.toLowerCase().trim();
      if (k.length >= 3 && !keywords.includes(k) && !out.includes(k)) out.push(k);
    };
    if (categoryName) push(categoryName);
    for (const w of name.split(/[\s,/()-]+/)) if (w.length >= 4 && !/^\d+$/.test(w)) push(w);
    return out.slice(0, 5);
  }, [categoryName, name, keywords]);

  const addDocument = async (file: File | undefined) => {
    if (!file || documents.length >= MAX_DOCUMENTS) return;
    try {
      const url = await uploadDoc.mutateAsync(file);
      const title = file.name.replace(/\.pdf$/i, "").slice(0, 200) || "Belge";
      setDocuments((d) => [...d, { url, title }]);
    } catch {
      toast.error("Belge yüklenemedi — yalnız PDF, en fazla 10 MB");
    } finally {
      if (docInput.current) docInput.current.value = "";
    }
  };

  const addKeyword = (raw = keywordDraft) => {
    // Virgülle çoklu giriş: "boru, dikişsiz, st37" tek seferde.
    const parts = raw.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return;
    setKeywords((prev) => {
      const next = [...prev];
      for (const k of parts) if (!next.includes(k) && next.length < MAX_KEYWORDS) next.push(k);
      return next;
    });
    setKeywordDraft("");
  };

  const status = productStatusKey(product);
  const statusMeta = PRODUCT_STATUS[status];
  const inQueue = product.reviewStatus === "PENDING";
  const publishLocked = !!publishLimitReached && !product.isPublic && !inQueue;

  const handleSave = async (thenSubmit: boolean) => {
    if (!patch.name) {
      toast.error("Ürün adı zorunlu");
      return;
    }
    if (thenSubmit && publishLocked) {
      toast.error("Ücretsiz paket tavanı doldu — daha fazla ürün için Silver paketine geçin.");
      return;
    }
    try {
      // Yeni üründe kayıt TEK çağrıyla oluşur (create+vitrin); sonrasında
      // düzenleme moduna geçeriz — kullanıcı için bu tek bir "kaydet".
      const saved = isNew
        ? await create.mutateAsync({ ...patch, unit })
        : await save.mutateAsync({ id: product.id, patch });
      initial.current = JSON.stringify(patch);
      if (isNew) onCreated?.(saved);
      if (!thenSubmit) {
        toast.success(
          isNew
            ? "Ürün taslak olarak eklendi"
            : product.isPublic
              ? "Kaydedildi — içerik değişikliği yeniden incelenecek, ürün yayında kalıyor"
              : inQueue
                ? "Kaydedildi — inceleme güncel hâl üzerinden sürecek"
                : "Taslak kaydedildi",
        );
        return;
      }
      if (saved.publishBlockers.length > 0) {
        toast.error(`Onaya gönderilemedi — ${saved.publishBlockers.join(", ")}`);
        return;
      }
      await publish.mutateAsync({ id: saved.id, publish: true });
      toast.success("Onaya gönderildi — ekibimiz inceleyip vitrine alacak");
      onClose();
    } catch {
      toast.error("Kaydedilemedi");
    }
  };

  const busy = save.isPending || publish.isPending || create.isPending;

  const jump = (id: (typeof SECTIONS)[number]["id"]) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* Birincil düğme metni duruma göre — kullanıcı ne olacağını okusun. */
  const primaryLabel =
    status === "draft"
      ? "Onaya gönder"
      : status === "rejected"
        ? "Düzelt ve yeniden gönder"
        : inQueue
          ? "Kaydet"
          : "Kaydet";
  const primaryAction = () => void handleSave(status === "draft" || status === "rejected");

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        {/* BÖLÜM ÇİPLERİ — yapışkan; uzun formda "neredeyim" ve tek tıkla atlama. */}
        <nav
          aria-label="Form bölümleri"
          className="sticky top-16 z-10 -mx-1 mb-6 flex gap-1 overflow-x-auto rounded-xl bg-white/90 p-1 ring-1 ring-zinc-950/5 backdrop-blur"
        >
          {SECTIONS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => jump(s.id)}
              aria-current={active === s.id ? "step" : undefined}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                active === s.id ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
            >
              {i + 1}. {s.label}
            </button>
          ))}
        </nav>

        <div className="space-y-10">
          {/* 1 ── TEMEL BİLGİLER */}
          <Section id="urun-temel" n={1} title="Temel bilgiler" lead="Ad, kategori ve açıklama — arama motoru ve alıcı ilk bunları okur.">
            <Field hint="Ürün tipi + temel özellik + ölçü/model. En fazla 128 karakter önerilir.">
              <Label required>Ürün adı</Label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                placeholder="Dağıtım panosu 400A IP54"
                className={INPUT}
              />
              <p className={`mt-1 text-xs ${name.trim().length > 128 ? "text-amber-700" : "text-zinc-500"}`}>
                {name.trim().length} / 128 karakter
              </p>
            </Field>

            <Field hint="Nitelik alanları seçtiğiniz kategoriden gelir — üst kategoride tanımlı nitelikler otomatik devralınır.">
              <Label required>Kategori</Label>
              <CategorySelectorButton
                value={categoryId ? [categoryId] : []}
                onChange={(ids) => setCategoryId(ids[0] ?? "")}
                mode="single"
                modalTitle="Ürün kategorisi"
                placeholder="Ürün kategorisini seçin"
              />
            </Field>

            <Field hint={`Onaya göndermek için en az ${MIN_DESCRIPTION} karakter. Ne olduğunu, nerede kullanıldığını, malzeme/standart ve teslim biçimini tam cümlelerle yazın.`}>
              <Label required>Açıklama</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={5000}
                rows={7}
                placeholder="IP54 korumalı, 400A dağıtım panosu. Endüstriyel tesislerde ana dağıtım hattında kullanılır…"
                className={INPUT}
              />
              <p className={`mt-1 text-xs ${description.trim().length >= MIN_DESCRIPTION ? "text-emerald-600" : "text-zinc-500"}`}>
                {description.trim().length} / {MIN_DESCRIPTION}–5000 karakter
              </p>
            </Field>
          </Section>

          {/* 2 ── GÖRSELLER */}
          <Section id="urun-gorsel" n={2} title="Görseller" lead="İlk görsel kapak. Farklı açılar ve kullanım hâli; görsel arama ayrı bir trafik kanalıdır.">
            <ImageUploader images={images} onChange={setImages} />
          </Section>

          {/* 3 ── ÖZELLİKLER */}
          <Section id="urun-ozellik" n={3} title="Anahtar kelimeler ve özellikler" lead="Alıcının yazacağı sözcükler ve kategoriye özel teknik nitelikler.">
            <div>
              <Label>Anahtar kelimeler</Label>
              <p className="mt-1 text-xs text-zinc-500">
                En fazla {MAX_KEYWORDS}. Virgülle birden çok girebilirsiniz; ürün sayfasında görünür ve aramada kullanılır.
              </p>
              {keywords.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {keywords.map((k) => (
                    <span key={k} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-sm text-zinc-700">
                      {k}
                      <button
                        type="button"
                        onClick={() => setKeywords(keywords.filter((x) => x !== k))}
                        aria-label={`${k} etiketini kaldır`}
                        className="text-zinc-400 hover:text-zinc-900"
                      >
                        <XMarkIcon aria-hidden className="size-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              {keywords.length < MAX_KEYWORDS ? (
                <div className="mt-3 flex gap-2">
                  <input
                    value={keywordDraft}
                    onChange={(e) => setKeywordDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addKeyword();
                      }
                    }}
                    maxLength={200}
                    placeholder="çelik boru, dikişsiz, st37…"
                    className={`${INPUT} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => addKeyword()}
                    className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Ekle
                  </button>
                </div>
              ) : null}
              {keywordSuggestions.length && keywords.length < MAX_KEYWORDS ? (
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                  Öneri:
                  {keywordSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addKeyword(s)}
                      className="rounded-md border border-dashed border-zinc-300 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 hover:border-zinc-900 hover:text-zinc-900"
                    >
                      + {s}
                    </button>
                  ))}
                </p>
              ) : null}
            </div>

            <div>
              <h4 className="text-sm font-medium text-zinc-950">Kategoriye özel özellikler</h4>
              {!categoryId ? (
                <p className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                  Önce 1. bölümde kategori seçin — teknik nitelik alanları kategoriden gelir.
                </p>
              ) : attributeDefs.length === 0 ? (
                <p className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                  Bu kategoride tanımlı nitelik yok; ölçü, malzeme ve standardı açıklamaya yazın.
                </p>
              ) : (
                <>
                  <p className="mt-1 mb-4 text-xs text-zinc-500">
                    Bu alanlar “{attributeDefs[0]?.definedAt.slice(0, 2)}” segmentinden ve alt kategorilerinden gelir.
                    Zorunlu değil; nitelik tablosu süzgeçte ve yapılandırılmış veride görünür.
                  </p>
                  <AttributeFields defs={attributeDefs} values={attributes} onChange={setAttributes} />
                </>
              )}
            </div>
          </Section>

          {/* 4 ── FİYAT VE SİPARİŞ */}
          <Section id="urun-fiyat" n={4} title="Fiyat ve sipariş" lead='"Teklif isteyin" de geçerli bir seçenektir — boş bırakmak yerine seçin.'>
            <PriceModeField
              mode={priceMode}
              amount={priceAmount}
              tiers={priceTiers}
              currency={priceCurrency}
              unit={unitLabel}
              onChange={(n) => {
                if (n.mode) setPriceMode(n.mode);
                if (n.amount !== undefined) setPriceAmount(n.amount);
                if (n.tiers) setPriceTiers(n.tiers);
                if (n.currency) setPriceCurrency(n.currency);
              }}
            />

            {/* BİRİM ve MİKTAR yan yana: MOQ birimsiz okunmaz ("500 ne?"). */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Field hint="Fiyat ve minimum sipariş bu birimle okunur.">
                <Label>Satış birimi</Label>
                <select value={unitCode} onChange={(e) => setUnitCode(e.target.value)} aria-label="Satış birimi" className={INPUT}>
                  {UNITS.filter(
                    (u) => (COMMON_UNIT_CODES as readonly string[]).includes(u.code) || u.code === unitCode,
                  ).map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.nameTr} ({u.symbol})
                    </option>
                  ))}
                </select>
              </Field>
              <Field>
                <Label>Minimum sipariş miktarı</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    value={moq}
                    onChange={(e) => setMoq(e.target.value)}
                    className="w-40 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                  />
                  <span className="text-sm text-zinc-500">{unitLabel}</span>
                </div>
              </Field>
            </div>
          </Section>

          {/* 5 ── EKLER */}
          <Section id="urun-ekler" n={5} title="Ekler" lead="Katalog PDF'i, video ve kendi sitenizdeki ürün sayfası — isteğe bağlı.">
            {mediaAllowed ? (
              <>
                <div>
                  <Label>Dokümanlar</Label>
                  <p className="mt-1 text-xs text-zinc-500">
                    PDF katalog veya teknik föy — en fazla {MAX_DOCUMENTS}, her biri 10 MB.
                  </p>
                  {documents.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {documents.map((d, i) => (
                        <li key={d.url} className="flex items-center gap-2">
                          <input
                            value={d.title}
                            onChange={(e) =>
                              setDocuments((docs) => docs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                            }
                            maxLength={200}
                            aria-label={`Belge ${i + 1} başlığı`}
                            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                          />
                          <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-zinc-600 underline hover:text-zinc-900">
                            Aç
                          </a>
                          <button
                            type="button"
                            onClick={() => setDocuments((docs) => docs.filter((_, j) => j !== i))}
                            aria-label={`${d.title} belgesini kaldır`}
                            className="text-zinc-400 hover:text-zinc-900"
                          >
                            <XMarkIcon aria-hidden className="size-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {documents.length < MAX_DOCUMENTS ? (
                    <label className="mt-3 inline-flex cursor-pointer items-center rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                      {uploadDoc.isPending ? "Yükleniyor…" : "PDF ekle"}
                      <input
                        ref={docInput}
                        type="file"
                        accept="application/pdf"
                        className="sr-only"
                        disabled={uploadDoc.isPending}
                        onChange={(e) => void addDocument(e.target.files?.[0])}
                      />
                    </label>
                  ) : null}
                </div>

                <Field hint="YouTube veya Vimeo bağlantısı — ürün sayfasında gömülü oynatılır.">
                  <Label>Video bağlantısı</Label>
                  <input type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" className={INPUT} />
                </Field>
              </>
            ) : (
              <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                Ürün belgesi (PDF katalog, teknik föy) ve video bağlantısı Silver paketiyle açılır.
              </p>
            )}

            <Field hint="Kendi web sitenizdeki ürün sayfası — ziyaretçi oraya da gidebilsin.">
              <Label>Ürün sayfası bağlantısı</Label>
              <input type="url" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://…" className={INPUT} />
            </Field>
          </Section>
        </div>
      </div>

      {/* SAĞ PANEL — TEK KART: durum → tamamlanma → onay için eksikler → düğmeler.
          Mobilde formun altına iner (grid tek sütun). */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-zinc-950">Durum</p>
            <Badge color={statusMeta.color}>{isNew ? "Yeni" : statusMeta.label}</Badge>
          </div>
          <p className="mt-2 text-xs/5 text-zinc-600">
            {isNew ? "Kaydedince taslak olur; onaya gönderdiğinizde ekibimiz inceler ve vitrine alır." : statusMeta.description}
          </p>
          {status === "rejected" && product.rejectReason ? (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-600/20">
              <span className="font-semibold">Red gerekçesi:</span> {product.rejectReason}
            </p>
          ) : null}

          <div className="mt-5 border-t border-zinc-950/5 pt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-900">Tamamlanma</p>
              <p className="text-sm font-semibold tabular-nums text-zinc-950">%{live.completion.score}</p>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100" aria-hidden>
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${live.completion.score === 100 ? "bg-emerald-500" : "bg-zinc-900"}`}
                style={{ width: `${live.completion.score}%` }}
              />
            </div>
            {live.completion.missing.length > 0 ? (
              <MissingFields className="mt-2" label="Puanını artırmak için" items={live.completion.missing.map((m) => `${m.label} (+${m.points})`)} max={4} />
            ) : (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
                <CheckCircleIcon aria-hidden className="size-4" /> Tüm alanlar dolu
              </p>
            )}
          </div>

          {live.blockers.length > 0 ? (
            <div className="mt-4 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-600/20">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <ExclamationTriangleIcon aria-hidden className="size-4" />
                Onaya göndermek için gerekli
              </p>
              <ul className="mt-1.5 space-y-0.5 text-sm text-amber-800">
                {live.blockers.map((b) => (
                  <li key={b}>· {b}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {canManage ? (
            <div className="mt-4 space-y-2">
              {publishLocked ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs/5 text-amber-900 ring-1 ring-amber-600/20">
                  Ücretsiz pakette yayında/onayda ürün tavanı doldu. Taslak olarak kaydedebilirsiniz; daha fazlası için Silver paketine geçin.
                </p>
              ) : null}
              <button
                type="button"
                disabled={busy || ((status === "draft" || status === "rejected") && publishLocked)}
                onClick={primaryAction}
                className="w-full rounded-full bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
              >
                {busy ? "Kaydediliyor…" : primaryLabel}
              </button>
              {status === "draft" || status === "rejected" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSave(false)}
                  className="w-full rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50"
                >
                  Taslak olarak kaydet
                </button>
              ) : null}
              {product.isPublic ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm("Ürün vitrinden çekilecek ve taslağa dönecek; yeniden çıkmak için tekrar onay gerekir. Devam edilsin mi?")) return;
                    await publish.mutateAsync({ id: product.id, publish: false });
                    toast.success("Ürün vitrinden çekildi");
                  }}
                  className="w-full rounded-full px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-900"
                >
                  Vitrinden çek
                </button>
              ) : null}
              {dirty ? <p className="text-center text-[11px] text-amber-700">Kaydedilmemiş değişiklik var</p> : null}
            </div>
          ) : (
            <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-500">
              Ürünü kaydetmek ve onaya göndermek için “Ürün ve vitrin yönetimi” yetkisi gerekir.
            </p>
          )}
        </div>

        <SearchVisibilityCard
          className="mt-4"
          readiness={seo.readiness}
          snippet={seo.snippet}
          enrich={
            canManage
              ? {
                  available: aiAvailable && patch.name.trim().length >= 2,
                  unavailableReason: aiAvailable ? "Önce ürün adını yazın." : "AI ile güçlendirme Silver ve üzeri paketlerde.",
                  run: () =>
                    seoEnrich.mutateAsync({
                      kind: "product",
                      name: patch.name,
                      description: patch.description,
                      categoryName,
                      facts: seo.facts,
                      keywords,
                      city: profileQ.data?.city ?? null,
                      industry: profileQ.data?.industry ?? null,
                    }),
                  apply: (r) => {
                    setDescription(r.description);
                    setKeywords(r.keywords.slice(0, MAX_KEYWORDS));
                    if (r.titleSuggestion && !patch.name.trim()) setName(r.titleSuggestion);
                    toast.success("Taslak uygulandı — kontrol edip kaydedin");
                  },
                }
              : undefined
          }
        />

        <p className="mt-4 text-xs/5 text-zinc-500">
          Varyasyonları ayrı ürün olarak açmayın — renk/ölçü gibi farkları kategoriye özel özelliklere yazın. Katalog böyle temiz kalır.
        </p>
      </aside>
    </div>
  );
}

/** Numaralı bölüm — başlık + tek satır açıklama + içerik. `id` çip navigasyonu için. */
function Section({
  id,
  n,
  title,
  lead,
  children,
}: {
  id: string;
  n: number;
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-baslik`} className="scroll-mt-32">
      <div className="mb-5 flex items-start gap-3">
        <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-xs font-semibold text-white">
          {n}
        </span>
        <div>
          <h3 id={`${id}-baslik`} className="text-base font-semibold text-zinc-950">
            {title}
          </h3>
          <p className="mt-0.5 text-xs/5 text-zinc-500">{lead}</p>
        </div>
      </div>
      <div className="space-y-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5 sm:p-6">{children}</div>
    </section>
  );
}
