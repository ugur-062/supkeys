"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useNumberField } from "@/components/ui/number-input";
import { cn } from "@/lib/utils";

/**
 * "Özel gün" teklif süresi kutusu — hızlı talep ve Talep Şartları ortak
 * (arayüz testi kapanış NUM).
 *
 * Eskiden her tuşta `Math.min(max, Math.max(1, Number(v) || 1))` uygulanıyordu:
 * seçip yazınca ara boş değer 1'e dönüp sonraki tuşla birleşiyor ("0,5" → 15),
 * fazlası sessizce 60'a kırpılıyordu ("12,50" → 60) ve kapanış tarihi haber
 * vermeden değişiyordu. Artık yazılan metin yerel tam sayı olarak okunur;
 * yalnız 1…max arası tam gün `onChange` ile kapanışa yazılır, aksi hâlde
 * alan kırmızı ve aralık mesajı görünür (kapanış son geçerli değerde kalır).
 */
export function CloseDaysInput({
  value,
  max,
  onChange,
  ariaLabel,
  suffix,
  className,
  labelClassName,
}: {
  value: number;
  max: number;
  onChange: (days: number) => void;
  ariaLabel: string;
  /** Kutunun sağındaki birim metni ("gün"). */
  suffix: string;
  className?: string;
  labelClassName?: string;
}) {
  const t = useTranslations("web.panel.requests.requestDefaultsForm");
  const [raw, setRaw] = useState(() => String(value));
  useEffect(() => {
    // Hazır seçenek (3·7·14 gün) dışarıdan değiştirdi → kutu onu gösterir.
    if (Number(raw) !== value) setRaw(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const inRange = (r: string) => {
    const n = Number(r);
    return r !== "" && Number.isInteger(n) && n >= 1 && n <= max;
  };
  const { inputProps } = useNumberField({
    value: raw,
    onChange: (r) => {
      setRaw(r);
      if (inRange(r)) onChange(Number(r));
    },
  });
  const bad = !inRange(raw);
  return (
    <>
      <label className={labelClassName}>
        <input
          {...inputProps}
          aria-label={ariaLabel}
          aria-invalid={bad || undefined}
          className={cn(className, bad && "border-red-500 focus:border-red-600")}
        />
        {suffix}
      </label>
      {/* Üst kap `flex-wrap`: mesaj kendi satırına iner. */}
      {bad ? (
        <span role="alert" className="basis-full text-xs text-red-600">
          {t("ozelGunAraligi", { max })}
        </span>
      ) : null}
    </>
  );
}
