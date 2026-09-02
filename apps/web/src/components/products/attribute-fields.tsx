"use client";

import type { AttributeDef } from "@/hooks/use-company-items";
import { Field } from "@/components/ui/field";
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
        return (
          <Field key={d.key}>
            <Label>
              {d.nameTr}
              {d.unit ? (
                <span className="ml-1 font-normal text-zinc-400">({d.unit})</span>
              ) : null}
              {d.isRequired ? (
                <span className="ml-1 text-zinc-400" title="Tamamlanma skorunu etkiler">
                  *
                </span>
              ) : null}
            </Label>

            {d.type === "SINGLE_SELECT" ? (
              <select
                value={typeof v === "string" ? v : ""}
                onChange={(e) => set(d.key, e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
              >
                <option value="">Seçiniz</option>
                {d.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : null}

            {d.type === "MULTI_SELECT" ? (
              <div className="flex flex-wrap gap-2">
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
                      {o}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {d.type === "NUMBER" ? (
              <input
                type="number"
                inputMode="decimal"
                value={typeof v === "string" ? v : ""}
                onChange={(e) => set(d.key, e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
              />
            ) : null}

            {d.type === "TEXT" ? (
              <input
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
