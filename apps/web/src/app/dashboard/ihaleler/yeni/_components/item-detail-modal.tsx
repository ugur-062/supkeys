"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { FileText, X } from "lucide-react";
import { useFormContext } from "react-hook-form";

interface Props {
  open: boolean;
  onClose: () => void;
  index: number;
}

export function ItemDetailModal({ open, onClose, index }: Props) {
  const {
    register,
    formState: { errors },
  } = useFormContext<TenderFormData>();

  const itemErrors = errors.items?.[index];

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 z-[60]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]",
            "w-[calc(100vw-2rem)] max-w-lg bg-white rounded-2xl shadow-2xl outline-none",
          )}
        >
          <header className="px-5 py-4 border-b border-surface-border flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-brand-600" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  Kalem {index + 1} Detayları
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500 mt-0.5">
                  Tedarikçilere göstereceğiniz ek bilgiler ve dahili notlar.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Kapat"
                className="p-1.5 rounded-lg hover:bg-surface-muted text-slate-400 hover:text-slate-600 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </header>

          <div className="px-5 py-5 space-y-4">
            <Field
              error={itemErrors?.description?.message}
              hint="Tedarikçiye gösterilir."
            >
              <Label htmlFor={`detail-description-${index}`}>
                Açıklama / Spesifikasyon
              </Label>
              <Textarea
                id={`detail-description-${index}`}
                rows={4}
                maxLength={2000}
                placeholder="Marka, model, kalite gereksinimleri, teknik özellikler…"
                hasError={!!itemErrors?.description}
                {...register(`items.${index}.description`)}
              />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field
                error={itemErrors?.requiredByDate?.message}
                hint="Tedarikçiye gösterilir."
              >
                <Label htmlFor={`detail-requiredByDate-${index}`}>
                  Gereksinim Tarihi
                </Label>
                <Input
                  id={`detail-requiredByDate-${index}`}
                  type="date"
                  hasError={!!itemErrors?.requiredByDate}
                  {...register(`items.${index}.requiredByDate`)}
                />
              </Field>
              <Field
                error={itemErrors?.targetUnitPrice?.message}
                hint="Tedarikçiye gösterilmez (dahili)."
              >
                <Label htmlFor={`detail-targetUnitPrice-${index}`}>
                  Hedef Birim Fiyat
                </Label>
                <Input
                  id={`detail-targetUnitPrice-${index}`}
                  type="number"
                  min={0}
                  step="any"
                  placeholder="—"
                  hasError={!!itemErrors?.targetUnitPrice}
                  {...register(`items.${index}.targetUnitPrice`, {
                    setValueAs: (v) =>
                      v === "" || v === undefined ? undefined : Number(v),
                  })}
                />
              </Field>
            </div>
          </div>

          <footer className="px-5 py-4 border-t border-surface-border flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Vazgeç
            </Button>
            <Button type="button" variant="primary" onClick={onClose}>
              Kaydet
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
