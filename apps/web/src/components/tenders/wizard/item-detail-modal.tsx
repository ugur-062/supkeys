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
import { MoneyInputNumber } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import { FileText } from "lucide-react";
import { useEffect, useRef } from "react";
import { Controller, useFormContext } from "react-hook-form";

interface Props {
  open: boolean;
  onClose: () => void;
  index: number;
}

export function ItemDetailModal({ open, onClose, index }: Props) {
  const {
    register,
    getValues,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext<TenderFormData>();
  const isSatis = watch("listingType") === "SATIS";
  const showTarget = watch("showTargetToSuppliers");

  const itemErrors = errors.items?.[index];

  // Modal açıldığında düzenlenebilir alanların anlık görüntüsünü al; "Vazgeç"
  // bu değerlere geri döner (alanlar doğrudan RHF'ye bağlı olduğundan).
  const snapshot = useRef<{
    description?: string;
    requiredByDate?: string;
    targetUnitPrice?: number;
  } | null>(null);

  useEffect(() => {
    if (open) {
      snapshot.current = {
        description: getValues(`items.${index}.description`),
        requiredByDate: getValues(`items.${index}.requiredByDate`),
        targetUnitPrice: getValues(`items.${index}.targetUnitPrice`),
      };
    }
  }, [open, index, getValues]);

  const handleCancel = () => {
    const s = snapshot.current;
    if (s) {
      setValue(`items.${index}.description`, s.description ?? "");
      setValue(`items.${index}.requiredByDate`, s.requiredByDate ?? "");
      setValue(`items.${index}.targetUnitPrice`, s.targetUnitPrice);
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleCancel} size="lg">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
          <FileText className="h-5 w-5 text-zinc-700" />
        </div>
        <div className="min-w-0">
          <DialogTitle>Kalem {index + 1} Detayları</DialogTitle>
          <DialogDescription>
            {isSatis
              ? "Alıcılara göstereceğiniz ek bilgiler ve dahili notlar."
              : "Tedarikçilere göstereceğiniz ek bilgiler ve dahili notlar."}
          </DialogDescription>
        </div>
      </div>

      <DialogBody className="space-y-4">
        <Field
          error={itemErrors?.description?.message}
          hint={isSatis ? "Alıcıya gösterilir." : "Tedarikçiye gösterilir."}
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
            hint={isSatis ? "Alıcıya gösterilir." : "Tedarikçiye gösterilir."}
          >
            <Label htmlFor={`detail-requiredByDate-${index}`}>
              {isSatis ? "En Geç Teslim Tarihi" : "Gereksinim Tarihi"}
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
            hint={
              showTarget
                ? `${isSatis ? "Alıcılar" : "Tedarikçiler"} bu fiyatı görecek (İhale Kuralları'nda açık).`
                : "Yalnız sizin için — karşı tarafa gösterilmez."
            }
          >
            <Label htmlFor={`detail-targetUnitPrice-${index}`}>
              {isSatis ? "İstenen Birim Fiyat" : "Hedef Birim Fiyat"}
            </Label>
            <Controller
              name={`items.${index}.targetUnitPrice`}
              render={({ field }) => (
                <MoneyInputNumber
                  id={`detail-targetUnitPrice-${index}`}
                  placeholder=""
                  hasError={!!itemErrors?.targetUnitPrice}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>
        </div>
      </DialogBody>

      <DialogActions>
        <Button plain onClick={handleCancel}>
          Vazgeç
        </Button>
        <Button onClick={onClose}>Kaydet</Button>
      </DialogActions>
    </Dialog>
  );
}
