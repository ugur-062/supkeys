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
import { useDialogSubmitLock } from "@/hooks/use-submit-lock";
import { parseAdminNumber } from "@/lib/number-input";

interface PromptDialogProps {
  open: boolean;
  title: string;
  description?: string;
  /**
   * Alanın ÜSTÜNDE sarı uyarı kutusu — geri alınamaz/sonuçlu işlemin ne
   * yapacağını onaydan önce söyler (ör. paket kaldırma: kalan süre silinir,
   * firmaya e-posta gider — arayüz testi O-046/D-191).
   */
  notice?: React.ReactNode;
  label: string;
  type?: "text" | "number" | "datetime-local" | "email";
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** true → boş değere izin vermez. */
  required?: boolean;
  /**
   * number tipinde min (>= 1 vb.). Değer TAM SAYI ve [min, max] içinde
   * olmalı; dışındaysa Onayla kapalı ve alan hatası görünür — sayfa değeri
   * sessizce düzeltmez (arayüz testi O-074).
   */
  min?: number;
  /** number tipinde max (backend @Max ile birebir). */
  max?: number;
  /** text/email tipinde karakter sınırı (backend @MaxLength ile birebir). */
  maxLength?: number;
  /**
   * text tipinde en az karakter (backend @MinLength ile birebir). Altındaki
   * değerde Onayla kapalı ve dialog açık kalır — yazılan metin kaybolmaz.
   */
  minLength?: number;
  /** datetime-local için alt sınır (geçmiş tarih seçilemesin). */
  minDateTime?: string;
  /**
   * datetime-local için üst sınır (backend ufku ile birebir — ör. ilan
   * kapanışı en fazla şimdi + 2 yıl). Sonrasındaki değerde Onayla kapalı
   * (arayüz testi D-211).
   */
  maxDateTime?: string;
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
  /**
   * Onay — tek seferlik: dönüş promise ise o çözülene, diyalog kapandıysa
   * yeniden açılana dek ikinci onay yutulur (çift tık / kapanış
   * animasyonundaki tık ikinci istek atmaz — arayüz testi FX-00 O-045).
   */
  onConfirm: (value: string, secondaryValue?: string) => unknown;
  onClose: () => void;
}

function rangeMessage(min?: number, max?: number): string {
  if (min !== undefined && max !== undefined) {
    return `${min}-${max} arası bir tam sayı girin`;
  }
  if (min !== undefined) return `En az ${min} olmalı (tam sayı)`;
  if (max !== undefined) return `En fazla ${max} olmalı (tam sayı)`;
  return "Tam sayı girin";
}

/**
 * window.prompt yerine erişilebilir (focus-trap'li) + test edilebilir modal
 * girdi. Değer boşsa ve required değilse boş string döner (opsiyonel alanlar).
 */
export function PromptDialog({
  open,
  title,
  description,
  notice,
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
  maxDateTime,
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
  // number: tam sayı + aralık (boşsa `required` karar verir). Kutu metin +
  // Türkçe kesin ayrıştırma (arayüz testi kapanış NUM): `type="number"` "0,5"i
  // 05 = 5 okuyup tam sayı denetimini geçiriyordu.
  const num = type === "number" ? (parseAdminNumber(trimmed, 0) ?? Number.NaN) : Number.NaN;
  const outOfRange =
    type === "number" &&
    trimmed !== "" &&
    (!Number.isInteger(num) ||
      (min !== undefined && num < min) ||
      (max !== undefined && num > max));
  // email: biçim (backend @IsEmail ile aynı kaba kural) — geçersiz adres
  // gönderilip diyalog kapanmaz (arayüz testi D-204).
  const badEmail =
    type === "email" &&
    trimmed !== "" &&
    !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(trimmed);
  // datetime-local: tarayıcı `min`'i yalnız seçicide uygular, elle yazılan
  // değer geçebilir. Alt sınırdan önceki tarih gönderilmesin (derin denetim
  // LU-12) — aynı "yyyy-MM-dd'T'HH:mm" biçiminde sözlük sırası = zaman sırası.
  const beforeMin =
    type === "datetime-local" &&
    !!minDateTime &&
    trimmed !== "" &&
    trimmed < minDateTime;
  const afterMax =
    type === "datetime-local" &&
    !!maxDateTime &&
    trimmed !== "" &&
    trimmed > maxDateTime;
  const invalid =
    (required && trimmed === "") || tooShort || beforeMin || afterMax || outOfRange || badEmail;
  const lock = useDialogSubmitLock(open);

  const submit = () => {
    if (invalid) return;
    void lock
      .run(() => {
        // Sayı alanı çağırana kanonik değerle gider ("1.500" → "1500").
        const out = type === "number" && trimmed !== "" ? String(num) : trimmed;
        return secondary ? onConfirm(out, secondaryValue.trim()) : onConfirm(out);
      })
      .catch(() => {});
  };

  return (
    <Dialog open={open} onClose={onClose} size="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogBody>
        {notice ? (
          <div
            role="note"
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          >
            {notice}
          </div>
        ) : null}
        <Field
          hint={description}
          error={
            tooShort && trimmed !== ""
              ? `En az ${minLength} karakter (${trimmed.length}/${minLength})`
              : beforeMin
                ? "Seçilen tarih izin verilen en erken tarihten önce"
                : afterMax
                  ? "Seçilen tarih izin verilen en geç tarihten sonra"
                  : outOfRange
                  ? rangeMessage(min, max)
                  : badEmail
                    ? "Geçerli bir e-posta adresi girin"
                    : undefined
          }
        >
          <Label htmlFor="prompt-dialog-input" required={required}>
            {label}
          </Label>
          <Input
            id="prompt-dialog-input"
            type={type === "number" ? "text" : type}
            inputMode={type === "number" ? "numeric" : undefined}
            min={type === "datetime-local" ? minDateTime : undefined}
            max={type === "datetime-local" ? maxDateTime : undefined}
            maxLength={type === "text" || type === "email" ? maxLength : undefined}
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
        <Button type="button" onClick={submit} disabled={invalid || lock.locked}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
