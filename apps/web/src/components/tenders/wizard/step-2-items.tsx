"use client";

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
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { MoneyInputNumber } from "@/components/ui/money-input";
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { ItemDetailModal } from "./item-detail-modal";
import { ItemQuestionModal } from "./item-question-modal";

export function Step2Items() {
  const {
    control,
    formState: { errors },
  } = useFormContext<TenderFormData>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  const itemsArrayError = errors.items?.message ?? errors.items?.root?.message;

  // SATIS: fiyatlandırma kapsamı (TOPLU/KALEM) kalemlerle birlikte seçilir —
  // KALEM seçilirse her kalem satırında taban/hemen-al girişleri açılır.
  const stepListingType = useWatch({ control, name: "listingType" });
  const isSatisStep = stepListingType === "SATIS";

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
      {isSatisStep ? (
        <Field className="rounded-xl border border-slate-200 p-4">
          <Label required>Fiyatlandırma</Label>
          <p className="mb-3 mt-0.5 text-xs text-slate-500">
            Kalem Bazlı seçerseniz her kalemin üzerinde taban / hemen-al birim
            fiyatı girersiniz; Toplu&apos;da ihale geneli tek fiyat Genel Bilgi
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
                      İhale geneli tek taban + tek hemen-al fiyatı.
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
              Hemen-Al Birim Fiyatı
            </Label>
            <Controller
              control={control}
              name={`items.${index}.buyNowUnitPrice`}
              render={({ field }) => (
                <MoneyInputNumber
                  id={`items.${index}.buyNowUnitPrice`}
                  placeholder="—"
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
