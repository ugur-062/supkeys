"use client";

import { DEFAULT_LOCALE } from "@rothern/i18n";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { appZoneLabel, wallClock } from "@/lib/time-zone";

/**
 * Tarayıcının saati ürün saat diliminden (İstanbul) farklı mı? Aynı ofsetteki
 * dilimler (Moskova, Riyad) farklı sayılmaz — ipucu gereksiz olurdu.
 */
export function browserZoneDiffers(at: Date = new Date()): boolean {
  const w = wallClock(at);
  // İstanbul duvar saatini UTC sayınca gerçek andan farkı = dilim ofseti (dk).
  const wallAsUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const istanbulOffsetMin = Math.round((wallAsUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
  return istanbulOffsetMin !== -at.getTimezoneOffset();
}

/**
 * Ayrık tarih + saat seçici — tek `datetime-local` yerine. Kullanıcı yalnız
 * TARİHİ elle seçer; saat girilmezse `defaultTime` uygulanır (kapanışta gün
 * sonu 23:59, açılışta gün başı 00:00). Değer `YYYY-MM-DDTHH:mm` (yerel,
 * datetime-local ile aynı format) ya da boş string.
 *
 * SAAT ÜRÜN SAAT DİLİMİNDE (Europe/Istanbul, 2026-09-27): değer gösterimle
 * aynı duvar saatidir (`parseAppWallClockInput` ile ana çevrilir); saat
 * kutusunun yanında dilim etiketi ("GMT+3") görünür — Türkçe dışı dillerde
 * her zaman, Türkçe arayüzde de tarayıcının saati İstanbul'dan farklıysa
 * (Bakü/Berlin'deki Türkçe kullanıcı). Tarayıcı dilimi yalnız efektte okunur
 * (sunucu çizimi dilden türer; hidrasyon güvenli).
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
  const [zoneDiffers, setZoneDiffers] = useState(false);
  useEffect(() => setZoneDiffers(browserZoneDiffers()), []);
  const [datePart = "", timePart = ""] = value ? value.split("T") : [];
  return (
    <div className="flex flex-wrap items-center gap-2">
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
          sınırlar, yoksa saat kutusu tarih kadar büyüyordu. Yerel saat kutusu
          SİTE dilini değil TARAYICI yerelini izler: 12 saatlik tarayıcıda
          (en-US) "05:00 PM" + saat ikonu 96 px'e sığmıyor, saat kesiliyordu
          ("00 PM") — w-32 her iki biçime de yeter (webB-03 yeniden doğrulama). */}
      <div className="w-32 shrink-0">
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
      {locale !== DEFAULT_LOCALE || zoneDiffers ? (
        <span className="self-center text-xs text-zinc-500">{appZoneLabel()}</span>
      ) : null}
    </div>
  );
}
