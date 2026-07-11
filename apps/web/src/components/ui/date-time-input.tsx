"use client";

import { Input } from "@/components/ui/input";

/**
 * Ayrık tarih + saat seçici — tek `datetime-local` yerine. Kullanıcı yalnız
 * TARİHİ elle seçer; saat girilmezse `defaultTime` uygulanır (kapanışta gün
 * sonu 23:59, açılışta gün başı 00:00). Değer `YYYY-MM-DDTHH:mm` (yerel,
 * datetime-local ile aynı format) ya da boş string.
 */
export function DateTimeInput({
  value,
  onChange,
  defaultTime = "23:59",
  min,
  hasError,
  idPrefix,
  disabled,
  dateAriaLabel = "Tarih",
  timeAriaLabel = "Saat",
}: {
  value: string;
  onChange: (next: string) => void;
  /** Saat boş bırakılırsa uygulanacak saat (HH:mm). */
  defaultTime?: string;
  /** datetime-local formatında alt sınır — tarih inputuna gün olarak yansır. */
  min?: string;
  hasError?: boolean;
  idPrefix: string;
  disabled?: boolean;
  dateAriaLabel?: string;
  timeAriaLabel?: string;
}) {
  const [datePart = "", timePart = ""] = value ? value.split("T") : [];
  return (
    <div className="flex gap-2">
      <Input
        id={`${idPrefix}-date`}
        type="date"
        className="flex-1"
        value={datePart}
        min={min ? min.slice(0, 10) : undefined}
        hasError={hasError}
        disabled={disabled}
        aria-label={dateAriaLabel}
        onChange={(e) => {
          const d = e.target.value;
          // Tarih silinirse değer tamamen boşalır; seçilirse mevcut saat
          // korunur, yoksa default saat (gün sonu/başı) yazılır.
          onChange(d ? `${d}T${timePart || defaultTime}` : "");
        }}
      />
      {/* Catalyst Input kendi span'ına w-full basar — genişliği sarmalayıcı
          sınırlar, yoksa saat kutusu tarih kadar büyüyordu. */}
      <div className="w-24 shrink-0">
        <Input
          id={`${idPrefix}-time`}
          type="time"
          value={timePart}
          hasError={hasError}
          disabled={disabled || !datePart}
          aria-label={timeAriaLabel}
          onChange={(e) => {
            if (!datePart) return;
            // Saat temizlenirse default'a döner — "saat yoksa gün sonu" kuralı
            // görünür şekilde uygulanır, gizli sihir yok.
            onChange(`${datePart}T${e.target.value || defaultTime}`);
          }}
        />
      </div>
    </div>
  );
}
