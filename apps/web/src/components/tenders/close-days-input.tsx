"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { useNumberField } from "@/components/ui/number-input";
import { cn } from "@/lib/utils";

/** Kutuyu kayıt kapısının bulabilmesi için işaret (`useCloseDaysGuard`). */
const CLOSE_DAYS_ATTR = "data-close-days-input";

/**
 * "Özel gün" teklif süresi kutusu — hızlı talep ve Talep Şartları ortak
 * (arayüz testi kapanış NUM).
 *
 * Eskiden her tuşta `Math.min(max, Math.max(1, Number(v) || 1))` uygulanıyordu:
 * seçip yazınca ara boş değer 1'e dönüp sonraki tuşla birleşiyor ("0,5" → 15),
 * fazlası sessizce 60'a kırpılıyordu ("12,50" → 60). Ardından her GEÇERLİ ara
 * değer anında `onChange` ile yazıldı: "12,50" yazan kişinin kapanışı "1" ve
 * "12" öneklerinden geçip 12 güne oturuyor, kutu kırmızıyken taslak/şablon bu
 * önekle kaydediliyordu (arayüz testi kalanlar NUM:NEW-7).
 *
 * Artık yazılan metin yalnız ODAKTAN ÇIKINCA (ya da Enter'da) ve 1…max arası
 * tam gün ise `onChange` ile kapanışa yazılır; yazarken kapanış son onaylı
 * değerde kalır. Geçersiz metin kırmızı ve aralık mesajıyla durur; kayıt
 * düğmeleri `useCloseDaysGuard` ile durur ve kutuya odaklanır.
 */
export function CloseDaysInput({
  value,
  max,
  onChange,
  ariaLabel,
  suffix,
  className,
  labelClassName,
  resetSignal,
}: {
  value: number;
  max: number;
  onChange: (days: number) => void;
  ariaLabel: string;
  /** Kutunun sağındaki birim metni ("gün"). */
  suffix: string;
  className?: string;
  labelClassName?: string;
  /**
   * Her değişimde kutu geçersiz metnini atıp `value`'yu gösterir. Hazır
   * seçenek / tarih seçici zaten seçili süreyi yeniden seçtiğinde `value`
   * değişmez; bu sinyal olmadan kutu kırmızı "12,50"de kalıp kaydı
   * durduruyordu (arayüz testi kalanlar NUM:NEW-7 gözden geçirme).
   */
  resetSignal?: number;
}) {
  const t = useTranslations("web.panel.requests.requestDefaultsForm");
  const [raw, setRaw] = useState(() => String(value));
  useEffect(() => {
    // Hazır seçenek (3·7·14 gün) / tarih seçici dışarıdan değiştirdi → kutu onu gösterir.
    if (Number(raw) !== value) setRaw(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  useEffect(() => {
    // Başka bir denetimle süre açıkça seçildi (aynı süre olsa da) → yazılan metin atılır.
    if (resetSignal !== undefined) setRaw(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);
  const inRange = (r: string) => {
    const n = Number(r);
    return r !== "" && Number.isInteger(n) && n >= 1 && n <= max;
  };
  const { inputProps } = useNumberField({ value: raw, onChange: setRaw });
  const commit = () => {
    if (inRange(raw) && Number(raw) !== value) onChange(Number(raw));
  };
  const bad = !inRange(raw);
  return (
    <>
      <label className={labelClassName}>
        <input
          {...inputProps}
          data-close-days-input=""
          data-max={max}
          onBlur={(e) => {
            inputProps.onBlur(e);
            commit();
          }}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") commit();
          }}
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

/**
 * Kayıt/yayın kapısı: sayfada geçersiz "Özel gün" kutusu varsa kutunun
 * kendi aralık mesajını toast olarak gösterir, kutuya odaklanır ve `false`
 * döner (çağıran kaydı durdurur). Kutu ara durumunu üst forma yazmadığından
 * (`hasInvalidNumber` / `requestDefaultsFieldErrors` onu göremez) kapı DOM'daki
 * işaretli kutuya bakar; `root` verilirse yalnız onun içinde arar.
 */
export function useCloseDaysGuard() {
  const t = useTranslations("web.panel.requests.requestDefaultsForm");
  return useCallback(
    (root: ParentNode = document): boolean => {
      const el = root.querySelector<HTMLInputElement>(`input[${CLOSE_DAYS_ATTR}][aria-invalid="true"]`);
      if (!el) return true;
      toast.error(t("ozelGunAraligi", { max: Number(el.dataset.max) }));
      el.scrollIntoView?.({ behavior: "smooth", block: "center" });
      el.focus();
      return false;
    },
    [t],
  );
}
