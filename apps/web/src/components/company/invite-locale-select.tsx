"use client";

import { LOCALES, LOCALE_LABELS, isLocale, type Locale } from "@rothern/i18n";
import { cn } from "@/lib/utils";

/**
 * DAVET DİLİ SEÇİCİSİ (2026-09-27) — kayıtsız alıcıya giden davet e-postası
 * (dış talep daveti, "tedarikçini davet et") hangi dilde gidecek. Varsayılanı
 * çağıran `recipientLocale` ile doldurur (ülke → e-posta/site uzantısı →
 * arayüz dili); kullanıcı satır başına değiştirebilir. Seçenek etiketleri
 * dilin KENDİ adıyla ve çevrilmez (dil seçicisiyle aynı kural).
 */
export function InviteLocaleSelect({
  value,
  onChange,
  label,
  disabled,
  className,
}: {
  value: Locale;
  onChange: (locale: Locale) => void;
  /** Erişilebilir ad ("x@y.com için davet dili"). */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        if (isLocale(e.target.value)) onChange(e.target.value);
      }}
      className={cn(
        "shrink-0 rounded-lg border border-surface-border bg-white py-1.5 pr-7 pl-2 text-xs text-zinc-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:bg-zinc-100",
        className,
      )}
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_LABELS[l]}
        </option>
      ))}
    </select>
  );
}
