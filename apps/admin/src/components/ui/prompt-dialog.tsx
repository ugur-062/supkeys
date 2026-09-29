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
  /**
   * text tipinde en az karakter (backend @MinLength ile birebir). Altındaki
   * değerde Onayla kapalı ve dialog açık kalır — yazılan metin kaybolmaz.
   */
  minLength?: number;
  /** datetime-local için alt sınır (geçmiş tarih seçilemesin). */
  minDateTime?: string;
  /**
   * İsteğe bağlı İKİNCİ metin alanı (opsiyonel, boş olabilir) — ör. şikayet
   * çözümünde iç "yönetici notu" + firmaya giden "askı gerekçesi" ayrı
   * sorulur (derin denetim MU-02). Değeri `onConfirm`'un 2. argümanıdır.
   */
  secondary?: {
    label: string;
    hint?: string;
    placeholder?: string;
    maxLength?: number;
  };
  onConfirm: (value: string, secondaryValue?: string) => void;
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
  minLength,
  minDateTime,
  secondary,
  onConfirm,
  onClose,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const [secondaryValue, setSecondaryValue] = useState("");

  // Her açılışta varsayılana dön (önceki değer sızmasın).
  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setSecondaryValue("");
    }
  }, [open, defaultValue]);

  const trimmed = value.trim();
  const tooShort =
    type === "text" &&
    minLength !== undefined &&
    (required || trimmed !== "") &&
    trimmed.length < minLength;
  // datetime-local: tarayıcı `min`'i yalnız seçicide uygular, elle yazılan
  // değer geçebilir. Alt sınırdan önceki tarih gönderilmesin (derin denetim
  // LU-12) — aynı "yyyy-MM-dd'T'HH:mm" biçiminde sözlük sırası = zaman sırası.
  const beforeMin =
    type === "datetime-local" &&
    !!minDateTime &&
    trimmed !== "" &&
    trimmed < minDateTime;
  const invalid = (required && trimmed === "") || tooShort || beforeMin;

  const submit = () => {
    if (invalid) return;
    if (secondary) onConfirm(trimmed, secondaryValue.trim());
    else onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onClose={onClose} size="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogBody>
        <Field
          hint={description}
          error={
            tooShort && trimmed !== ""
              ? `En az ${minLength} karakter (${trimmed.length}/${minLength})`
              : beforeMin
                ? "Seçilen tarih izin verilen en erken tarihten önce"
                : undefined
          }
        >
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
        {secondary ? (
          <Field hint={secondary.hint} className="mt-4">
            <Label htmlFor="prompt-dialog-secondary">{secondary.label}</Label>
            <Input
              id="prompt-dialog-secondary"
              type="text"
              maxLength={secondary.maxLength}
              value={secondaryValue}
              placeholder={secondary.placeholder}
              onChange={(e) => setSecondaryValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </Field>
        ) : null}
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
