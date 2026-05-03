"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Info,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

export function Step2Items() {
  const {
    register,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<TenderFormData>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const itemsArrayError = errors.items?.message ?? errors.items?.root?.message;

  const items = watch("items");

  const toggleRow = (idx: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

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
          &quot;Kalem Sorusu&quot; eklerseniz tedarikçi teklif verirken cevaplamak
          zorunda kalır (örn. &quot;Garanti süresi nedir?&quot;).
        </p>
      </div>

      {itemsArrayError ? (
        <p className="text-sm text-danger-600">{itemsArrayError}</p>
      ) : null}

      <div className="space-y-3">
        {fields.map((field, idx) => {
          const isExpanded = expandedRows.has(idx);
          const item = items?.[idx];
          const itemErrors = errors.items?.[idx];
          const hasQuestion = !!item?.customQuestion?.trim();

          return (
            <div
              key={field.id}
              className={cn(
                "rounded-xl border bg-white p-4",
                Object.keys(itemErrors ?? {}).length > 0
                  ? "border-danger-300"
                  : "border-slate-200",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center text-xs font-semibold text-brand-700">
                  {idx + 1}
                </div>

                <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3">
                  <Field
                    error={itemErrors?.name?.message}
                    className="md:col-span-5"
                  >
                    <Label htmlFor={`items.${idx}.name`} required>
                      Kalem Adı
                    </Label>
                    <Input
                      id={`items.${idx}.name`}
                      placeholder="Örn. A4 fotokopi kağıdı"
                      hasError={!!itemErrors?.name}
                      {...register(`items.${idx}.name`)}
                    />
                  </Field>

                  <Field
                    error={itemErrors?.quantity?.message}
                    className="md:col-span-2"
                  >
                    <Label htmlFor={`items.${idx}.quantity`} required>
                      Miktar
                    </Label>
                    <Input
                      id={`items.${idx}.quantity`}
                      type="number"
                      min={0.0001}
                      step="any"
                      hasError={!!itemErrors?.quantity}
                      {...register(`items.${idx}.quantity`, {
                        valueAsNumber: true,
                      })}
                    />
                  </Field>

                  <Field
                    error={itemErrors?.unit?.message}
                    className="md:col-span-2"
                  >
                    <Label htmlFor={`items.${idx}.unit`} required>
                      Birim
                    </Label>
                    <Input
                      id={`items.${idx}.unit`}
                      placeholder="adet"
                      hasError={!!itemErrors?.unit}
                      {...register(`items.${idx}.unit`)}
                    />
                  </Field>

                  <Field
                    error={itemErrors?.materialCode?.message}
                    className="md:col-span-3"
                  >
                    <Label htmlFor={`items.${idx}.materialCode`}>
                      Stok Kodu
                    </Label>
                    <Input
                      id={`items.${idx}.materialCode`}
                      placeholder="—"
                      hasError={!!itemErrors?.materialCode}
                      {...register(`items.${idx}.materialCode`)}
                    />
                  </Field>
                </div>

                <button
                  type="button"
                  onClick={() => remove(idx)}
                  disabled={fields.length === 1}
                  className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-danger-600 hover:bg-danger-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Kalemi sil"
                  title={
                    fields.length === 1
                      ? "En az 1 kalem olmalı"
                      : "Bu kalemi sil"
                  }
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Detay/Soru göstergeleri */}
              <div className="flex items-center gap-3 mt-3 pl-11 flex-wrap">
                <button
                  type="button"
                  onClick={() => toggleRow(idx)}
                  className="text-xs text-brand-700 hover:text-brand-900 inline-flex items-center gap-1"
                >
                  {isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  {isExpanded ? "Detayları Gizle" : "Detay & Soru Ekle"}
                </button>
                {hasQuestion ? (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-warning-50 text-warning-700 inline-flex items-center gap-1">
                    <HelpCircle className="w-3 h-3" />
                    Soru var
                  </span>
                ) : null}
              </div>

              {/* Detay alanı */}
              {isExpanded ? (
                <div className="mt-4 pl-11 space-y-3 pt-3 border-t border-slate-100">
                  <Field error={itemErrors?.description?.message}>
                    <Label htmlFor={`items.${idx}.description`}>
                      Açıklama / Spesifikasyon
                    </Label>
                    <Textarea
                      id={`items.${idx}.description`}
                      rows={2}
                      placeholder="Marka, model, kalite gereksinimleri…"
                      hasError={!!itemErrors?.description}
                      {...register(`items.${idx}.description`)}
                    />
                  </Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field error={itemErrors?.requiredByDate?.message}>
                      <Label htmlFor={`items.${idx}.requiredByDate`}>
                        Gereksinim Tarihi
                      </Label>
                      <Input
                        id={`items.${idx}.requiredByDate`}
                        type="date"
                        hasError={!!itemErrors?.requiredByDate}
                        {...register(`items.${idx}.requiredByDate`)}
                      />
                    </Field>
                    <Field
                      error={itemErrors?.targetUnitPrice?.message}
                      hint="Tedarikçiye gösterilmez, dahili kullanım."
                    >
                      <Label htmlFor={`items.${idx}.targetUnitPrice`}>
                        Hedef Birim Fiyat
                      </Label>
                      <Input
                        id={`items.${idx}.targetUnitPrice`}
                        type="number"
                        min={0}
                        step="any"
                        placeholder="—"
                        hasError={!!itemErrors?.targetUnitPrice}
                        {...register(`items.${idx}.targetUnitPrice`, {
                          setValueAs: (v) =>
                            v === "" || v === undefined ? undefined : Number(v),
                        })}
                      />
                    </Field>
                  </div>

                  <Field
                    error={itemErrors?.customQuestion?.message}
                    hint="Tedarikçi teklif verirken cevaplamak zorunda kalır."
                  >
                    <Label htmlFor={`items.${idx}.customQuestion`}>
                      Kalem Sorusu (opsiyonel)
                    </Label>
                    <Textarea
                      id={`items.${idx}.customQuestion`}
                      rows={2}
                      placeholder="Örn. Garanti süresi nedir? Üretim yılı? Menşei?"
                      hasError={!!itemErrors?.customQuestion}
                      {...register(`items.${idx}.customQuestion`)}
                    />
                    {hasQuestion ? (
                      <button
                        type="button"
                        onClick={() => setValue(`items.${idx}.customQuestion`, "")}
                        className="text-xs text-slate-500 hover:text-danger-600 mt-1"
                      >
                        Soruyu kaldır
                      </button>
                    ) : null}
                  </Field>
                </div>
              ) : null}
            </div>
          );
        })}
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
