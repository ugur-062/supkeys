"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Textarea } from "@/components/catalyst/textarea";
import { useEffect, useState } from "react";

/**
 * Gerekçe girişli onay diyaloğu (window.prompt yerine — inline doğrulama,
 * yeniden-yazma yok). minLength=0 → opsiyonel gerekçe.
 */
export function ReasonDialog({
  open,
  onClose,
  onSubmit,
  title,
  description,
  confirmLabel,
  minLength = 0,
  pending,
  destructive,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  minLength?: number;
  pending?: boolean;
  destructive?: boolean;
}) {
  const t = useTranslations("web.panel.requests.reasonDialog");
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const tooShort = minLength > 0 && trimmed.length < minLength;

  // Metni yalnızca dialog KAPANDIĞINDA sıfırla. Submit sırasında sıfırlamak,
  // gönderim başarısız olup dialog açık kalırsa kullanıcının yazdığını silerdi.
  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  const submit = () => {
    if (tooShort) return;
    onSubmit(trimmed);
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      {description ? <DialogDescription>{description}</DialogDescription> : null}
      <DialogBody>
        <Field>
          <Label>
            {minLength > 0 ? t("gerekceZorunlu") : t("gerekceOpsiyonel")}
          </Label>
          <Textarea
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              minLength > 0 ? t("enAzKarakter", { minLength: minLength }) : t("kisaAciklama")
            }
            autoFocus
          />
          {tooShort && trimmed.length > 0 ? (
            <p className="mt-1 text-xs text-red-600">
              {t("enAzKarakterOlmali", { minLength: minLength })}
            </p>
          ) : null}
        </Field>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {t("vazgec")}
        </Button>
        <Button
          color={destructive ? "red" : undefined}
          onClick={submit}
          disabled={pending || tooShort}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
