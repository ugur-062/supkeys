"use client";

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import { FileText } from "lucide-react";
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
    <Dialog open={open} onClose={onClose} size="lg">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
          <FileText className="h-5 w-5 text-zinc-700" />
        </div>
        <div className="min-w-0">
          <DialogTitle>Kalem {index + 1} Detayları</DialogTitle>
          <DialogDescription>
            Tedarikçilere göstereceğiniz ek bilgiler ve dahili notlar.
          </DialogDescription>
        </div>
      </div>

      <DialogBody className="space-y-4">
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
          <Field error={itemErrors?.targetUnitPrice?.message}>
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
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose}>
          Vazgeç
        </Button>
        <Button onClick={onClose}>Kaydet</Button>
      </DialogActions>
    </Dialog>
  );
}
