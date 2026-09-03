"use client";

import { entityLabels } from "@/lib/company/terms";

import { Radio, RadioGroup } from "@/components/catalyst/radio";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_LISTING_ITEMS,
  type TenderFormData,
} from "@/lib/tenders/form-schema";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  FileText,
  HelpCircle,
  Plus,
  Trash2, PackageSearch, ChevronRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet } from "lucide-react";
import { ExcelImportDialog } from "@/components/tenders/excel-import/excel-import-dialog";
import type { ItemImportItem } from "@rothern/shared";
import { MoneyInputNumber } from "@/components/ui/money-input";
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { ItemDetailModal } from "./item-detail-modal";
import { ItemQuestionModal } from "./item-question-modal";
import { UnitSelect } from "@/components/ui/unit-select";
import {
  CatalogPickerDialog,
  type PickedCatalogItem,
} from "@/components/tenders/wizard/catalog-picker-dialog";
import { Textarea } from "@/components/catalyst/textarea";

export function Step2Items() {
  const {
    control,
    getValues,
    formState: { errors },
  } = useFormContext<TenderFormData>();
  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "items",
  });
  const [excelOpen, setExcelOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const itemsArrayError = errors.items?.message ?? errors.items?.root?.message;

  // SATIS: fiyatlandırma kapsamı (TOPLU/KALEM) kalemlerle birlikte seçilir —
  // KALEM seçilirse her kalem satırında taban/hemen-al girişleri açılır.
  const stepListingType = useWatch({ control, name: "listingType" });
  const isSatisStep = stepListingType === "SATIS";
  const L = entityLabels(isSatisStep);
  const stepPriceScope = useWatch({ control, name: "priceScope" });
  // Denetim 2026-08-26 Parça 10 #7: burada `useWatch({ name: "items" })`
  // vardı. RHF ad-önekiyle abone olduğu için `items.7.quantity` değişimi bu
  // izleyiciyi de tetikliyor → HER TUŞ VURUŞU tüm kalem satırlarını yeniden
  // çiziyordu (100 kalemde ~5.000 element; tavan MAX_LISTING_ITEMS=500).
  // Değer render'da HİÇ kullanılmıyordu; tek tüketicisi aşağıdaki callback →
  // aboneliksiz `getValues` yeterli.

  // Excel ile İçe Aktar (2026-08-22, AI yok): önizlemeden geçen kalemler forma
  // girer — "ekle" modunda formdaki tek BOŞ satır (ad girilmemiş) ezilir ki
  // kullanıcı boş kalem silmek zorunda kalmasın. Tavan MAX_LISTING_ITEMS.
  const applyImported = (items: ItemImportItem[], mode: "append" | "replace") => {
    const mapped = items.map((it) => ({
      name: it.name ?? "",
      description: it.description ?? "",
      quantity: it.quantity ?? 1,
      unit: it.unit ?? "adet",
      unitCode: it.unitCode ?? null,
      materialCode: it.materialCode ?? "",
      requiredByDate: it.requiredByDate ?? "",
      targetUnitPrice: it.targetUnitPrice ?? undefined,
      minUnitPrice: it.minUnitPrice ?? undefined,
      buyNowUnitPrice: it.buyNowUnitPrice ?? undefined,
      customQuestion: "",
      questions: [],
    }));
    const existing = (getValues("items") ?? []) as TenderFormData["items"];
    const keep =
      mode === "replace"
        ? []
        : existing.filter((it, i) => !(existing.length === 1 && i === 0 && !it.name?.trim()));
    const next = [...keep, ...mapped].slice(0, MAX_LISTING_ITEMS);
    replace(next as TenderFormData["items"]);
    const dropped = keep.length + mapped.length - next.length;
    if (dropped > 0) {
      toast.warning(`${dropped} kalem tavan nedeniyle eklenmedi (en fazla ${MAX_LISTING_ITEMS})`);
    } else {
      toast.success(`${mapped.length} kalem aktarıldı`);
    }
  };

  /**
   * Katalogdan seçilenleri forma ekler (Faz 2). Excel içe aktarma yoluyla AYNI
   * `applyImported` mantığı kullanılır — boş satırı ezme, tavan uyarısı ve
   * "kaç kalem eklendi" bildirimi tek yerde kalsın diye.
   *
   * KOPYALAMA: katalog id'si forma TAŞINMAZ. Katalogdaki sonraki bir düzeltme
   * yayınlanmış ihaleyi geriye dönük değiştirmemeli (FK yok, snapshot var).
   */
  const applyCatalog = (picked: PickedCatalogItem[]) => {
    applyImported(
      picked.map((p) => ({
        name: p.name,
        description: p.description,
        quantity: p.quantity,
        unit: p.unit,
        unitCode: p.unitCode,
        materialCode: p.materialCode,
        requiredByDate: null,
        targetUnitPrice: p.targetPrice,
        minUnitPrice: null,
        buyNowUnitPrice: null,
      })),
      "append",
    );
  };

  const handleAdd = () => {
    if (fields.length >= MAX_LISTING_ITEMS) return;
    append({
      name: "",
      description: "",
      quantity: 1,
      unit: "adet",
      unitCode: "PCE",
      materialCode: "",
      requiredByDate: "",
      targetUnitPrice: undefined,
      customQuestion: "",
      questions: [],
    });
  };

  return (
    <div className="space-y-6">
      {isSatisStep ? (
        <Field className="rounded-xl border border-slate-200 p-4">
          <Label required>Fiyatlandırma</Label>
          <p className="mb-3 mt-0.5 text-xs text-slate-500">
            Kalem Bazlı seçerseniz her kalemin üzerinde taban / hemen-al birim
            fiyatı girersiniz; Toplu&apos;da {L.shortLower} geneli tek fiyat Genel Bilgi
            adımında sorulur.
          </p>
          <Controller
            control={control}
            name="priceScope"
            render={({ field }) => (
              <RadioGroup
                value={field.value ?? "TOPLU"}
                onChange={field.onChange}
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                <div className="flex items-start gap-3 rounded-lg p-3 ring-1 ring-zinc-950/10 transition-colors has-data-checked:bg-zinc-50 has-data-checked:ring-2 has-data-checked:ring-zinc-900">
                  <Radio value="TOPLU" aria-label="Toplu fiyat" className="mt-0.5" />
                  <p className="text-sm font-semibold text-zinc-900">
                    Toplu
                    <span className="block text-xs font-normal text-zinc-500">
                      {L.entityShort} geneli tek taban + tek hemen-al fiyatı.
                    </span>
                  </p>
                </div>
                <div className="flex items-start gap-3 rounded-lg p-3 ring-1 ring-zinc-950/10 transition-colors has-data-checked:bg-zinc-50 has-data-checked:ring-2 has-data-checked:ring-zinc-900">
                  <Radio
                    value="KALEM"
                    aria-label="Kalem bazlı fiyat"
                    className="mt-0.5"
                  />
                  <p className="text-sm font-semibold text-zinc-900">
                    Kalem Bazlı
                    <span className="block text-xs font-normal text-zinc-500">
                      Her kaleme ayrı taban + hemen-al birim fiyatı (aşağıda
                      girilir).
                    </span>
                  </p>
                </div>
              </RadioGroup>
            )}
          />
        </Field>
      ) : null}

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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Toplam <strong>{fields.length}</strong> kalem · Maksimum{" "}
          {MAX_LISTING_ITEMS}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setCatalogOpen(true)}
            disabled={fields.length >= MAX_LISTING_ITEMS}
          >
            <PackageSearch className="w-4 h-4" />
            Katalogdan Ekle
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setExcelOpen(true)}
            disabled={fields.length >= MAX_LISTING_ITEMS}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel ile İçe Aktar
          </Button>
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
      </div>

      <ExcelImportDialog
        open={excelOpen}
        onClose={() => setExcelOpen(false)}
        scope={{
          listingType: isSatisStep ? "SATIS" : "ALIM",
          priceScope: isSatisStep ? (stepPriceScope ?? "TOPLU") : undefined,
        }}
        existingCount={fields.length}
        onApply={applyImported}
      />
      <CatalogPickerDialog
        isSatis={isSatisStep}
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onPick={applyCatalog}
      />
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
    setValue,
    formState: { errors },
  } = useFormContext<TenderFormData>();
  // Faz 1: birim seçici kontrollü — `useWatch` ile okunur (P10 perf notu:
  // `watch()` tüm formu dinler, `useWatch` yalnız bu iki alanı).
  const unitValue = useWatch({ control, name: `items.${index}.unit` });
  const unitCodeValue = useWatch({ control, name: `items.${index}.unitCode` });
  // GTİP alanı yalnız uluslararası ilanda görünür (Faz 3 kararı).
  const isInternational = useWatch({ control, name: "isInternational" });
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
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-xs font-semibold text-brand-700">
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
            {/* Faz 1: serbest metin yerine SEÇİM. `unit` (okunur metin) ve
                `unitCode` (kanonik) birlikte yazılır; "listede yok" seçilirse
                kod null kalır ve kullanıcı engellenmez. */}
            <UnitSelect
              id={`items.${index}.unit`}
              value={unitValue ?? ""}
              unitCode={unitCodeValue ?? null}
              hasError={!!itemErrors?.unit}
              onChange={(next) => {
                setValue(`items.${index}.unit`, next.unit, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                setValue(`items.${index}.unitCode`, next.unitCode, {
                  shouldDirty: true,
                });
              }}
            />
          </Field>

          <Field
            error={itemErrors?.materialCode?.message}
            className="md:col-span-3"
          >
            <Label htmlFor={`items.${index}.materialCode`}>Stok Kodu</Label>
            <Input
              id={`items.${index}.materialCode`}
              placeholder="örn. STK-00123"
              hasError={!!itemErrors?.materialCode}
              {...register(`items.${index}.materialCode`)}
            />
          </Field>
        </div>

        {/* Faz 3 — kalem detayları. KATLANIR: varsayılan görünüm bugünkü kadar
            sade kalsın diye altı yeni alan buraya alındı. Kullanıcı ihtiyaç
            duyduğunda açar; çoğu kalemde hiç açılmayacak. */}
        <details className="group mt-3 rounded-lg border border-zinc-950/10 bg-zinc-50/50">
          <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-zinc-700 hover:text-zinc-900">
            <span className="inline-flex items-center gap-1.5">
              <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
              Detaylar
              <span className="text-xs font-normal text-zinc-500">
                (marka, muadil, şartname, garanti)
              </span>
            </span>
          </summary>
          <div className="grid grid-cols-1 gap-3 border-t border-zinc-950/5 px-3 py-3 md:grid-cols-6">
            <Field error={itemErrors?.brand?.message} className="md:col-span-3">
              <Label htmlFor={`items.${index}.brand`}>Marka</Label>
              <Input
                id={`items.${index}.brand`}
                placeholder="örn. SKF"
                hasError={!!itemErrors?.brand}
                {...register(`items.${index}.brand`)}
              />
            </Field>
            <Field error={itemErrors?.mpn?.message} className="md:col-span-3">
              <Label htmlFor={`items.${index}.mpn`}>Üretici Parça No</Label>
              <Input
                id={`items.${index}.mpn`}
                placeholder="örn. 6204-2RS"
                hasError={!!itemErrors?.mpn}
                {...register(`items.${index}.mpn`)}
              />
            </Field>

            <Field className="md:col-span-6">
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 rounded border-zinc-300"
                  {...register(`items.${index}.alternativeAllowed`)}
                />
                <span className="text-sm">
                  <span className="font-medium text-zinc-800">
                    Muadil (eşdeğer) ürün teklif edilebilir
                  </span>
                  <span className="block text-xs text-zinc-500">
                    Kapatırsanız tedarikçiler yalnız belirttiğiniz markayı
                    teklif edebilir. Açıkken teklif verirken hangi markayı
                    önerdiklerini belirtirler.
                  </span>
                </span>
              </label>
            </Field>

            <Field
              error={itemErrors?.specification?.message}
              className="md:col-span-6"
            >
              <Label htmlFor={`items.${index}.specification`}>
                Teknik Şartname
              </Label>
              <Textarea
                id={`items.${index}.specification`}
                rows={3}
                placeholder="Standart, tolerans, malzeme kalitesi…"
                {...register(`items.${index}.specification`)}
              />
            </Field>

            <Field
              error={itemErrors?.warrantyMonths?.message}
              className="md:col-span-3"
            >
              <Label htmlFor={`items.${index}.warrantyMonths`}>
                Garanti (ay)
              </Label>
              <Input
                id={`items.${index}.warrantyMonths`}
                type="number"
                min={0}
                max={600}
                placeholder="örn. 24"
                hasError={!!itemErrors?.warrantyMonths}
                {...register(`items.${index}.warrantyMonths`, {
                  setValueAs: (v: string) =>
                    v === "" ? undefined : Number(v),
                })}
              />
            </Field>

            {/* GTİP yalnız uluslararası ilanda anlamlı — aksi hâlde gereksiz
                alan gösterip formu ağırlaştırmayalım. */}
            {isInternational ? (
              <Field
                error={itemErrors?.hsCode?.message}
                className="md:col-span-3"
              >
                <Label htmlFor={`items.${index}.hsCode`}>GTİP / HS Kodu</Label>
                <Input
                  id={`items.${index}.hsCode`}
                  placeholder="örn. 8482.10"
                  hasError={!!itemErrors?.hsCode}
                  {...register(`items.${index}.hsCode`)}
                />
              </Field>
            ) : null}
          </div>
        </details>

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
            <Controller
              control={control}
              name={`items.${index}.minUnitPrice`}
              render={({ field }) => (
                <MoneyInputNumber
                  id={`items.${index}.minUnitPrice`}
                  placeholder="0,00"
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
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
              Hemen Al Birim Fiyatı
            </Label>
            <Controller
              control={control}
              name={`items.${index}.buyNowUnitPrice`}
              render={({ field }) => (
                <MoneyInputNumber
                  id={`items.${index}.buyNowUnitPrice`}
                  placeholder=""
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
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
            "inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition border",
            hasDetails
              ? "bg-zinc-100 text-zinc-900 border-zinc-300 hover:bg-zinc-200/70"
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
            "inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition border",
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
