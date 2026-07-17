"use client";

import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";

interface PromptDialogProps {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  type?: "text" | "number" | "datetime-local";
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** true → boş değere izin vermez. */
  required?: boolean;
  /** number tipinde min (>= 1 vb.). */
  min?: number;
  /** number tipinde max (backend @Max ile birebir). */
  max?: number;
  /** text tipinde karakter sınırı (backend @MaxLength ile birebir). */
  maxLength?: number;
  /** datetime-local için alt sınır (geçmiş tarih seçilemesin). */
  minDateTime?: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}

/**
 * window.prompt yerine erişilebilir (focus-trap'li) + test edilebilir modal
 * girdi. Değer boşsa ve required değilse boş string döner (opsiyonel alanlar).
 */
export function PromptDialog({
  open,
  title,
  description,
  label,
  type = "text",
  defaultValue = "",
  placeholder,
  confirmLabel = "Onayla",
  required = false,
  min,
  max,
  maxLength,
  minDateTime,
  onConfirm,
  onClose,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);

  // Her açılışta varsayılana dön (önceki değer sızmasın).
  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

  const invalid = required && value.trim() === "";

  const submit = () => {
    if (invalid) return;
    onConfirm(value.trim());
  };

  return (
    <Dialog open={open} onClose={onClose} size="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogBody>
        <Field hint={description}>
          <Label htmlFor="prompt-dialog-input" required={required}>
            {label}
          </Label>
          <Input
            id="prompt-dialog-input"
            type={type}
            min={type === "datetime-local" ? minDateTime : min}
            max={type === "number" ? max : undefined}
            maxLength={type === "text" ? maxLength : undefined}
            autoFocus
            value={value}
            placeholder={placeholder}
            hasError={invalid}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </Field>
      </DialogBody>
      <DialogActions>
        <Button type="button" variant="ghost" onClick={onClose}>
          Vazgeç
        </Button>
        <Button type="button" onClick={submit} disabled={invalid}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
