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
import { useDialogSubmitLock } from "@/hooks/use-submit-lock";

/**
 * Gerekçe girişli onay diyaloğu (window.prompt yerine — inline doğrulama,
 * yeniden-yazma yok). minLength=0 → opsiyonel gerekçe. maxLength, gerekçeyi
 * alan API DTO'sunun sınırıyla eşleşmeli (aşan metin 400 ile reddedilir).
 * `onSubmit` iş bitince çözülen bir promise döner (async işleyici); onay düğmesi
 * o süre ve diyalog kapanırken senkron kilitlidir — çift tık / kapanış
 * animasyonundaki tık ikinci istek atmaz (arayüz testi FX-00).
 */
export function ReasonDialog({
  open,
  onClose,
  onSubmit,
  title,
  description,
  confirmLabel,
  minLength = 0,
  maxLength = 1000,
  pending,
  destructive,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => unknown;
  title: string;
  description?: string;
  confirmLabel: string;
  minLength?: number;
  maxLength?: number;
  pending?: boolean;
  destructive?: boolean;
}) {
  const t = useTranslations("web.panel.requests.reasonDialog");
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const tooShort = minLength > 0 && trimmed.length < minLength;
  const lock = useDialogSubmitLock(open);

  // Metni yalnızca dialog KAPANDIĞINDA sıfırla. Submit sırasında sıfırlamak,
  // gönderim başarısız olup dialog açık kalırsa kullanıcının yazdığını silerdi.
  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  const submit = () => {
    if (tooShort) return;
    void lock.run(() => onSubmit(trimmed)).catch(() => {});
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
            maxLength={maxLength}
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
          disabled={pending || tooShort || lock.locked}
          aria-busy={pending || lock.locked}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
