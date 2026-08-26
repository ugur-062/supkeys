"use client";

import { Input } from "@/components/ui/input";
import { useEffect, useState, type ComponentProps } from "react";

/**
 * Binlik ayraçlı para girişi (madde 21) — görüntü tr-TR biçimindedir
 * (100.000,50); state'e HAM normalize string yazılır ("100000.50") ki mevcut
 * Number(...) tabanlı doğrulama/payload kodu değişmesin. `type="number"`
 * ayraç gösteremediği için text + inputMode="decimal" kullanılır.
 */
export function formatMoneyDisplay(raw: string): string {
  if (!raw) return "";
  const [int = "", ...rest] = raw.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return rest.length > 0 ? `${grouped},${rest.join("")}` : grouped;
}

/** En fazla ondalık hane (DB `Decimal(18,2)` ile hizalı). */
const MONEY_DECIMALS = 2;

/**
 * Görüntüden ham değere.
 *
 * Denetim 2026-08-26 Parça 10 #1: eski sürüm noktayı KOŞULSUZ binlik ayracı
 * sayıyordu (`replace(/\./g, "")`), ondalık ayracı yalnız virgüldü. Sonuç
 * ölçüldü: yazarak "1500.50" → 150050 (×100); YAPIŞTIRARAK "1,234.56" → 1.23
 * (÷1000) ve ekranda "1,23" göründüğü için gözle YAKALANAMIYORDU. Gönderilmiş
 * teklif geri çekilemediği (CLAUDE.md kural 6) için bu doğrudan para yoluydu.
 *
 * Yeni kural (gösterim sözleşmemiz: binlik AYRACI nokta, ondalık VİRGÜL —
 * yani virgül bizde asla binlik olamaz):
 *  1. İki ayraç türü de varsa SONUNCUSU ondalıktır ("1.234,56" ve "1,234.56").
 *  2. Yalnız virgül varsa son virgül ondalıktır ("150,567" → 150,56).
 *  3. Yalnız nokta varsa: sondaki nokta (kullanıcı ondalığa yeni başladı) ya da
 *     tek nokta + ≤2 hane ondalıktır ("1500.50"); aksi halde binliktir
 *     ("1.500", "1.234.567" ve kontrollü input'ta "1.500"+"0" → "1.5005").
 */
export function parseMoneyDisplay(display: string): string {
  const cleaned = display.replace(/[^0-9.,]/g, "");
  if (!cleaned) return "";
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");

  let decimalAt = -1;
  if (lastDot !== -1 && lastComma !== -1) {
    decimalAt = Math.max(lastDot, lastComma); // (1)
  } else if (lastComma !== -1) {
    decimalAt = lastComma; // (2)
  } else if (lastDot !== -1) {
    const dotCount = cleaned.split(".").length - 1;
    const digitsAfter = cleaned.length - lastDot - 1;
    // digitsAfter === 0 ⟺ nokta en sonda. Kontrollü input'ta kritik: görüntü
    // zaten binlik ayraçlıyken ("1.500") basılan nokta, "iki nokta var, hepsi
    // binliktir" kuralına takılıp YUTULUYOR ve ondalık hiç girilemiyordu.
    if (digitsAfter === 0 || (dotCount === 1 && digitsAfter <= MONEY_DECIMALS)) {
      decimalAt = lastDot; // (3)
    }
  }

  const digitsOnly = (v: string) => v.replace(/[^0-9]/g, "");
  if (decimalAt === -1) return digitsOnly(cleaned);
  const int = digitsOnly(cleaned.slice(0, decimalAt));
  // Fazla ondalık yazarken kırpılır (DB Decimal(18,2)).
  const dec = digitsOnly(cleaned.slice(decimalAt + 1)).slice(0, MONEY_DECIMALS);
  return `${int}.${dec}`;
}

type Props = Omit<
  ComponentProps<typeof Input>,
  "value" | "onChange" | "type"
> & {
  /** Ham normalize değer ("100000.50" | ""). */
  value: string;
  onChange: (raw: string) => void;
};

export function MoneyInput({ value, onChange, ...props }: Props) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      value={formatMoneyDisplay(value)}
      onChange={(e) => onChange(parseMoneyDisplay(e.target.value))}
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
