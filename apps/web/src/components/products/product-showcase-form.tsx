"use client";

import { AttributeFields } from "./attribute-fields";
import { CompletionRing } from "./completion-ring";
import { ImageUploader } from "./image-uploader";
import { PriceModeField } from "./price-mode-field";
import { CategorySelectorButton } from "@/components/categories/category-selector-button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import {
  useCategoryAttributes,
  usePublishProduct,
  useUpdateShowcase,
  type PriceTier,
  type ProductShowcase,
} from "@/hooks/use-company-items";
import { ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const MAX_KEYWORDS = 15;

/**
 * ÜRÜN VİTRİN FORMU.
 *
 * Üç şey aynı anda yaşıyor ve ayrımları bilinçli:
 *  · TAMAMLANMA SKORU — yönlendirir, engellemez. Canlı güncellenir.
 *  · YAYIN KAPISI — engeller. Skordan AYRI ve daha dar liste.
 *  · KAYDET / YAYIMLA — kaydetmek taslakta bırakır; yayımlamak ayrı jest.
 *
 * Skoru kapı yapmadık: "80 puan olmadan yayımlayamazsın" demek kullanıcıyı
 * puan toplamak için alan uydurmaya iterdi.
 *
 * Nitelik alanları ELLE YAZILMAZ — kategori seçilince ata zincirinden miras
 * set gelir ve form ondan kurulur (`useCategoryAttributes`).
 */
export function ProductShowcaseForm({
  product,
  unit,
  onClose,
}: {
  product: ProductShowcase;
  /** Kalemin ölçü birimi — fiyat ve MOQ satırlarında gösterilir. */
  unit: string;
  onClose: () => void;
}) {
  const [categoryId, setCategoryId] = useState(product.categoryId ?? "");
  const [images, setImages] = useState<string[]>(product.images);
  const [keywords, setKeywords] = useState<string[]>(product.keywords);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [attributes, setAttributes] = useState<Record<string, string | string[]>>(
    product.attributes ?? {},
  );
  const [priceMode, setPriceMode] = useState(product.priceMode);
  const [priceAmount, setPriceAmount] = useState(product.priceAmount ?? "");
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>(
    product.priceTiers ?? [],
  );
  const [priceCurrency, setPriceCurrency] = useState(product.priceCurrency);
  const [moq, setMoq] = useState(product.moq ?? "");
  const [externalUrl, setExternalUrl] = useState(product.externalUrl ?? "");

  const { data: attributeDefs = [] } = useCategoryAttributes(categoryId);
  const save = useUpdateShowcase();
  const publish = usePublishProduct();

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
    }),
    [categoryId, images, keywords, attributes, priceMode, priceAmount, priceTiers, priceCurrency, moq, externalUrl],
  );

  const addKeyword = () => {
    const k = keywordDraft.trim().toLowerCase();
    if (!k || keywords.includes(k) || keywords.length >= MAX_KEYWORDS) return;
    setKeywords([...keywords, k]);
    setKeywordDraft("");
  };

  const handleSave = async (thenPublish: boolean) => {
    try {
      const saved = await save.mutateAsync({ id: product.id, patch });
      if (!thenPublish) {
        toast.success("Taslak kaydedildi");
        return;
      }
      if (saved.publishBlockers.length > 0) {
        toast.error(`Yayımlanamadı — ${saved.publishBlockers.join(", ")}`);
        return;
      }
      await publish.mutateAsync({ id: product.id, publish: true });
      toast.success("Ürün vitrinde yayımlandı");
      onClose();
    } catch {
      toast.error("Kaydedilemedi");
    }
  };

  const busy = save.isPending || publish.isPending;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-8">
        <Field
          hint="Nitelik alanları seçtiğiniz kategoriden gelir — üst kategoride tanımlı nitelikler otomatik devralınır."
        >
          <Label required>Kategori</Label>
          <CategorySelectorButton
            value={categoryId ? [categoryId] : []}
            onChange={(ids) => setCategoryId(ids[0] ?? "")}
            mode="single"
            modalTitle="Ürün kategorisi"
            placeholder="Ürün kategorisini seçin"
          />
        </Field>

        <ImageUploader images={images} onChange={setImages} />

        <div>
          <Label>Anahtar kelimeler</Label>
          <p className="mt-1 text-xs text-zinc-500">
            En fazla {MAX_KEYWORDS}. Ürün sayfasında görünür ve aramada
            kullanılır.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {keywords.map((k) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-sm text-zinc-700"
              >
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
          {keywords.length < MAX_KEYWORDS ? (
            <div className="mt-3 flex gap-2">
              <input
                value={keywordDraft}
                onChange={(e) => setKeywordDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
                maxLength={50}
                placeholder="çelik boru, dikişsiz…"
                className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
              />
              <button
                type="button"
                onClick={addKeyword}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Ekle
              </button>
            </div>
          ) : null}
        </div>

        <PriceModeField
          mode={priceMode}
          amount={priceAmount}
          tiers={priceTiers}
          currency={priceCurrency}
          unit={unit}
          onChange={(n) => {
            if (n.mode) setPriceMode(n.mode);
            if (n.amount !== undefined) setPriceAmount(n.amount);
            if (n.tiers) setPriceTiers(n.tiers);
            if (n.currency) setPriceCurrency(n.currency);
          }}
        />

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
            <span className="text-sm text-zinc-500">{unit}</span>
          </div>
        </Field>

        {attributeDefs.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">
              Kategoriye özel özellikler
            </h3>
            <p className="mt-1 mb-4 text-xs text-zinc-500">
              Bu alanlar “{attributeDefs[0]?.definedAt.slice(0, 2)}”
              segmentinden ve alt kategorilerinden gelir. Doldurmak zorunlu
              değil; tamamlanma skorunu ve aramada bulunabilirliği artırır.
            </p>
            <AttributeFields
              defs={attributeDefs}
              values={attributes}
              onChange={setAttributes}
            />
          </div>
        ) : null}

        <Field hint="Kendi web sitenizdeki ürün sayfası — ziyaretçi oraya da gidebilsin.">
          <Label>Ürün sayfası bağlantısı</Label>
          <input
            type="url"
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
          />
        </Field>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <CompletionRing completion={product.completion} />

        {product.publishBlockers.length > 0 ? (
          <div className="mt-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-600/20">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <ExclamationTriangleIcon aria-hidden className="size-4" />
              Yayımlamak için gerekli
            </p>
            <ul className="mt-2 space-y-1 text-sm text-amber-800">
              {product.publishBlockers.map((b) => (
                <li key={b}>· {b}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSave(true)}
            className="w-full rounded-full bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
          >
            {product.isPublic ? "Kaydet ve güncelle" : "Kaydet ve yayınla"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSave(false)}
            className="w-full rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            Taslak olarak kaydet
          </button>
          {product.isPublic ? (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                await publish.mutateAsync({ id: product.id, publish: false });
                toast.success("Ürün vitrinden çekildi");
              }}
              className="w-full rounded-full px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-900"
            >
              Vitrinden çek
            </button>
          ) : null}
        </div>

        <p className="mt-4 text-xs/5 text-zinc-500">
          Varyasyonları ayrı ürün olarak açmayın — renk/ölçü gibi farkları
          kategoriye özel özelliklere yazın. Katalog böyle temiz kalır.
        </p>
      </aside>
    </div>
  );
}
