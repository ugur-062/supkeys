"use client";

import { CategorySelectorButton } from "@/components/categories/category-selector-button";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCategoriesByIds } from "@/hooks/use-categories";
import { api } from "@/lib/api";
import {
  MAX_LISTING_ITEMS,
  type TenderFormData,
} from "@/lib/tenders/form-schema";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  FileText,
  HelpCircle,
  Info,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { ItemDetailModal } from "./item-detail-modal";
import { ItemQuestionModal } from "./item-question-modal";
import { LogisticsSection, isLogisticsCategoryCode } from "./step-1-info";

/**
 * Kalemlerden otomatik AI kategori önerisi. Kullanıcı kalem girmeyi bıraktıktan
 * kısa süre sonra (debounce) mevcut kalem adları öneri ucuna gönderilir; dönen
 * ≤3 doğrulanmış L3 kategorisi YALNIZ alan boşsa uygulanır ("AI önerisi"
 * rozetiyle). Kurallar:
 *  - Elle seçilmiş / düzenleme-belge akışından dolu gelmiş alanın üzerine
 *    ASLA yazılmaz (categoryIds boş değilse çağrı bile yapılmaz).
 *  - Aynı kalem kümesi için tek çağrı (hash set'i) — yazım sırasında AI
 *    çağrısı birikmez, bütçe korunur.
 *  - 403/503 (paket/AI kapalı) kalıcı olarak devre dışı bırakır; diğer
 *    hatalar sessizce yutulur — manuel seçici her durumda çalışır.
 */
function useCategoryAutoSuggest(
  setCategoryIds: (ids: string[]) => void,
  categoryIds: string[],
) {
  const { control } = useFormContext<TenderFormData>();
  const items = useWatch({ control, name: "items" });
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);
  const triedRef = useRef<Set<string>>(new Set());
  const disabledRef = useRef(false);

  // Async yanıt anında alanın hâlâ boş olduğunu ref'ten doğrula (yarış).
  const categoryIdsRef = useRef(categoryIds);
  categoryIdsRef.current = categoryIds;

  const named = useMemo(
    () =>
      (items ?? [])
        .map((i) => ({
          name: (i?.name ?? "").trim().slice(0, 300),
          description:
            (i?.description ?? "").trim().slice(0, 500) || undefined,
        }))
        .filter((i) => i.name.length >= 3),
    [items],
  );
  const itemsKey = useMemo(
    () => JSON.stringify(named.map((i) => [i.name, i.description ?? ""])),
    [named],
  );

  useEffect(() => {
    if (named.length === 0 || categoryIds.length > 0) return;
    if (triedRef.current.has(itemsKey) || disabledRef.current) return;
    const t = setTimeout(async () => {
      if (triedRef.current.has(itemsKey) || disabledRef.current) return;
      triedRef.current.add(itemsKey);
      setLoading(true);
      try {
        const r = await api.post<{ categoryIds: string[] }>(
          "/company/ai/tender-extract/category-suggest",
          { items: named },
        );
        const ids = r.data?.categoryIds;
        if (
          Array.isArray(ids) &&
          ids.length > 0 &&
          categoryIdsRef.current.length === 0
        ) {
          setCategoryIds(ids.slice(0, 10));
          setApplied(true);
        }
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response
          ?.status;
        if (status === 403 || status === 503) disabledRef.current = true;
      } finally {
        setLoading(false);
      }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, categoryIds.length]);

  return { loading, applied, clearApplied: () => setApplied(false) };
}

export function Step2Items() {
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext<TenderFormData>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  const itemsArrayError = errors.items?.message ?? errors.items?.root?.message;

  const categoryIds = useWatch({ control, name: "categoryIds" }) ?? [];
  const isLogistics = useWatch({ control, name: "isLogistics" });
  const listingTypeForRol = useWatch({ control, name: "listingType" });
  const rol = listingTypeForRol === "SATIS" ? "alıcı" : "tedarikçi";

  const setCategoryIds = (ids: string[]) =>
    setValue("categoryIds", ids, { shouldValidate: true, shouldDirty: true });

  const ai = useCategoryAutoSuggest(setCategoryIds, categoryIds);

  // Lojistik — seçilen kategorilerden biri Nakliye/Depolama/Posta segmentinde
  // (UNSPSC kod 78…) ise ihale otomatik "lojistik" olur ve taşıma alanları açılır.
  const selectedCategories = useCategoriesByIds(categoryIds);
  const categoriesAreLogistics = (selectedCategories.data ?? []).some((c) =>
    isLogisticsCategoryCode(c.code),
  );
  useEffect(() => {
    if (categoriesAreLogistics !== isLogistics) {
      setValue("isLogistics", categoriesAreLogistics, { shouldValidate: true });
    }
  }, [categoriesAreLogistics, isLogistics, setValue]);

  const handleAdd = () => {
    if (fields.length >= MAX_LISTING_ITEMS) return;
    append({
      name: "",
      description: "",
      quantity: 1,
      unit: "adet",
      materialCode: "",
      requiredByDate: "",
      targetUnitPrice: undefined,
      customQuestion: "",
      questions: [],
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 p-3 rounded-lg bg-brand-50/40 border border-brand-100 text-xs text-slate-600">
        <Info className="w-4 h-4 text-brand-600 mt-0.5 flex-shrink-0" />
        <p>
          Kalemleri tek tek ekleyin. Excel toplu yükleme V2&apos;de gelecek.
          Her kalem için &ldquo;Detay Ekle&rdquo; (açıklama / tarih / hedef
          fiyat) ve &ldquo;Soru Ekle&rdquo; (teklif verenin cevaplaması zorunlu
          teknik soru) butonlarını kullanabilirsiniz.
        </p>
      </div>

      {itemsArrayError ? (
        <p className="text-sm text-danger-600">{itemsArrayError}</p>
      ) : null}

      <div className="space-y-3">
        {fields.map((field, idx) => (
          <ItemRow
            key={field.id}
            index={idx}
            canRemove={fields.length > 1}
            onRemove={() => remove(idx)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Toplam <strong>{fields.length}</strong> kalem · Maksimum{" "}
          {MAX_LISTING_ITEMS}
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleAdd}
          disabled={fields.length >= MAX_LISTING_ITEMS}
        >
          <Plus className="w-4 h-4" />
          Yeni Kalem Ekle
        </Button>
      </div>

      {/* V2-6 — Kategoriler: kalemlerden SONRA seçilir; kalem adlarından AI
          otomatik önerir (bağlayıcı değil, alan boşken tek sefer). */}
      <section className="border-t border-slate-200 pt-6">
        <Field error={errors.categoryIds?.message as string | undefined}>
          <div className="flex flex-wrap items-center gap-2">
            <Label required>Kategoriler</Label>
            {ai.loading ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                AI kalemlerinize göre kategori öneriyor…
              </span>
            ) : ai.applied ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">
                <Sparkles className="h-3 w-3" />
                AI önerisi — kontrol edin
              </span>
            ) : null}
          </div>
          <p className="mb-2 mt-1 text-xs text-slate-500">
            İhalenizin ürün/hizmet kategorileri {rol} eşleştirmesi ve
            raporlama için kullanılır. Kalemlerinize göre otomatik önerilir —
            dilediğiniz gibi değiştirebilirsiniz (en fazla 10).
          </p>
          <CategorySelectorButton
            value={categoryIds}
            onChange={(ids) => {
              ai.clearApplied();
              setCategoryIds(ids);
            }}
            mode="multi"
            maxSelection={10}
            placeholder="İhale kategorilerini seçin"
            modalTitle="İhale Kategorileri Seç"
            error={errors.categoryIds?.message as string | undefined}
          />
        </Field>
      </section>

      {/* Lojistik — seçilen kategori Nakliye/Depolama segmentindeyse açılır */}
      {isLogistics ? <LogisticsSection /> : null}
    </div>
  );
}

interface ItemRowProps {
  index: number;
  canRemove: boolean;
  onRemove: () => void;
}

function ItemRow({ index, canRemove, onRemove }: ItemRowProps) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<TenderFormData>();
  // SATIS + KALEM fiyatlandırma: kalem başına taban/hemen-al girişleri açılır.
  // Her iki useWatch KOŞULSUZ çağrılmalı — `&&` içinde kısa-devre edilirse
  // hook sırası render'lar arası değişir (rules-of-hooks; listingType SATIS↔
  // değişince React "fewer hooks" hatası verir).
  const listingType = useWatch({ control, name: "listingType" });
  const priceScope = useWatch({ control, name: "priceScope" });
  const isKalemPricing = listingType === "SATIS" && priceScope === "KALEM";

  const [detailOpen, setDetailOpen] = useState(false);
  const [questionOpen, setQuestionOpen] = useState(false);

  const description = useWatch({
    control,
    name: `items.${index}.description`,
  });
  const requiredByDate = useWatch({
    control,
    name: `items.${index}.requiredByDate`,
  });
  const targetUnitPrice = useWatch({
    control,
    name: `items.${index}.targetUnitPrice`,
  });
  const questions = useWatch({
    control,
    name: `items.${index}.questions`,
  });
  const questionCount = Array.isArray(questions) ? questions.length : 0;

  const hasDetails = !!(
    (description && description.trim()) ||
    (requiredByDate && requiredByDate.trim()) ||
    (typeof targetUnitPrice === "number" && !Number.isNaN(targetUnitPrice))
  );
  const hasQuestion = questionCount > 0;

  const itemErrors = errors.items?.[index];
  const detailHasError = !!(
    itemErrors?.description ??
    itemErrors?.requiredByDate ??
    itemErrors?.targetUnitPrice
  );
  const questionHasError = !!itemErrors?.questions;

  const rowHasError = Object.keys(itemErrors ?? {}).length > 0;

  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-4",
        rowHasError ? "border-danger-300" : "border-slate-200",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center text-xs font-semibold text-brand-700">
          {index + 1}
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3">
          <Field error={itemErrors?.name?.message} className="md:col-span-5">
            <Label htmlFor={`items.${index}.name`} required>
              Kalem Adı
            </Label>
            <Input
              id={`items.${index}.name`}
              placeholder="Örn. A4 fotokopi kağıdı"
              hasError={!!itemErrors?.name}
              {...register(`items.${index}.name`)}
            />
          </Field>

          <Field
            error={itemErrors?.quantity?.message}
            className="md:col-span-2"
          >
            <Label htmlFor={`items.${index}.quantity`} required>
              Miktar
            </Label>
            <Input
              id={`items.${index}.quantity`}
              type="number"
              min={0.0001}
              step="any"
              hasError={!!itemErrors?.quantity}
              {...register(`items.${index}.quantity`, {
                valueAsNumber: true,
              })}
            />
          </Field>

          <Field error={itemErrors?.unit?.message} className="md:col-span-2">
            <Label htmlFor={`items.${index}.unit`} required>
              Birim
            </Label>
            <Input
              id={`items.${index}.unit`}
              placeholder="adet"
              hasError={!!itemErrors?.unit}
              {...register(`items.${index}.unit`)}
            />
          </Field>

          <Field
            error={itemErrors?.materialCode?.message}
            className="md:col-span-3"
          >
            <Label htmlFor={`items.${index}.materialCode`}>Stok Kodu</Label>
            <Input
              id={`items.${index}.materialCode`}
              placeholder="—"
              hasError={!!itemErrors?.materialCode}
              {...register(`items.${index}.materialCode`)}
            />
          </Field>
        </div>

        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-danger-600 hover:bg-danger-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Kalemi sil"
          title={canRemove ? "Bu kalemi sil" : "En az 1 kalem olmalı"}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* SATIS + KALEM: kalem taban / hemen-al birim fiyatları */}
      {isKalemPricing ? (
        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-emerald-100 pt-3 pl-11 sm:grid-cols-2">
          <Field
            error={
              (errors.items?.[index] as Record<string, { message?: string }>)
                ?.minUnitPrice?.message
            }
          >
            <Label htmlFor={`items.${index}.minUnitPrice`} required>
              Taban Birim Fiyat
            </Label>
            <Input
              id={`items.${index}.minUnitPrice`}
              type="number"
              min={0}
              step="0.01"
              placeholder="0.00"
              {...register(`items.${index}.minUnitPrice`, {
                setValueAs: (v) =>
                  v === "" || v == null ? undefined : Number(v),
              })}
            />
          </Field>
          <Field
            error={
              (errors.items?.[index] as Record<string, { message?: string }>)
                ?.buyNowUnitPrice?.message
            }
            hint="Boş bırakılabilir — verilirse alıcı bu kalemi anında bu fiyattan alabilir."
          >
            <Label htmlFor={`items.${index}.buyNowUnitPrice`}>
              Hemen-Al Birim Fiyatı
            </Label>
            <Input
              id={`items.${index}.buyNowUnitPrice`}
              type="number"
              min={0}
              step="0.01"
              placeholder="—"
              {...register(`items.${index}.buyNowUnitPrice`, {
                setValueAs: (v) =>
                  v === "" || v == null ? undefined : Number(v),
              })}
            />
          </Field>
        </div>
      ) : null}

      {/* 2 ayrı buton + chip özeti */}
      <div className="mt-3 pt-3 border-t border-slate-100 pl-11 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition border",
            hasDetails
              ? "bg-brand-50 text-brand-700 border-brand-200 hover:bg-brand-100"
              : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100",
            detailHasError && "ring-1 ring-danger-300",
          )}
        >
          <FileText className="w-3.5 h-3.5" />
          {hasDetails ? "Detayı Düzenle" : "Detay Ekle"}
          {hasDetails ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-success-600 ml-0.5" />
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => setQuestionOpen(true)}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition border",
            hasQuestion
              ? "bg-warning-50 text-warning-700 border-warning-200 hover:bg-warning-100"
              : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100",
            questionHasError && "ring-1 ring-danger-300",
          )}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          {hasQuestion ? `Sorular (${questionCount})` : "Soru Ekle"}
          {hasQuestion ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-success-600 ml-0.5" />
          ) : null}
        </button>

        {hasDetails && description && description.trim() ? (
          <span
            className="text-xs text-slate-500 italic truncate max-w-xs"
            title={description}
          >
            “{description}”
          </span>
        ) : null}
      </div>

      <ItemDetailModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        index={index}
      />
      <ItemQuestionModal
        open={questionOpen}
        onClose={() => setQuestionOpen(false)}
        index={index}
      />
    </div>
  );
}
