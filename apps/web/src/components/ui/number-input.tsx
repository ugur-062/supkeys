"use client";

import { useLocale } from "next-intl";
import { useEffect, useState, type ChangeEvent, type ComponentProps, type FocusEvent } from "react";
import { Input } from "@/components/ui/input";
import { INVALID_NUMBER_RAW, formatMoneyDisplay, parseNumberStrict } from "@/components/ui/money-input";

/**
 * YEREL SAYI GİRİŞİ — gün, ay, yüzde, nitelik, soru cevabı gibi DOĞRULANAN
 * sayı alanları (arayüz testi kapanış NUM, 2026-10-03). Para için `MoneyInput`.
 *
 * Neden `type="number"` değil: Türkçe tarayıcıda yerel input virgülü yutuyor
 * ve noktayı ondalık okuyordu → "0,5" gün 5, "2,5" peşin %25, "12,50" 1250,
 * "1.500" TL 1,5 olarak SESSİZCE kaydediliyordu. Burada metin arayüz dilinin
 * kurallarıyla `parseNumberStrict` ile okunur; `maxDecimals`ı aşan ya da
 * belirsiz değer kırpılmaz/tahmin edilmez, ham değer `INVALID_NUMBER_RAW`
 * olur ve alan kırmızı çizilir — çağıranın doğrulaması (regex, Number,
 * zod) onu geçersiz sayar. Kullanıcının yazdığı metin geçersizken aynen
 * durur; geçerliyse odaktan çıkınca dilin biçimine oturur ("1500" → "1.500").
 */
export interface NumberFieldOptions {
  /** Ham değer: "" · kanonik ("1500", "2.5") · `INVALID_NUMBER_RAW`. */
  value: string;
  onChange: (raw: string) => void;
  /** İzin verilen ondalık hane — varsayılan 0 (tam sayı). */
  maxDecimals?: number;
}

/**
 * Yerel `<input>` kullanan yerler için (kendi sınıflarıyla) — giriş özelliklerini
 * döner; `aria-invalid`/kırmızı çerçeveyi çağıran `invalid`a göre koyar.
 */
export function useNumberField({ value, onChange, maxDecimals = 0 }: NumberFieldOptions) {
  const locale = useLocale();
  // Düzenlenirken yazılan metin; null → ham değerin biçimli hâli.
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    // Dışarıdan gelen değer (hazır seçenek, sıfırlama) yazılan metni geçersiz kılar.
    if (text !== null && parseNumberStrict(text, locale, maxDecimals) !== value) setText(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, locale]);
  const invalid = value === INVALID_NUMBER_RAW;
  return {
    invalid,
    inputProps: {
      type: "text" as const,
      inputMode: (maxDecimals > 0 ? "decimal" : "numeric") as "decimal" | "numeric",
      autoComplete: "off",
      value: text ?? (invalid ? "" : formatMoneyDisplay(value, locale)),
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        setText(e.target.value);
        onChange(parseNumberStrict(e.target.value, locale, maxDecimals));
      },
      onBlur: (_e?: FocusEvent<HTMLInputElement>) => {
        // Geçersiz metin kullanıcı düzeltene dek görünür kalır.
        if (!invalid) setText(null);
      },
    },
  };
}

/** Sayı ↔ ham değer (NaN = geçersiz giriş, null = boş). */
export function numberToRaw(n: number | null | undefined): string {
  if (n == null) return "";
  return Number.isNaN(n) ? INVALID_NUMBER_RAW : String(n);
}
export function rawToNumber(raw: string): number | null {
  if (raw === "") return null;
  return raw === INVALID_NUMBER_RAW ? Number.NaN : Number(raw);
}
function sameNumber(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null) return a == null && b == null;
  return (Number.isNaN(a) && Number.isNaN(b)) || a === b;
}

/**
 * Sayı tabanlı alan (state `number | null`) — geçersiz giriş `NaN` olarak
 * bildirilir; ara durum ("12,") sayıya çevrilirken kaybolmasın diye ham
 * taslak içeride tutulur.
 */
export function useNumberFieldNumber({
  value,
  onChange,
  maxDecimals,
}: {
  value: number | null | undefined;
  onChange: (n: number | null) => void;
  maxDecimals?: number;
}) {
  const [draft, setDraft] = useState(() => numberToRaw(value));
  useEffect(() => {
    if (!sameNumber(rawToNumber(draft), value)) setDraft(numberToRaw(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return useNumberField({
    value: draft,
    maxDecimals,
    onChange: (raw) => {
      setDraft(raw);
      onChange(rawToNumber(raw));
    },
  });
}

type InputProps = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type" | "inputMode">;

/** Uygulama `Input`u ile yerel sayı girişi — ham değer string. */
export function NumberInput({
  value,
  onChange,
  maxDecimals,
  onBlur,
  hasError,
  ...props
}: InputProps & NumberFieldOptions) {
  const { invalid, inputProps } = useNumberField({ value, onChange, maxDecimals });
  return (
    <Input
      {...props}
      {...inputProps}
      // Geçersizken kırmızı; değilse çağıranın/Field'ın hata durumu.
      hasError={invalid ? true : hasError}
      onBlur={(e) => {
        inputProps.onBlur(e);
        onBlur?.(e);
      }}
    />
  );
}

/** Uygulama `Input`u ile yerel sayı girişi — değer `number | null` (geçersiz = NaN). */
export function NumberInputNumber({
  value,
  onChange,
  maxDecimals,
  onBlur,
  hasError,
  ...props
}: InputProps & {
  value: number | null | undefined;
  onChange: (n: number | null) => void;
  maxDecimals?: number;
}) {
  const { invalid, inputProps } = useNumberFieldNumber({ value, onChange, maxDecimals });
  return (
    <Input
      {...props}
      {...inputProps}
      hasError={invalid ? true : hasError}
      onBlur={(e) => {
        inputProps.onBlur(e);
        onBlur?.(e);
      }}
    />
  );
}
