"use client";

import { useCompanyAuth, useHasCompanyPermission } from "@/hooks/use-company-auth";
import { AttributeFields } from "./attribute-fields";
import { SearchVisibilityCard } from "@/components/seo/search-visibility-card";
import { useAiSeoEnrich } from "@/hooks/use-ai-seo-enrich";
import { useCategoriesByIds } from "@/hooks/use-categories";
import { useCompanyProfile } from "@/hooks/use-company-profile";
import { productSeo } from "@/lib/seo/entities";
import { snippetFromMetadata } from "@/lib/seo/snippet";
import { useSeoT, useUnitLabel } from "@/i18n/domain";
import { useLocale, useTranslations } from "next-intl";
import { productStatusKey } from "@/lib/company/product-status";
import { ImageUploader } from "./image-uploader";
import { PriceModeField, isTierComplete } from "./price-mode-field";
import { ProductActionBar } from "./product-action-bar";
import { EditorRail, sectionFor } from "./editor-rail";
import { productPath } from "@rothern/shared";
import { CategorySelectorButton } from "@/components/categories/category-selector-button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { isInvalidNumber, MoneyInput } from "@/components/ui/money-input";
import {
  useCategoryAttributes,
  useCreateProduct,
  usePublishProduct,
  useUpdateShowcase,
  useUploadProductDocument,
  type PriceTier,
  type ProductShowcase,
} from "@/hooks/use-company-items";
import { XMarkIcon } from "@heroicons/react/20/solid";
import {
  COMMON_UNIT_CODES,
  MIN_DESCRIPTION,
  PRODUCT_MEDIA_TIER,
  UNITS,
  getUnit,
  productCompletion,
  productPublishBlockerCodes,
  productSeoReadiness,
  generateSlug,
  slugifyText,
  tierAtLeast,
  type ProductLike,
} from "@rothern/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSubmitLock } from "@/hooks/use-submit-lock";
import { useConfirm } from "@/components/providers/confirm-dialog";
import { useProductArchive } from "./use-product-archive";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { extractErrorMessage } from "@/lib/tenders/error";

const MAX_KEYWORDS = 15;
/** API `ShowcaseDto.keywords` `@MaxLength(50, { each: true })` ile aynı. */
const MAX_KEYWORD_LENGTH = 50;
/** Katalog/teknik föy — Europages ürün kartındaki gibi az sayıda, seçilmiş. */
const MAX_DOCUMENTS = 3;
/** API `public-image-upload.ts` `MAX_DOCUMENT_BYTES` / `DOCUMENT_MIME` aynası. */
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const INPUT =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";

/** Sunucu kaydının yayın kapısı girdisi — kayıttaki (kalıtsal) eksikler için. */
function productLikeOf(p: ProductShowcase): ProductLike {
  return {
    name: p.name,
    categoryId: p.categoryId,
    description: p.description,
    images: p.images,
    keywords: p.keywords,
    priceMode: p.priceMode,
    priceAmount: p.priceAmount,
    priceTiers: p.priceTiers,
    moq: p.moq,
    attributes: p.attributes,
  };
}

/**
 * İÇERİK alanlarının kanonik izi — API `product-content-diff.ts`
 * (`PRODUCT_CONTENT_FIELDS`) ile aynı alanlar ve aynı indirgeme: kırpılmış
 * metin, boş nitelik düşer, nitelik sırası önemsiz. Fiyat/MOQ/belge/video
 * içerik sayılmaz.
 */
function contentKey(p: {
  name: string;
  description: string | null;
  categoryId: string | null;
  images: string[];
  keywords: string[];
  attributes: Record<string, string | string[]> | null;
}): string {
  const list = (a: string[]) => a.map((x) => x.trim()).filter(Boolean);
  const attrs = Object.entries(p.attributes ?? {})
    .filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify([
    p.name.trim(),
    (p.description ?? "").trim(),
    p.categoryId ?? "",
    list(p.images),
    [...new Set(list(p.keywords))],
    attrs,
  ]);
}

/**
 * ÜRÜN VİTRİN FORMU — tek sayfa, beş numaralı bölüm (2026-09-09 düzeni;
 * üstteki bölüm çipleri kullanıcı isteğiyle KALDIRILDI — sayfa düz akar).
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
  onSaved,
  publishLimitReached,
  limitPending,
  onDirtyChange,
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
   * Düzenlemede kaydın SUNUCU hâli. Yayındaki üründe içerik değişince sunucu
   * ürünü incelemeye alır (PENDING) → sayfa bu kaydı alıp HEMEN önizlemeye
   * geçer (2026-09-15, kullanıcı: "direkt önizlemeye almıyor, yenileyince
   * geçiyor"). Eskiden form açılıştaki eski durumla kalıyordu; bir sonraki
   * kaydetme de 409 PRODUCT_IN_REVIEW alıyordu.
   */
  onSaved?: (saved: ProductShowcase) => void;
  /**
   * Ücretsiz paket YAYINDA+ONAYDA ürün tavanına dayandı (`PRODUCT_LIMITS`,
   * API aynası): "Onaya gönder" kilitlenir, taslak kaydetme serbest kalır.
   */
  publishLimitReached?: boolean;
  /**
   * Tavan bilgisi henüz gelmedi (liste yanıtı bekleniyor; `?yeni=1` doğrudan
   * açılış): "Onaya gönder" bilinene kadar KİLİTLİ sayılır (arayüz testi D-287).
   */
  limitPending?: boolean;
  /**
   * Kaydedilmemiş değişiklik bayrağı üst bileşene — "Ürünlere dön" ve
   * uygulama içi bağlantı koruması orada (`useUnsavedChangesGuard`, O-098).
   */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useTranslations("web.panel.trade.productShowcaseForm");
  const unitLabelOf = useUnitLabel();
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

  const { data: attributeDefs = [] } = useCategoryAttributes(categoryId);
  const save = useUpdateShowcase();
  const create = useCreateProduct();
  const publish = usePublishProduct();
  // Kaydet/gönder = "Ürün ve vitrin yönetimi" işlem izni (API aynası); izinsiz salt okur.
  const canManage = useHasCompanyPermission("sell:product:manage");
  const uploadDoc = useUploadProductDocument();

  const unitDef = getUnit(unitCode);
  // Kayda yazılan birim adı TÜRKÇE kalır (API ve eski kayıtlarla aynı sözlük);
  // ekranda okuyucunun dilindeki etiket basılır (`useUnitLabel`).
  const unitName = unitDef?.nameTr ?? unit;
  const unitLabel = unitLabelOf(unitName, unitCode);

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
      // Eksik kademe (boş/0 fiyat) GÖNDERİLMEZ — satırda uyarı çizilir;
      // eskiden taslak kaydı bile 400 alıyordu (arayüz testi D-050).
      priceTiers: priceMode === "TIERED" ? priceTiers.filter(isTierComplete) : [],
      priceCurrency,
      moq: moq ? Number(moq) : null,
      externalUrl: externalUrl.trim() || null,
      // Video ve belge PAKETLİ (`PRODUCT_MEDIA_TIER`): paketin altında alanlar
      // çizilmez ve GÖNDERİLMEZ — API zaten yok sayıyor; görünmeyen eski bir
      // değer kaydı etkilemesin (Y-11 gözden geçirme).
      ...(mediaAllowed ? { videoUrl: videoUrl.trim() || null, documents } : {}),
      unitCode,
      unit: unitName,
    }),
    [name, description, categoryId, images, keywords, attributes, priceMode, priceAmount, priceTiers, priceCurrency, moq, externalUrl, videoUrl, documents, unitCode, unitName, mediaAllowed],
  );

  /**
   * KAYDEDİLMEMİŞ DEĞİŞİKLİK: kayıttaki hâl ile formun anlık hâli ayrışınca
   * bayrak üst bileşene gider; sekme kapatma uyarısı, uygulama içi bağlantı
   * onayı ve "Ürünlere dön" onayı orada tek korumada (arayüz testi O-098 —
   * eskiden yalnız sekme kapatma uyarıyordu, bu yorum vaat ettiği hâlde).
   */
  const initial = useRef(JSON.stringify(patch));
  const dirty = JSON.stringify(patch) !== initial.current;
  const dirtyCb = useRef(onDirtyChange);
  dirtyCb.current = onDirtyChange;
  useEffect(() => {
    dirtyCb.current?.(dirty);
  }, [dirty]);
  useEffect(() => () => dirtyCb.current?.(false), []);

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
      // HAM kademeler: boş/0 fiyatlı satır gönderilmese de rayda fiyat
      // eksiği olarak görünmeli (arayüz testi D-050).
      priceTiers: priceMode === "TIERED" ? priceTiers : [],
      moq: patch.moq,
      attributes,
    };
    return {
      completion: productCompletion(like, {
        requiredAttributeKeys: attributeDefs.filter((d) => d.isRequired).map((d) => d.key),
      }),
      blockers: productPublishBlockerCodes(like),
    };
  }, [patch, images, keywords, priceMode, priceTiers, attributes, attributeDefs]);

  /* ARAMA GÖRÜNÜRLÜĞÜ (SEO Parça 8): puan + Google parçacığı + AI taslağı.
     Parçacık sayfanın GERÇEK şablonundan (`productSeo`) — ayrı metin yok. */
  const { data: categoryRows = [] } = useCategoriesByIds(categoryId ? [categoryId] : []);
  const categoryName = categoryRows[0]?.nameTr ?? null;
  const seoEnrich = useAiSeoEnrich();
  // Şehir/sektör oturum anlık görüntüsünde yok → profil sorgusu (önbellekli).
  const profileQ = useCompanyProfile();
  const locale = useLocale();
  const seoT = useSeoT();
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
          name: patch.name || t("urun"),
          slug: product.slug ?? (slugifyText(patch.name) || "urun"),
          description: patch.description,
          images,
          brand: null,
          mpn: null,
          unit: unitLabel,
          moq: patch.moq != null ? String(patch.moq) : null,
          priceMode,
          priceAmount: patch.priceAmount != null ? String(patch.priceAmount) : null,
          priceTiers: priceMode === "TIERED" ? patch.priceTiers : null,
          priceCurrency,
          category: categoryId && categoryName ? { id: categoryId, name: categoryName } : null,
          keywords,
        },
        company: {
          name: company?.name ?? t("firma"),
          slug: companySlug,
          city: profileQ.data?.city ?? null,
          country: company?.country ?? null,
          industry: profileQ.data?.industry ?? null,
        },
        indexable: true,
      }, { locale, t: seoT }).metadata,
    );
    const facts = attributeEntries.map(([k, v]) => {
      const def = attributeDefs.find((d) => d.key === k);
      const show = (x: string) => def?.optionLabels?.[x] ?? x;
      return `${def?.nameTr ?? k}: ${Array.isArray(v) ? v.map(show).join(", ") : show(v)}`;
    });
    return { readiness, snippet, facts };
  }, [patch, images, keywords, attributes, attributeDefs, priceMode, priceCurrency, unitLabel, categoryId, categoryName, company, profileQ.data, product.slug, locale, seoT, t]);
  const aiAvailable = !!company && tierAtLeast(company.tier, "SILVER");

  /** Anahtar kelime ÖNERİLERİ: kategori adı + ürün adındaki anlamlı sözcükler. */
  const keywordSuggestions = useMemo(() => {
    const out: string[] = [];
    const push = (s: string) => {
      const k = s.toLowerCase().trim();
      if (k.length >= 3 && k.length <= MAX_KEYWORD_LENGTH && !keywords.includes(k) && !out.includes(k)) out.push(k);
    };
    if (categoryName) push(categoryName);
    for (const w of name.split(/[\s,/()-]+/)) if (w.length >= 4 && !/^\d+$/.test(w)) push(w);
    return out.slice(0, 5);
  }, [categoryName, name, keywords]);

  const addDocument = async (file: File | undefined) => {
    if (!file || documents.length >= MAX_DOCUMENTS) return;
    // Tür/boyut YÜKLEMEDEN ÖNCE (arayüz testi D-289): 11 MB'lık PDF eskiden
    // depoya tamamen yüklenip sonra reddediliyordu, üstüne iki toast çıkıyordu.
    if (file.type !== "application/pdf" || file.size > MAX_DOCUMENT_BYTES) {
      toast.error(t("belgeYuklenemediYalnizPdfEn"));
      if (docInput.current) docInput.current.value = "";
      return;
    }
    try {
      const url = await uploadDoc.mutateAsync(file);
      const title = file.name.replace(/\.pdf$/i, "").slice(0, 200) || t("belge");
      setDocuments((d) => [...d, { url, title }]);
    } catch (err) {
      // Sunucu/ağ hatasının toast'ını küresel yakalayıcı basar (403 "yetkiniz
      // yok" dahil); burada yalnız depo yüklemesi (PUT) gibi yakalayıcı dışı
      // hatalar — "yalnız PDF" diye YANLIŞ neden de söylenmez (O-099).
      if (!isAxiosError(err)) toast.error(t("belgeYuklenemedi"));
    } finally {
      if (docInput.current) docInput.current.value = "";
    }
  };

  const addKeyword = (raw = keywordDraft) => {
    // Virgülle çoklu giriş: "boru, dikişsiz, st37" tek seferde.
    const all = raw.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (!all.length) return;
    // Derin denetim LU-31: API her etiketi 50 karakterle sınırlıyor; uzun
    // parça çip olunca ürünün HER kaydı (taslak dahil) 400 alıyordu. Uzun
    // parça eklenmez, düzeltilsin diye kutuda kalır.
    const parts = all.filter((k) => k.length <= MAX_KEYWORD_LENGTH);
    const tooLong = all.filter((k) => k.length > MAX_KEYWORD_LENGTH);
    if (parts.length) {
      setKeywords((prev) => {
        const next = [...prev];
        for (const k of parts) if (!next.includes(k) && next.length < MAX_KEYWORDS) next.push(k);
        return next;
      });
    }
    if (tooLong.length) {
      toast.error(t("anahtarKelimeCokUzun", { max: MAX_KEYWORD_LENGTH }));
      setKeywordDraft(tooLong.join(", "));
    } else {
      setKeywordDraft("");
    }
  };

  const status = productStatusKey(product);
  // PENDING ürün bu forma HİÇ gelmez (inceleme kilidi → `ProductPreview`);
  // API de 409 döner. Burada yalnız taslak / düzeltme istendi / yayında.
  const publishLocked = !!publishLimitReached && !product.isPublic;
  // Tavan bilinmiyorken gönderim kapalı (D-287); kilit notu çizilmez — henüz dolu değil.
  const submitBlocked = publishLocked || (!!limitPending && !product.isPublic);
  // YAYIN KAPISI (arayüz testi O-009) — API `assertStaysPublishable` ile AYNI
  // kural: içerik (ad/açıklama/kategori/görsel/etiket/nitelik) değiştiyse
  // raydaki HER eksik kaydı keser; içerik dışı kayıt (fiyat/MOQ…) yalnız
  // kayıtta OLMAYAN yeni bir eksik doğurursa kesilir. Kapı sıkılaşmadan önce
  // yayına çıkmış eksik ürün (ör. kısa eski açıklama) fiyatını güncelleyebilir
  // (gözden geçirme: eskiden her eksik Kaydet'i kapatıyordu, API izin verirken).
  const savedBlockerCodes = useMemo(
    () => new Set(productPublishBlockerCodes(productLikeOf(product)).map((b) => b.code)),
    [product],
  );
  const contentChanged = contentKey(patch) !== contentKey(product);
  // Kaydı KESEN eksikler: içerik değiştiyse hepsi, değilse yalnız yeni doğanlar.
  const cuttingBlockers =
    status !== "published"
      ? []
      : contentChanged
        ? live.blockers
        : live.blockers.filter((b) => !savedBlockerCodes.has(b.code));
  const publishedBlocked = cuttingBlockers.length > 0;

  // Kaydet / Onaya gönder tek uçuşta: çift tık aynı ürünü iki kez oluşturmaz
  // (arayüz testi FX-00 O-006).
  const saveLock = useSubmitLock();
  const handleSave = (thenSubmit: boolean) => saveLock.run(() => doSave(thenSubmit));
  const doSave = async (thenSubmit: boolean) => {
    if (!patch.name) {
      toast.error(t("urunAdiZorunlu"));
      return;
    }
    // Sayısal nitelikte geçersiz giriş ("2,5,1", "1.2.3") kaydedilmez — eskiden
    // `type="number"` "2,5"i sessizce 25 yazıyordu (arayüz testi kapanış NUM).
    if (attributeDefs.some((d) => d.type === "NUMBER" && isInvalidNumber(attributes[d.key]))) {
      toast.error(t("nitelikSayiGecersiz"));
      return;
    }
    if (thenSubmit && publishLocked) {
      toast.error(t("urunTavaniDolduDogrulama"));
      return;
    }
    if (thenSubmit && submitBlocked) return;
    const droppedTiers = priceMode === "TIERED" ? priceTiers.length - patch.priceTiers.length : 0;
    // Eksik kademe notu AYRI toast değil, sonuç toast'ının açıklaması: iki
    // toast'ta Sonner uyarıyı başarı toast'ının ARKASINA yığıyordu (yalnız
    // ~13px şerit görünüyordu, arayüz testi son tur webC-4). Not varken sonuç
    // sarı (uyarı) çizilir ve okunacak kadar uzun kalır.
    const tierNote = droppedTiers > 0 ? t("eksikKademeKaydedilmedi", { n: droppedTiers }) : null;
    const notifySaved = (message: string) => {
      if (tierNote) toast.warning(message, { description: tierNote, duration: 8000 });
      else toast.success(message);
    };
    try {
      // Yeni üründe kayıt TEK çağrıyla oluşur (create+vitrin); sonrasında
      // düzenleme moduna geçeriz — kullanıcı için bu tek bir "kaydet".
      const saved = isNew
        ? await create.mutateAsync({ ...patch, unit })
        : await save.mutateAsync({ id: product.id, patch });
      initial.current = JSON.stringify(patch);
      // Eksik kademe gönderilmedi — form da sunucu kopyasıyla AYNI olsun diye
      // satır formdan çıkarılır ve bu açıkça söylenir (arayüz testi D-050).
      // Eskiden yalnız yeni üründe (üst bileşen formu sunucu kopyasından
      // yeniden kurunca) kayboluyordu; düzenlemede satır formda kalırken not
      // "formdan çıkarıldı" diyordu (son tur webC-4).
      if (droppedTiers > 0) setPriceTiers(patch.priceTiers);
      if (!thenSubmit) {
        if (isNew) onCreated?.(saved);
        else onSaved?.(saved);
        // Mesaj SONUCA göre (arayüz testi D-125): yalnız fiyat/MOQ değişen
        // yayındaki ürün onaylı kalır — "yeniden incelenecek" demek yanlış.
        notifySaved(
          isNew
            ? t("urunTaslakOlarakEklendi")
            : saved.reviewStatus === "PENDING"
              ? t("kaydedildiIcerikDegisikligiYenidenIncelenece")
              : product.isPublic
                ? t("kaydedildi")
                : t("taslakKaydedildi"),
        );
        return;
      }
      // Yeni üründe "Onaya gönder": düzenleme moduna (onCreated) YALNIZ gönderim
      // olmazsa geçilir — kayıt taslak kaldı, ikinci kaydetme güncelleme olsun.
      // Gönderim başarılıysa doğrudan listeye dönülür. Eskiden onCreated önce
      // çağrılıyordu: üst bileşen TASLAK kopyayla düzenleme formu açıyor, sonraki
      // onClose (create modunun kapanışı) boşa düşüyor ve kullanıcı PENDING
      // ürünün bayat "Taslak" formunda kalıyordu (tekrar gönderim → 409).
      if (saved.publishBlockers.length > 0) {
        if (isNew) onCreated?.(saved);
        const blocked = t("onayaGonderilemedi", { reasons: saved.publishBlockers.join(", ") });
        if (tierNote) toast.error(blocked, { description: tierNote });
        else toast.error(blocked);
        return;
      }
      try {
        await publish.mutateAsync({ id: saved.id, publish: true });
      } catch (err) {
        if (isNew) onCreated?.(saved);
        throw err;
      }
      notifySaved(t("onayaGonderildiIncelemeBiteneKadar"));
      onClose();
    } catch (err) {
      // 409 PRODUCT_IN_REVIEW dahil: sunucu mesajı kullanıcıya aynen.
      toast.error(extractErrorMessage(err, t("kaydedilemedi")));
    }
  };

  const busy = save.isPending || publish.isPending || create.isPending || saveLock.locked;

  /* Birincil düğme metni duruma göre — kullanıcı ne olacağını okusun. */
  const primaryLabel =
    status === "draft"
      ? t("onayaGonder")
      : status === "rejected"
        ? t("duzeltVeYenidenGonder")
        : t("kaydet");
  const primaryAction = () => void handleSave(status === "draft" || status === "rejected");

  const publicHref =
    !isNew && product.isPublic && company?.slug && product.slug ? productPath(company.slug, product.slug) : null;
  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  // Uygulama içi çevrili onay (arayüz testi D-126; tarayıcının OK/Cancel'ı değil).
  const confirm = useConfirm();
  const unpublish = async () => {
    const ok = await confirm({
      title: t("vitrindenCekOnayBaslik"),
      description: t("vitrindenCekOnayAciklama"),
      confirmLabel: t("vitrindenCek"),
    });
    if (!ok) return;
    // Derin denetim LU-31: hata yakalanmıyordu (işlenmemiş ret, toast yok);
    // başarıda da `product` güncellenmediği için form "Yayında" gösteriyordu.
    try {
      const saved = await publish.mutateAsync({ id: product.id, publish: false });
      toast.success(t("urunVitrindenCekildi"));
      if (onSaved) onSaved(saved);
      else onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, t("vitrindenCekilemedi")));
    }
  };

  // ARŞİVLE (arayüz testi O-039): kayıtlı ve incelemede OLMAYAN üründe; arşivlenen
  // ürün listeden (yayındaysa vitrinden) kalkar, Arşiv sekmesinden geri alınır.
  const productArchive = useProductArchive();
  const archive = async () => {
    if (await productArchive.archive(product.id)) onClose();
  };

  /* DÜZEN (2026-09-19, kullanıcı kararı): üstte yapışkan eylem çubuğu; solda
     form (5 bölüm), sağda yapışkan ray (tamamlanma + eksik çipleri + öneriler).
     Canlı önizleme paneli KALDIRILDI — yayındaki ürün önce salt-okunur
     önizlemeyle açılır, "Düzenle" bu forma getirir. */
  return (
    <div>
      <ProductActionBar
        name={name}
        status={status}
        isNew={isNew}
        dirty={dirty}
        busy={busy}
        canManage={canManage}
        primaryLabel={primaryLabel}
        onPrimary={primaryAction}
        // Yayındaki üründe değişiklik yokken Kaydet KAPALI (2026-09-19, kullanıcı
        // bulgusu: değişmeden kaydedince yeniden incelemeye giriyordu).
        primaryDisabled={
          ((status === "draft" || status === "rejected") && submitBlocked) ||
          (status === "published" && (!dirty || publishedBlocked))
        }
        draftSave={status === "draft" || status === "rejected" ? () => void handleSave(false) : undefined}
        unpublish={product.isPublic && !isNew ? () => void unpublish() : undefined}
        archive={!isNew && product.reviewStatus !== "PENDING" ? () => void archive() : undefined}
        publicHref={publicHref}
        publishLocked={publishLocked}
        blockedNotice={publishedBlocked && dirty}
        blockedCount={cuttingBlockers.length}
        onShowMissing={publishedBlocked ? () => jump(sectionFor(cuttingBlockers[0])) : undefined}
      />
      {status === "rejected" && product.rejectReason ? (
        <p className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-600/20">
          <span className="font-semibold">{t("duzeltmeGerekcesi")}</span> {product.rejectReason}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* İZİNSİZ (salt-okur) kullanıcıda alanlar KAPALI, yükleme kontrolleri
            çizilmez (arayüz testi O-099) — eskiden form tam düzenlenebilir
            açılıyor, yüklemeler 403 alıyordu. */}
        <fieldset disabled={!canManage} className="min-w-0">
          <div className="space-y-10">
            {/* 1 ── TEMEL BİLGİLER */}
            <Section id="urun-temel" n={1} title={t("temelBilgiler")} lead={t("adKategoriVeAciklamaArama")}>
              <Field hint={t("urunTipiTemelOzellikOlcu")}>
                <Label htmlFor="urun-adi" required>{t("urunAdi")}</Label>
                <input
                  id="urun-adi"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={200}
                  placeholder={t("dagitimPanosu400aIp54")}
                  className={INPUT}
                />
                <p className={`mt-1 text-xs ${name.trim().length > 128 ? "text-amber-700" : "text-zinc-500"}`}>
                  {t("n128Karakter", { length: name.trim().length })}
                </p>
              </Field>

              <Field hint={t("nitelikAlanlariSectiginizKategoridenGelir")}>
                {/* Kontrol bir modal düğmesi ve kendi adını taşıyor ("Ürün kategorisini
                   seçin") — burası ALAN ETİKETİ değil BAŞLIK. Boş <label> bırakmak
                   erişilebilirlik ihlali olurdu. */}
                <Label as="p" required>{t("kategori")}</Label>
                <CategorySelectorButton
                  value={categoryId ? [categoryId] : []}
                  onChange={(ids) => setCategoryId(ids[0] ?? "")}
                  mode="single"
                  modalTitle={t("urunKategorisi")}
                  modalDescription={t("urunKategorisiAciklama")}
                  placeholder={t("urunKategorisiniSecin")}
                />
              </Field>

              <Field hint={t("onayaGondermekIcinEnAz", { min: MIN_DESCRIPTION })}>
                <Label htmlFor="urun-aciklama" required>{t("aciklama")}</Label>
                <textarea
                  id="urun-aciklama"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={5000}
                  rows={7}
                  placeholder={t("ip54Korumali400aDagitimPanosu")}
                  className={INPUT}
                />
                <p className={`mt-1 text-xs ${description.trim().length >= MIN_DESCRIPTION ? "text-emerald-600" : "text-zinc-500"}`}>
                  {t("n5000Karakter", { length: description.trim().length, min: MIN_DESCRIPTION })}
                </p>
              </Field>
            </Section>

            {/* 2 ── GÖRSELLER */}
            <Section id="urun-gorsel" n={2} title={t("gorseller")} lead={t("ilkGorselKapakFarkliAcilar")}>
              <ImageUploader images={images} onChange={setImages} readOnly={!canManage} />
            </Section>

            {/* 3 ── ÖZELLİKLER */}
            <Section id="urun-ozellik" n={3} title={t("anahtarKelimelerVeOzellikler")} lead={t("alicininYazacagiSozcuklerVeKategoriye")}>
              <div>
                <Label htmlFor="urun-anahtar-kelime">{t("anahtarKelimeler")}</Label>
                <p className="mt-1 text-xs text-zinc-500">
                  {t("enFazlaVirgulleBirdenCok", { max: MAX_KEYWORDS })}
                </p>
                {keywords.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {keywords.map((k) => (
                      <span key={k} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-sm text-zinc-700">
                        {k}
                        <button
                          type="button"
                          onClick={() => setKeywords(keywords.filter((x) => x !== k))}
                          aria-label={t("etiketiniKaldir", { keyword: k })}
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
                      id="urun-anahtar-kelime"
                      value={keywordDraft}
                      onChange={(e) => setKeywordDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addKeyword();
                        }
                      }}
                      maxLength={200}
                      placeholder={t("celikBoruDikissizSt37")}
                      className={`${INPUT} flex-1`}
                    />
                    <button
                      type="button"
                      onClick={() => addKeyword()}
                      className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      {t("ekle")}
                    </button>
                  </div>
                ) : null}
                {keywordSuggestions.length && keywords.length < MAX_KEYWORDS ? (
                  <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                    {t("oneri")}
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
                <h4 className="text-sm font-medium text-zinc-950">{t("kategoriyeOzelOzellikler")}</h4>
                {!categoryId ? (
                  <p className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                    {t("once1BolumdeKategoriSecin")}
                  </p>
                ) : attributeDefs.length === 0 ? (
                  <p className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                    {t("buKategorideTanimliNitelikYok")}
                  </p>
                ) : (
                  <>
                    <p className="mt-1 mb-4 text-xs text-zinc-500">
                      {/* Ham segment kodu ("“40” segmentinden") basılmaz; yıldızın anlamı
                          (tamamlanma puanı) burada söylenir (arayüz testi D-129, D-290). */}
                      {t("buAlanlarKategoridenGelir")}
                    </p>
                    <AttributeFields defs={attributeDefs} values={attributes} onChange={setAttributes} />
                  </>
                )}
              </div>
            </Section>

            {/* 4 ── FİYAT VE SİPARİŞ */}
            <Section id="urun-fiyat" n={4} title={t("fiyatVeSiparis")} lead={t("teklifIsteyinDeGecerliBir")}>
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
                <Field hint={t("fiyatVeMinimumSiparisBu")}>
                  <Label htmlFor="urun-birim">{t("satisBirimi")}</Label>
                  <select id="urun-birim" value={unitCode} onChange={(e) => setUnitCode(e.target.value)} className={INPUT}>
                    {UNITS.filter(
                      (u) => (COMMON_UNIT_CODES as readonly string[]).includes(u.code) || u.code === unitCode,
                    ).map((u) => (
                      <option key={u.code} value={u.code}>
                        {unitLabelOf(u.nameTr, u.code)} ({u.symbol})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field>
                  <Label htmlFor="urun-moq">{t("minimumSiparisMiktari")}</Label>
                  <div className="flex items-center gap-2">
                    {/* Yerel biçimli miktar (arayüz testi son tur S-SELL):
                        `type=number` Türkçe "1.000"i 1 okuyabiliyordu. */}
                    <div className="w-40">
                      <MoneyInput
                        id="urun-moq"
                        maxDecimals={3}
                        value={moq}
                        onChange={setMoq}
                      />
                    </div>
                    <span className="text-sm text-zinc-500">{unitLabel}</span>
                  </div>
                </Field>
              </div>
            </Section>

            {/* 5 ── EKLER */}
            <Section id="urun-ekler" n={5} title={t("ekler")} lead={t("katalogPdfIVideoVe")}>
              {mediaAllowed ? (
                <>
                  <div>
                    {/* Dosya girişi aşağıda KENDİ <label>'ının içinde sarılı (implicit
                       bağlama) — burası bölüm başlığı. */}
                    <Label as="p">{t("dokumanlar")}</Label>
                    <p className="mt-1 text-xs text-zinc-500">
                      {t("pdfKatalogVeyaTeknikFoy", { max: MAX_DOCUMENTS })}
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
                              aria-label={t("belgeBasligi", { n: i + 1 })}
                              className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                            />
                            <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-zinc-600 underline hover:text-zinc-900">
                              {t("ac")}
                            </a>
                            <button
                              type="button"
                              onClick={() => setDocuments((docs) => docs.filter((_, j) => j !== i))}
                              aria-label={t("belgesiniKaldir", { title: d.title })}
                              className="text-zinc-400 hover:text-zinc-900"
                            >
                              <XMarkIcon aria-hidden className="size-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {canManage && documents.length < MAX_DOCUMENTS ? (
                      <label className="mt-3 inline-flex cursor-pointer items-center rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                        {uploadDoc.isPending ? t("yukleniyor") : t("pdfEkle")}
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

                  <Field hint={t("youtubeVeyaVimeoBaglantisiUrun")}>
                    <Label htmlFor="urun-video">{t("videoBaglantisi")}</Label>
                    <input id="urun-video" type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" className={INPUT} />
                  </Field>
                </>
              ) : (
                <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                  {t("urunBelgesiPdfKatalogTeknik")}
                </p>
              )}

              <Field hint={t("kendiWebSitenizdekiUrunSayfasi")}>
                <Label htmlFor="urun-dis-baglanti">{t("urunSayfasiBaglantisi")}</Label>
                <input id="urun-dis-baglanti" type="url" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://…" className={INPUT} />
              </Field>
            </Section>
          </div>
        </fieldset>

        <aside className="min-w-0 lg:sticky lg:top-[7.5rem] lg:self-start">
          <EditorRail
            completion={live.completion}
            blockers={live.blockers}
            onJump={jump}
            recommendations={
              <SearchVisibilityCard
                  className="rounded-none shadow-none ring-0"
                  readiness={seo.readiness}
                  snippet={seo.snippet}
                  enrich={
                    canManage
                      ? {
                          available: aiAvailable && patch.name.trim().length >= 2,
                          unavailableReason: aiAvailable ? t("onceUrunAdiniYazin") : t("aiIleGuclendirmeDogrulama"),
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
                            toast.success(t("taslakUygulandiKontrolEdipKaydedin"));
                          },
                        }
                      : undefined
                  }
                />
            }
          />
          <p className="mt-4 text-xs/5 text-zinc-500">
            {t("varyasyonlariAyriUrunOlarakAcmayin")}
          </p>
        </aside>
      </div>
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
    <section id={id} aria-labelledby={`${id}-baslik`} className="scroll-mt-44">
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
