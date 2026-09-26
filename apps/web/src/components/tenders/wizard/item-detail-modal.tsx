"use client";

import { useTranslations } from "next-intl";
import { useEntityLabels } from "@/i18n/domain";

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
  const t = useTranslations("web.panel.requests.itemDetailModal");
  const {
    register,
    getValues,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext<TenderFormData>();
  const L = useEntityLabels();
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
          <DialogTitle>{t("kalemDetaylari", { n: index + 1 })}</DialogTitle>
          <DialogDescription>
            {t("gostereceginizEkBilgilerVeDahili", { counterpartyPluralDat: L.counterpartyPluralDat })}
          </DialogDescription>
        </div>
      </div>

      <DialogBody className="space-y-4">
        <Field
          error={itemErrors?.description?.message}
          hint={t("tedarikciyeGosterilir")}
        >
          <Label htmlFor={`detail-description-${index}`}>
            {t("aciklamaSpesifikasyon")}
          </Label>
          <Textarea
            id={`detail-description-${index}`}
            rows={4}
            maxLength={2000}
            placeholder={t("markaModelKaliteGereksinimleriTeknik")}
            hasError={!!itemErrors?.description}
            {...register(`items.${index}.description`)}
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field
            error={itemErrors?.requiredByDate?.message}
            hint={t("tedarikciyeGosterilir")}
          >
            <Label htmlFor={`detail-requiredByDate-${index}`}>
              {t("gereksinimTarihi")}
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
                ? t("buFiyatiGorecekNdaAcik", { counterpartyPlural: L.counterpartyPlural, rules: L.rules })
                : t("yalnizSizinIcinKarsiTarafa")
            }
          >
            <Label htmlFor={`detail-targetUnitPrice-${index}`}>
              {t("hedefBirimFiyat")}
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
          {t("vazgec")}
        </Button>
        <Button onClick={onClose}>{t("kaydet")}</Button>
      </DialogActions>
    </Dialog>
  );
}
