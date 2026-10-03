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
 * Kesirli ham para değerini 2 haneye tamamlar ("1250.5" → "1250.50"); tam
 * sayı ("1250"), yarım ondalık ("1250.") ve boş değer olduğu gibi kalır.
 *
 * Prisma `Decimal.toString` ve `String(12.5)` sondaki sıfırı atar → kayıtlı
 * fiyat formda "1.250,5" / "12,5" görünüyordu (arayüz testi kapanış S-SELL
 * NEW-1). Çizim tarafında, tek yerde düzeltilir: ham state'e dokunulmaz.
 */
export function padMoneyFraction(raw: string, decimals: number = MONEY_DECIMALS): string {
  const m = /^(-?\d*)\.(\d+)$/.exec(raw);
  if (!m || m[2].length >= decimals) return raw;
  return `${m[1]}.${m[2].padEnd(decimals, "0")}`;
}

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
export function parseMoneyDisplay(
  display: string,
  locale: Locale | string = DEFAULT_LOCALE,
  maxDecimals: number = MONEY_DECIMALS,
): string {
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
    } else if (
      maxDecimals > MONEY_DECIMALS &&
      (!isGrouped(cleaned, sep) || /^0[.,]/.test(cleaned))
    ) {
      // (4b) Miktar gibi 3+ ondalıklı alanlar: düzgün binlik kalıbı değilse
      // ("1.2505") ya da tam kısım 0 ise ("0.125") ondalıktır; "1.500" binlik.
      decimalAt = at;
    }
  }

  const digitsOnly = (v: string) => v.replace(/[^0-9]/g, "");
  if (decimalAt === -1) return digitsOnly(cleaned);
  const int = digitsOnly(cleaned.slice(0, decimalAt));
  // Fazla ondalık yazarken kırpılır (para DB Decimal(18,2), miktar 18,3).
  const dec = digitsOnly(cleaned.slice(decimalAt + 1)).slice(0, maxDecimals);
  return `${int}.${dec}`;
}

/**
 * Geçersiz sayı girişinin ham değeri (arayüz testi kapanış NUM). Bilerek "NaN":
 * `Number(...)` NaN verir, `/^\d+$/` tutmaz, `Number.isInteger` düşer — ham
 * değeri denetleyen her yol alanı geçersiz sayar. Boş ("") ayrı: alan boş.
 */
export const INVALID_NUMBER_RAW = "NaN";

/** Ham değer (string) ya da sayı geçersiz sayı girişi mi? */
export function isInvalidNumber(v: unknown): boolean {
  return v === INVALID_NUMBER_RAW || (typeof v === "number" && Number.isNaN(v));
}

/**
 * Nesnede (form değerleri, şart taslağı) geçersiz sayı girişi var mı — iç içe
 * dolaşır. Doğrulamasız yollar (taslak kaydı) için: NaN JSON'da `null` olur ve
 * alan SESSİZCE boşalırdı.
 */
export function hasInvalidNumber(v: unknown, depth = 0): boolean {
  if (isInvalidNumber(v)) return true;
  if (depth > 6 || v == null || typeof v !== "object") return false;
  if (v instanceof Date || (typeof File !== "undefined" && v instanceof File)) return false;
  return Object.values(v as Record<string, unknown>).some((x) => hasInvalidNumber(x, depth + 1));
}

/**
 * KESİN sayı ayrıştırma — doğrulanan alanlar (gün, ay, yüzde, nitelik, eşik)
 * için (arayüz testi kapanış NUM, 2026-10-03).
 *
 * `type="number"` Türkçe tarayıcıda virgülü YUTUYORDU: "0,5" → 05 = 5 gün,
 * "2,5" peşin → %25, "12,50" → 1250; noktayı da ondalık okuyordu: "1.500" TL
 * eşik → 1,5. `parseMoneyDisplay` gibi aynı dil kuralları (ayraçlar arayüz
 * dilinden; iki ayraç → sondaki ondalık; yalnız öteki ayraç → ≤2 hane ondalık,
 * düzgün 3'lü grup binlik) ama KIRPMAZ ve TAHMİN ETMEZ:
 *  - `maxDecimals`tan fazla anlamlı ondalık → GEÇERSİZ (tam sayı alanında
 *    "0,5" / "2.5" / "12,50" 5/25/1250 değil, hata);
 *  - düzensiz gruplama ("1.2.3", "12.34.567"), harf, eksi → GEÇERSİZ.
 *
 * Dönüş: "" (boş) · kanonik ham değer ("1500", "2.5") · `INVALID_NUMBER_RAW`.
 */
export function parseNumberStrict(
  display: string,
  locale: Locale | string = DEFAULT_LOCALE,
  maxDecimals = 0,
): string {
  const { decimal } = numberSeparators(locale);
  const norm = normalizeInput(display).trim();
  if (!norm) return "";
  // Boşluk (RU binlik) ve kesme işareti (CH) binliktir.
  const cleaned = norm.replace(/[\s'’]/g, "");
  if (!/^[0-9.,]+$/.test(cleaned) || !/\d/.test(cleaned)) return INVALID_NUMBER_RAW;

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  let decimalAt = -1;
  if (lastDot !== -1 && lastComma !== -1) {
    decimalAt = Math.max(lastDot, lastComma);
    // Ondalık ayracı bir kez geçer ("1.234,5,6" geçersiz).
    if (cleaned.split(cleaned[decimalAt]!).length !== 2) return INVALID_NUMBER_RAW;
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep: "." | "," = lastDot !== -1 ? "." : ",";
    const at = Math.max(lastDot, lastComma);
    const count = cleaned.split(sep).length - 1;
    const digitsAfter = cleaned.length - at - 1;
    const grouped = isGrouped(cleaned, sep) && !/^0[.,]/.test(cleaned);
    if (sep === decimal) {
      if (count === 1) decimalAt = at;
      else if (!grouped) return INVALID_NUMBER_RAW;
    } else if (count === 1 && digitsAfter <= MONEY_DECIMALS) {
      decimalAt = at; // başka alışkanlıkla yazılmış ondalık ("2.5", "12.50")
    } else if (!grouped) {
      // "1.2505" / "0.125": 3+ ondalıklı alanda ondalık, öteki alanda geçersiz.
      if (count === 1 && maxDecimals > MONEY_DECIMALS) decimalAt = at;
      else return INVALID_NUMBER_RAW;
    }
  }

  const intPart = decimalAt === -1 ? cleaned : cleaned.slice(0, decimalAt);
  const fracPart = decimalAt === -1 ? "" : cleaned.slice(decimalAt + 1);
  if (/[.,]/.test(fracPart)) return INVALID_NUMBER_RAW;
  if (/[.,]/.test(intPart)) {
    const groupSep = intPart.includes(".") ? "." : ",";
    if (intPart.includes(groupSep === "." ? "," : ".") || !isGrouped(intPart, groupSep)) {
      return INVALID_NUMBER_RAW;
    }
  }
  const frac = fracPart.replace(/0+$/, "");
  if (frac.length > maxDecimals) return INVALID_NUMBER_RAW;
  const int = intPart.replace(/[.,]/g, "").replace(/^0+(?=\d)/, "") || "0";
  return frac ? `${int}.${frac}` : int;
}

/**
 * Kayıtsız (react-hook-form `register`) metin kutusu için: yazılan metin →
 * sayı. Boş → `undefined`, geçersiz → `NaN` (zod `invalid_type` mesajı çıkar,
 * `hasInvalidNumber` taslak kaydını durdurur).
 */
export function numberFromInputText(
  v: unknown,
  locale: Locale | string = DEFAULT_LOCALE,
  maxDecimals = 0,
): number | undefined {
  if (typeof v === "number") return v;
  if (v == null) return undefined;
  const raw = parseNumberStrict(String(v), locale, maxDecimals);
  if (raw === "") return undefined;
  return raw === INVALID_NUMBER_RAW ? Number.NaN : Number(raw);
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
  /**
   * En fazla ondalık hane — varsayılan 2 (para). Miktar alanları 3 geçer
   * (`QUANTITY_DECIMALS`, DB Decimal(18,3)); `type="number"` Türkçe tarayıcıda
   * "1.500"ü 1,5 okuyor, "2." ara durumunu boş döndürüp kontrollü alanı 0'a
   * sıfırlıyordu (arayüz testi son tur S-BUY).
   */
  maxDecimals?: number;
};

/**
 * Yazım modeli (2026-09-27): her tuşta yazılan metnin TAMAMI ayrıştırılır.
 * Eski model ara durumu ham değere çevirip yeniden biçimliyordu → sondaki
 * ayraç hemen "ondalık" kabul ediliyor, İngilizce arayüzde "12,500" yazan
 * 12,50'ye düşüyordu. Metin yalnız rakam + binlik ayracıysa canlı gruplanır;
 * ondalık/yabancı ayraç yazıldıysa kullanıcının metni aynen durur ve odaktan
 * çıkınca dilin biçimine oturur.
 */
export function MoneyInput({ value, onChange, onBlur, maxDecimals, ...props }: Props) {
  const locale = useLocale();
  // Düzenlenirken kullanıcının yazdığı metin; null → ham değerin biçimli hâli.
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    // Dışarıdan gelen değer (sıfırlama, "tamamını öde") yazılan metni geçersiz kılar.
    if (text !== null && parseMoneyDisplay(text, locale, maxDecimals) !== value) setText(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, locale]);
  return (
    <Input
      type="text"
      inputMode="decimal"
      // Para alanı (2 ondalık) odakta değilken kesirli değer 2 haneyle çizilir;
      // miktar (3) / tam sayı (0) alanları olduğu gibi.
      value={
        text ??
        formatMoneyDisplay(
          (maxDecimals ?? MONEY_DECIMALS) === MONEY_DECIMALS ? padMoneyFraction(value) : value,
          locale,
        )
      }
      onChange={(e) => {
        const typed = sanitizeTyped(e.target.value);
        const raw = parseMoneyDisplay(typed, locale, maxDecimals);
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
/**
 * Ham taslak → sayı. Sayıya çevrilemeyen ara durum (başta yazılan ondalık
 * ayraç → ".") `undefined`dır, NaN değil: NaN forma yazılınca aşağıdaki
 * eşitleme taslağı siliyor, ",5" yazan 5 kaydediyordu (derin denetim S086).
 */
function draftToNumber(raw: string): number | undefined {
  if (raw === "") return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

export function MoneyInputNumber({ value, onChange, ...props }: NumberProps) {
  const [draft, setDraft] = useState<string>(
    value == null || Number.isNaN(value) ? "" : String(value),
  );
  useEffect(() => {
    const cur = draftToNumber(draft);
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
        onChange(draftToNumber(raw));
      }}
    />
  );
}
