"use client";

import { DEFAULT_LOCALE, type Locale } from "@rothern/i18n";
import { useLocale } from "next-intl";
import { Input } from "@/components/ui/input";
import { numberSeparators } from "@/i18n/format";
import { useEffect, useState, type ComponentProps } from "react";

/**
 * Binlik ayraçlı para girişi (madde 21) — görüntü ARAYÜZ DİLİNİN biçimindedir
 * (TR 100.000,50 · EN 100,000.50 · RU 100 000,50); state'e HAM normalize
 * string yazılır ("100000.50") ki mevcut Number(...) tabanlı doğrulama/payload
 * kodu değişmesin. `type="number"` ayraç gösteremediği için text +
 * inputMode="decimal" kullanılır.
 */
export function formatMoneyDisplay(raw: string, locale: Locale | string = DEFAULT_LOCALE): string {
  if (!raw) return "";
  const { group, decimal } = numberSeparators(locale);
  const [int = "", ...rest] = raw.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return rest.length > 0 ? `${grouped}${decimal}${rest.join("")}` : grouped;
}

/** En fazla ondalık hane (DB `Decimal(18,2)` ile hizalı). */
const MONEY_DECIMALS = 2;

/**
 * Tam genişlikli rakam/ayraç (Çince/Japonca IME'de sayı böyle gelir:
 * "１２，５００") ve Arapça-Hint rakamları ASCII'ye; boşluk türleri (Rusça
 * binlik U+00A0/U+202F dahil) ve kesme işareti (İsviçre "1'234.50") atılır.
 */
function normalizeInput(text: string): string {
  return text
    .replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/，/g, ",")
    .replace(/．/g, ".");
}

/** "1,234,567" / "1,23,456" — düzgün binlik kalıbı (son grup 3 hane). */
function isGrouped(cleaned: string, sep: "." | ","): boolean {
  const s = sep === "." ? "\\." : ",";
  return new RegExp(`^\\d{1,3}(?:${s}\\d{2,3})*${s}\\d{3}$`).test(cleaned);
}

/**
 * Görüntüden ham değere — ARAYÜZ DİLİNİN ayraçlarıyla (2026-09-27).
 *
 * Denetim 2026-08-26 Parça 10 #1: eski sürüm noktayı KOŞULSUZ binlik ayracı
 * sayıyordu; yazarak "1500.50" → 150050 (×100), yapıştırarak "1,234.56" → 1.23
 * (÷1000). 2026-09-27: kural Türkçe sözleşmeye (virgül asla binlik değil)
 * sabitti → İngilizce arayüzde "12,500" yapıştıran satıcının birim fiyatı
 * 12,50 oluyordu; gönderilmiş teklif düzenlenemediği (CLAUDE.md kural 6) için
 * doğrudan PARA KAYBI yoluydu.
 *
 * Kural (D = dilin ondalık ayracı; TR/RU ",", EN "."):
 *  1. Boşluklar her zaman binliktir (RU "1 234,56", FR yapıştırma).
 *  2. İki ayraç türü de varsa SONUNCUSU ondalıktır ("1.234,56", "1,234.56").
 *  3. Yalnız D varsa: tek geçiş ondalıktır, fazla hane kırpılır (EN "12.500"
 *     → 12.50 — dilin sözleşmesi); çok geçişte düzgün binlik kalıbıysa binlik
 *     (TR arayüzünde yapıştırılan "1,234,567").
 *  4. Yalnız öteki ayraç varsa (EN ",", TR ".", RU "."): son geçişten sonra
 *     ≤2 hane (ya da ayraç sonda — ondalığa yeni başlandı) → başka alışkanlıkla
 *     yazılmış ondalık ("1500.50", "12,5"); 3+ hane → binlik ("12,500",
 *     "1.500", "1.234.567").
 */
export function parseMoneyDisplay(display: string, locale: Locale | string = DEFAULT_LOCALE): string {
  const { decimal } = numberSeparators(locale);
  const cleaned = normalizeInput(display).replace(/[^0-9.,]/g, "");
  if (!cleaned) return "";
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");

  let decimalAt = -1;
  if (lastDot !== -1 && lastComma !== -1) {
    decimalAt = Math.max(lastDot, lastComma); // (2)
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep: "." | "," = lastDot !== -1 ? "." : ",";
    const at = Math.max(lastDot, lastComma);
    const count = cleaned.split(sep).length - 1;
    const digitsAfter = cleaned.length - at - 1;
    if (sep === decimal) {
      if (count === 1 || !isGrouped(cleaned, sep)) decimalAt = at; // (3)
    } else if (digitsAfter <= MONEY_DECIMALS) {
      decimalAt = at; // (4)
    }
  }

  const digitsOnly = (v: string) => v.replace(/[^0-9]/g, "");
  if (decimalAt === -1) return digitsOnly(cleaned);
  const int = digitsOnly(cleaned.slice(0, decimalAt));
  // Fazla ondalık yazarken kırpılır (DB Decimal(18,2)).
  const dec = digitsOnly(cleaned.slice(decimalAt + 1)).slice(0, MONEY_DECIMALS);
  return `${int}.${dec}`;
}

/** Yazılan metin yalnız rakam + dilin binlik ayracından mı oluşuyor (canlı gruplama güvenli mi)? */
function onlyDigitsAndGroup(text: string, locale: Locale | string): boolean {
  const { group } = numberSeparators(locale);
  return /^\d*$/.test(normalizeInput(text).replace(/\s/g, "").split(group).join(""));
}

/** Görüntüde izin verilen karakterler — harf vb. yazılırken atılır. */
function sanitizeTyped(text: string): string {
  return text.replace(/[^0-9.,\s'０-９，．٠-٩۰-۹]/g, "");
}

type Props = Omit<
  ComponentProps<typeof Input>,
  "value" | "onChange" | "type"
> & {
  /** Ham normalize değer ("100000.50" | ""). */
  value: string;
  onChange: (raw: string) => void;
};

/**
 * Yazım modeli (2026-09-27): her tuşta yazılan metnin TAMAMI ayrıştırılır.
 * Eski model ara durumu ham değere çevirip yeniden biçimliyordu → sondaki
 * ayraç hemen "ondalık" kabul ediliyor, İngilizce arayüzde "12,500" yazan
 * 12,50'ye düşüyordu. Metin yalnız rakam + binlik ayracıysa canlı gruplanır;
 * ondalık/yabancı ayraç yazıldıysa kullanıcının metni aynen durur ve odaktan
 * çıkınca dilin biçimine oturur.
 */
export function MoneyInput({ value, onChange, onBlur, ...props }: Props) {
  const locale = useLocale();
  // Düzenlenirken kullanıcının yazdığı metin; null → ham değerin biçimli hâli.
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    // Dışarıdan gelen değer (sıfırlama, "tamamını öde") yazılan metni geçersiz kılar.
    if (text !== null && parseMoneyDisplay(text, locale) !== value) setText(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, locale]);
  return (
    <Input
      type="text"
      inputMode="decimal"
      value={text ?? formatMoneyDisplay(value, locale)}
      onChange={(e) => {
        const typed = sanitizeTyped(e.target.value);
        const raw = parseMoneyDisplay(typed, locale);
        setText(!raw.includes(".") && onlyDigitsAndGroup(typed, locale) ? formatMoneyDisplay(raw, locale) : typed);
        onChange(raw);
      }}
      onBlur={(e) => {
        setText(null);
        // "12." gibi yarım ondalık odaktan çıkınca düşer.
        if (value.endsWith(".")) onChange(value.slice(0, -1));
        onBlur?.(e);
      }}
      {...props}
    />
  );
}

type NumberProps = Omit<Props, "value" | "onChange"> & {
  /** Sayısal değer (react-hook-form Controller alanları için). */
  value: number | null | undefined;
  onChange: (v: number | undefined) => void;
};

/**
 * Sayı-tabanlı sarmalayıcı (RHF Controller alanları) — yazım sırasında ham
 * string taslağı içeride tutulur ki "100000," gibi ara durumlar sayıya
 * çevrilirken kaybolmasın; dışarıdan değer değişirse (reset/prefill) taslak
 * tazelenir.
 */
export function MoneyInputNumber({ value, onChange, ...props }: NumberProps) {
  const [draft, setDraft] = useState<string>(
    value == null || Number.isNaN(value) ? "" : String(value),
  );
  useEffect(() => {
    const cur = draft === "" ? undefined : Number(draft);
    const ext = value == null || Number.isNaN(value) ? undefined : value;
    if (cur !== ext) setDraft(ext == null ? "" : String(ext));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <MoneyInput
      {...props}
      value={draft}
      onChange={(raw) => {
        setDraft(raw);
        onChange(raw === "" ? undefined : Number(raw));
      }}
    />
  );
}
