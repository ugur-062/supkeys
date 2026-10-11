"use client";

import { useTranslations } from "next-intl";
import type { AttributeDef } from "@/hooks/use-company-items";
import { Field, useFieldContext } from "@/components/ui/field";
import { isInvalidNumber } from "@/components/ui/money-input";
import { useNumberField } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";

/**
 * KATEGORİYE ÖZEL NİTELİK ALANLARI.
 *
 * Alanlar elle yazılmaz — kategori seçilir seçilmez `useCategoryAttributes`
 * ata zincirinden MİRAS seti getirir ve form buradan kurulur. Kategori
 * değişince alanlar tamamen değişir; bu yüzden değerler `attributes` JSON'ında
 * ANAHTARLA tutulur, sıraya göre değil.
 *
 * Nitelik tanımı OLMAYAN kategoride bileşen hiç basılmaz — matris o segmente
 * henüz yazılmadıysa form yine çalışmalı (158 bin kategorinin hepsi
 * doldurulamaz, gerekçe `CategoryAttribute` şemasında).
 *
 * Seçenek METNİ okuyucunun dilinde (`optionLabels`, API EN/RU'da döner);
 * DEĞER kanonik Türkçe kalır — kayıt ve alıcı tarafı eşlemesi ona bakar.
 */
export function AttributeFields({
  defs,
  values,
  onChange,
}: {
  defs: AttributeDef[];
  values: Record<string, string | string[]>;
  onChange: (next: Record<string, string | string[]>) => void;
}) {
  const t = useTranslations("web.panel.trade.attributeFields");
  if (defs.length === 0) return null;

  const set = (key: string, value: string | string[]) => {
    const next = { ...values };
    if (value === "" || (Array.isArray(value) && value.length === 0)) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onChange(next);
  };

  return (
    <div className="space-y-5">
      {defs.map((d) => {
        const v = values[d.key];
        /* Nitelik alanı DÖRT farklı kontrol basıyor. Çoklu seçim bir ÇİP
           GRUBU — tek kontrol yok, dolayısıyla `<label>` bağlanamaz ve boş
           bırakılamaz: başlık olarak basılıp gruba `aria-labelledby` ile
           bağlanır. Diğer üçü tek kontrol, doğrudan `htmlFor`. */
        const kontrolId = `nitelik-${d.key}`;
        const grup = d.type === "MULTI_SELECT";
        return (
          <Field
            key={d.key}
            error={d.type === "NUMBER" && isInvalidNumber(v) ? t("sayiGecersiz") : undefined}
          >
            <Label
              as={grup ? "p" : "label"}
              {...(grup ? { id: `${kontrolId}-baslik` } : { htmlFor: kontrolId })}
            >
              {d.nameTr}
              {d.unit ? (
                <span className="ml-1 font-normal text-zinc-500">({d.unit})</span>
              ) : null}
              {d.isRequired ? (
                <span className="ml-1 text-zinc-500" title={t("tamamlanmaSkorunuEtkiler")}>
                  *
                </span>
              ) : null}
            </Label>

            {d.type === "SINGLE_SELECT" ? (
              <select
                id={kontrolId}
                value={typeof v === "string" ? v : ""}
                onChange={(e) => set(d.key, e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
              >
                <option value="">{t("seciniz")}</option>
                {d.options.map((o) => (
                  <option key={o} value={o}>
                    {d.optionLabels?.[o] ?? o}
                  </option>
                ))}
              </select>
            ) : null}

            {d.type === "MULTI_SELECT" ? (
              <div role="group" aria-labelledby={`${kontrolId}-baslik`} className="flex flex-wrap gap-2">
                {d.options.map((o) => {
                  const arr = Array.isArray(v) ? v : [];
                  const on = arr.includes(o);
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() =>
                        set(d.key, on ? arr.filter((x) => x !== o) : [...arr, o])
                      }
                      aria-pressed={on}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                        on
                          ? "bg-zinc-950 text-white"
                          : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                      }`}
                    >
                      {d.optionLabels?.[o] ?? o}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {d.type === "NUMBER" ? (
              <NumberAttributeInput
                id={kontrolId}
                value={typeof v === "string" ? v : ""}
                onChange={(raw) => set(d.key, raw)}
              />
            ) : null}

            {d.type === "TEXT" ? (
              <input
                id={kontrolId}
                type="text"
                maxLength={200}
                value={typeof v === "string" ? v : ""}
                onChange={(e) => set(d.key, e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
              />
            ) : null}
          </Field>
        );
      })}
    </div>
  );
}

/** Sayısal nitelik alanında izin verilen ondalık (ölçü: 0,125 mm). */
const ATTRIBUTE_NUMBER_DECIMALS = 4;

/**
 * Sayısal nitelik (Kalınlık mm …) — yerel ondalık giriş (arayüz testi kapanış
 * NUM): `type="number"` Türkçe tarayıcıda "2,5"i 25 kaydediyordu. Geçersiz
 * metin `INVALID_NUMBER_RAW` olarak durur; ürün kaydı onu reddeder.
 */
function NumberAttributeInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (raw: string) => void;
}) {
  const field = useFieldContext();
  const { invalid, inputProps } = useNumberField({
    value,
    onChange,
    maxDecimals: ATTRIBUTE_NUMBER_DECIMALS,
  });
  return (
    <input
      id={id}
      {...inputProps}
      aria-invalid={invalid || undefined}
      aria-describedby={field?.describedBy}
      className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:ring-2 ${
        invalid
          ? "border-red-500 focus:border-red-600 focus:ring-red-600/10"
          : "border-zinc-300 focus:border-zinc-900 focus:ring-zinc-900/10"
      }`}
    />
  );
}
