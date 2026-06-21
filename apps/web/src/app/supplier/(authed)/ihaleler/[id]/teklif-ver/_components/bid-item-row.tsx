"use client";

import { Field } from "@/components/ui/field";
import { Select } from "@/components/catalyst/select";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BidFormValues } from "@/lib/tenders/bid-form-schema";
import { CURRENCY_SYMBOL } from "@/lib/tenders/labels";
import type { Currency, SupplierTenderItem } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import { HelpCircle, X } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";

interface Props {
  index: number;
  tenderItem: SupplierTenderItem;
  currency: Currency;
}

function formatMoney(value: number, currency: Currency): string {
  try {
    return value.toLocaleString("tr-TR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function BidItemRow({ index, tenderItem, currency }: Props) {
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = useFormContext<BidFormValues>();

  const unitPrice = useWatch({
    control,
    name: `items.${index}.unitPrice`,
  });

  const questions = tenderItem.questions ?? [];
  const itemErrors = errors.items?.[index];
  const hasOffer =
    typeof unitPrice === "number" && !Number.isNaN(unitPrice) && unitPrice >= 0;
  const totalPrice = hasOffer
    ? (unitPrice ?? 0) * Number(tenderItem.quantity)
    : 0;

  return (
    <div
      className={cn(
        "border rounded-xl p-4 bg-white transition-colors",
        hasOffer
          ? "border-zinc-200 ring-1 ring-zinc-100"
          : "border-slate-200",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-zinc-50 flex items-center justify-center text-xs font-semibold text-zinc-700 mt-1">
          {index + 1}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-zinc-900">{tenderItem.name}</p>
          {tenderItem.description ? (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
              {tenderItem.description}
            </p>
          ) : null}
          <p className="text-xs text-slate-500 mt-1">
            <strong className="text-zinc-900">
              {Number(tenderItem.quantity).toLocaleString("tr-TR")}
            </strong>{" "}
            {tenderItem.unit}
            {tenderItem.materialCode ? (
              <span className="ml-2 font-mono text-slate-400">
                · {tenderItem.materialCode}
              </span>
            ) : null}
          </p>
          {tenderItem.targetUnitPrice ? (
            <p className="text-xs text-zinc-700 mt-1.5 font-medium">
              Hedef:{" "}
              <span className="tabular-nums">
                {Number(tenderItem.targetUnitPrice).toLocaleString("tr-TR")}{" "}
                {CURRENCY_SYMBOL[currency]} / {tenderItem.unit}
              </span>
            </p>
          ) : null}
        </div>

        <div className="flex-shrink-0 w-40">
          <Field error={itemErrors?.unitPrice?.message}>
            <Label htmlFor={`bid-item-${index}-price`}>Birim Fiyat</Label>
            <div className="relative">
              <Input
                id={`bid-item-${index}-price`}
                type="number"
                step="any"
                min={0}
                placeholder="—"
                hasError={!!itemErrors?.unitPrice}
                {...register(`items.${index}.unitPrice`, {
                  setValueAs: (v) =>
                    v === "" || v === undefined || v === null
                      ? null
                      : Number(v),
                })}
                className="pr-12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">
                {CURRENCY_SYMBOL[currency]} {currency}
              </span>
            </div>
          </Field>
        </div>

        <div className="flex-shrink-0 w-40 text-right">
          <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
            Toplam
          </p>
          <p className="text-base font-bold text-zinc-900 tabular-nums mt-1">
            {hasOffer ? formatMoney(totalPrice, currency) : "—"}
          </p>
        </div>

        <div className="flex-shrink-0 w-9 flex justify-end pt-7">
          {hasOffer ? (
            <IconButton
              tone="danger"
              onClick={() =>
                setValue(`items.${index}.unitPrice`, null, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              title="Bu kaleme teklif verme"
              aria-label="Bu kaleme teklif verme"
            >
              <X className="h-4 w-4" />
            </IconButton>
          ) : null}
        </div>
      </div>

      {/* Kalem soruları — çoklu + tipli (V2-7+). Legacy tek soru fallback. */}
      {questions.length > 0 ? (
        <div
          className={cn(
            "mt-3 pt-3 border-t space-y-3",
            hasOffer ? "border-warning-200" : "border-slate-100",
          )}
        >
          <div className="flex items-center gap-2">
            <HelpCircle
              className={cn(
                "h-4 w-4",
                hasOffer ? "text-warning-600" : "text-slate-400",
              )}
            />
            <p
              className={cn(
                "text-xs font-semibold uppercase tracking-wide",
                hasOffer ? "text-warning-800" : "text-slate-500",
              )}
            >
              Kalem Soruları ({questions.length})
            </p>
          </div>
          {hasOffer ? (
            questions.map((q, qi) => (
              <div key={q.id} className="ml-6">
                <Label htmlFor={`bid-${index}-ans-${qi}`}>
                  {q.text}
                  {q.required ? (
                    <span className="text-danger-600 ml-0.5">*</span>
                  ) : null}
                </Label>
                {/* questionId form state'inde tutulur */}
                <input
                  type="hidden"
                  {...register(`items.${index}.answers.${qi}.questionId`)}
                />
                <AnswerInput
                  id={`bid-${index}-ans-${qi}`}
                  answerType={q.answerType}
                  registerProps={register(
                    `items.${index}.answers.${qi}.value`,
                  )}
                />
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500 italic ml-6">
              Bu kaleme teklif verirseniz sorular aktif olur.
            </p>
          )}
        </div>
      ) : tenderItem.customQuestion ? (
        <div
          className={cn(
            "mt-3 pt-3 border-t",
            hasOffer ? "border-warning-200" : "border-slate-100",
          )}
        >
          <div className="flex items-start gap-2 mb-2">
            <HelpCircle
              className={cn(
                "h-4 w-4 flex-shrink-0 mt-0.5",
                hasOffer ? "text-warning-600" : "text-slate-400",
              )}
            />
            <div className="flex-1">
              <p
                className={cn(
                  "text-xs font-semibold uppercase tracking-wide",
                  hasOffer ? "text-warning-800" : "text-slate-500",
                )}
              >
                Kalem Sorusu
              </p>
              <p className="text-sm text-slate-700 mt-0.5">
                {tenderItem.customQuestion}
              </p>
            </div>
          </div>
          {hasOffer ? (
            <Field
              error={itemErrors?.customAnswer?.message}
              hint="Cevap zorunlu — teklif gönderilirken kontrol edilir."
            >
              <Textarea
                rows={2}
                maxLength={2000}
                placeholder="Cevabınızı yazın…"
                hasError={!!itemErrors?.customAnswer}
                {...register(`items.${index}.customAnswer`)}
              />
            </Field>
          ) : (
            <p className="text-xs text-slate-500 italic ml-6">
              Bu kaleme teklif verirseniz cevap zorunlu olur.
            </p>
          )}
        </div>
      ) : !hasOffer ? (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-500 italic ml-11">
            Bu kaleme teklif vermiyorum. Birim fiyat girince aktif olur.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function AnswerInput({
  id,
  answerType,
  registerProps,
}: {
  id: string;
  answerType: string;
  registerProps: ReturnType<ReturnType<typeof useFormContext>["register"]>;
}) {
  if (answerType === "NUMBER") {
    return <Input id={id} type="number" step="any" {...registerProps} />;
  }
  if (answerType === "DATE") {
    return <Input id={id} type="date" {...registerProps} />;
  }
  if (answerType === "YES_NO") {
    return (
      <Select id={id} {...registerProps}>
        <option value="">Seçin…</option>
        <option value="Evet">Evet</option>
        <option value="Hayır">Hayır</option>
      </Select>
    );
  }
  return (
    <Textarea id={id} rows={2} maxLength={2000} placeholder="Cevabınızı yazın…" {...registerProps} />
  );
}
