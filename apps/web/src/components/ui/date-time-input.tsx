"use client";

import { DEFAULT_LOCALE } from "@rothern/i18n";
import { useLocale } from "next-intl";
import { Input } from "@/components/ui/input";
import { appZoneLabel } from "@/lib/time-zone";

/**
 * Ayrık tarih + saat seçici — tek `datetime-local` yerine. Kullanıcı yalnız
 * TARİHİ elle seçer; saat girilmezse `defaultTime` uygulanır (kapanışta gün
 * sonu 23:59, açılışta gün başı 00:00). Değer `YYYY-MM-DDTHH:mm` (yerel,
 * datetime-local ile aynı format) ya da boş string.
 *
 * SAAT ÜRÜN SAAT DİLİMİNDE (Europe/Istanbul, 2026-09-27): değer gösterimle
 * aynı duvar saatidir (`parseAppWallClockInput` ile ana çevrilir); Türkçe
 * dışı dillerde saat kutusunun yanında dilim etiketi ("GMT+3") görünür.
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
  const locale = useLocale();
  const [datePart = "", timePart = ""] = value ? value.split("T") : [];
  return (
    <div className="flex gap-2">
      {/* Kompakt sabit genişlik — "gg.aa.yyyy" + takvim ikonu sığar; alan
          genişliğini doldurup kocaman görünmesin (Catalyst Input w-full basar,
          o yüzden sınır sarmalayıcıda). */}
      <div className="w-40 shrink-0">
        <Input
          id={`${idPrefix}-date`}
          type="date"
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
      </div>
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
      {locale !== DEFAULT_LOCALE ? (
        <span className="self-center text-xs text-zinc-500">{appZoneLabel()}</span>
      ) : null}
    </div>
  );
}
