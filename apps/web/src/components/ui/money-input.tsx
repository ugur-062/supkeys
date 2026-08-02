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

/** Görüntüden ham değere: noktalar binlik ayracı sayılır, virgül ondalık. */
export function parseMoneyDisplay(display: string): string {
  const cleaned = display.replace(/\./g, "").replace(/[^0-9,]/g, "");
  const [int = "", ...rest] = cleaned.split(",");
  if (rest.length === 0) return int;
  // En fazla 2 ondalık (MONEY_DECIMALS) — fazlası yazarken kırpılır.
  return `${int}.${rest.join("").slice(0, 2)}`;
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
