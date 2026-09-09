"use client";

import { COMMON_UNIT_CODES, UNITS, getUnit } from "@rothern/shared";
import { XMarkIcon } from "@heroicons/react/20/solid";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import type { TenderFormData } from "@/lib/tenders/form-schema";

const CELL = "w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15";

/**
 * KALEM TABLOSU — ad · miktar · birim (2026-09-09, hızlı talep).
 * Sihirbazın kalem adımıyla AYNI form dizisi (`items`), aynı zod kuralları;
 * yalnız kolonlar azaltıldı. Açıklama/marka/hedef fiyat "Detaylı ayarlar"da.
 */
export function ItemsTable() {
  const { control, register, formState } = useFormContext<TenderFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const errors = formState.errors.items;

  return (
    <div>
      <div className="overflow-x-auto rounded-xl ring-1 ring-zinc-950/5">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-600">
            <tr>
              <th className="px-3 py-2">Kalem</th>
              <th className="w-28 px-3 py-2">Miktar</th>
              <th className="w-36 px-3 py-2">Birim</th>
              <th className="w-10 px-2 py-2" aria-label="Sil" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-950/5 bg-white">
            {fields.map((f, i) => {
              const err = errors?.[i];
              return (
                <tr key={f.id}>
                  <td className="px-3 py-2 align-top">
                    <input {...register(`items.${i}.name`)} placeholder="Ürün / hizmet adı" aria-label={`Kalem ${i + 1} adı`} className={CELL} />
                    {err?.name ? <p className="mt-1 text-xs text-red-700">{err.name.message}</p> : null}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input type="number" step="0.001" min={0.001} {...register(`items.${i}.quantity`, { valueAsNumber: true })} aria-label={`Kalem ${i + 1} miktarı`} className={CELL} />
                    {err?.quantity ? <p className="mt-1 text-xs text-red-700">{err.quantity.message}</p> : null}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Controller
                      control={control}
                      name={`items.${i}.unitCode`}
                      render={({ field }) => (
                        <UnitSelect
                          value={field.value ?? null}
                          fallbackLabel={f.unit}
                          onChange={(code, label) => {
                            field.onChange(code);
                            // `unit` metni backend'e gider; kodla senkron.
                            const ev = { target: { value: label } };
                            void register(`items.${i}.unit`).onChange(ev as never);
                          }}
                          index={i}
                        />
                      )}
                    />
                    <input type="hidden" {...register(`items.${i}.unit`)} />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      disabled={fields.length === 1}
                      aria-label={`Kalem ${i + 1} sil`}
                      className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-30"
                    >
                      <XMarkIcon aria-hidden className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {typeof errors?.message === "string" ? <p className="mt-1 text-xs text-red-700">{errors.message}</p> : null}
      <button
        type="button"
        onClick={() => append({ name: "", description: "", quantity: 1, unit: "adet", unitCode: "PCE", alternativeAllowed: true, materialCode: "", requiredByDate: "", targetUnitPrice: undefined, customQuestion: "", questions: [] })}
        className="mt-3 rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
      >
        + Kalem ekle
      </button>
    </div>
  );
}

function UnitSelect({
  value,
  fallbackLabel,
  onChange,
  index,
}: {
  value: string | null;
  fallbackLabel: string;
  onChange: (code: string | null, label: string) => void;
  index: number;
}) {
  const options = UNITS.filter((u) => (COMMON_UNIT_CODES as readonly string[]).includes(u.code) || u.code === value);
  return (
    <select
      value={value ?? ""}
      aria-label={`Kalem ${index + 1} birimi`}
      onChange={(e) => {
        const code = e.target.value || null;
        onChange(code, code ? (getUnit(code)?.nameTr ?? fallbackLabel) : fallbackLabel);
      }}
      className={CELL}
    >
      {!value ? <option value="">{fallbackLabel || "birim"}</option> : null}
      {options.map((u) => (
        <option key={u.code} value={u.code}>
          {u.nameTr} ({u.symbol})
        </option>
      ))}
    </select>
  );
}
