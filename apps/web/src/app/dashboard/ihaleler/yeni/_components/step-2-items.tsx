"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  FileText,
  HelpCircle,
  Info,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
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

  const handleAdd = () => {
    if (fields.length >= 100) return;
    append({
      name: "",
      description: "",
      quantity: 1,
      unit: "adet",
      materialCode: "",
      requiredByDate: "",
      targetUnitPrice: undefined,
      customQuestion: "",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 p-3 rounded-lg bg-brand-50/40 border border-brand-100 text-xs text-slate-600">
        <Info className="w-4 h-4 text-brand-600 mt-0.5 flex-shrink-0" />
        <p>
          Kalemleri tek tek ekleyin. Excel toplu yükleme V2&apos;de gelecek.
          Her kalem için &ldquo;Detay Ekle&rdquo; (açıklama / tarih / hedef
          fiyat) ve &ldquo;Soru Ekle&rdquo; (tedarikçinin cevaplaması zorunlu
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
          Toplam <strong>{fields.length}</strong> kalem · Maksimum 100
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleAdd}
          disabled={fields.length >= 100}
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
  const customQuestion = useWatch({
    control,
    name: `items.${index}.customQuestion`,
  });

  const hasDetails = !!(
    (description && description.trim()) ||
    (requiredByDate && requiredByDate.trim()) ||
    (typeof targetUnitPrice === "number" && !Number.isNaN(targetUnitPrice))
  );
  const hasQuestion = !!(customQuestion && customQuestion.trim());

  const itemErrors = errors.items?.[index];
  const detailHasError = !!(
    itemErrors?.description ??
    itemErrors?.requiredByDate ??
    itemErrors?.targetUnitPrice
  );
  const questionHasError = !!itemErrors?.customQuestion;

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
          {hasQuestion ? "Soruyu Düzenle" : "Soru Ekle"}
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
