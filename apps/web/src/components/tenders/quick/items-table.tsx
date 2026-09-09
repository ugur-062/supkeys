"use client";

import { COMMON_UNIT_CODES, UNITS, getUnit } from "@rothern/shared";
import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { useState } from "react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { ItemNameInput } from "./item-name-input";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import { cn } from "@/lib/utils";

const CELL = "w-full rounded-lg border border-zinc-300 px-2.5 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15";
const NEW_ITEM = { name: "", description: "", quantity: 1, unit: "adet", unitCode: "PCE", alternativeAllowed: true, materialCode: "", requiredByDate: "", targetUnitPrice: undefined, customQuestion: "", questions: [] } as TenderFormData["items"][number];

/**
 * KALEM LİSTESİ — satır kartları (2026-09-09 v2).
 * Masaüstünde ad · miktar · birim tek satır; mobilde ad tam genişlik,
 * miktar+birim yan yana. "Detay" satırı açıklama/marka/hedef fiyat (isteğe
 * bağlı). Sihirbazla AYNI form dizisi ve zod kuralları.
 */
export function ItemsTable() {
  const { control, register, setValue, watch, formState } = useFormContext<TenderFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const errors = formState.errors.items;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const unitOptions = (current: string | null | undefined) => UNITS.filter((u) => (COMMON_UNIT_CODES as readonly string[]).includes(u.code) || u.code === current);

  return (
    <div>
      <ol className="space-y-2" aria-label="Kalemler">
        {fields.map((f, i) => {
          const err = errors?.[i];
          const unitCode = watch(`items.${i}.unitCode`);
          const detailOpen = !!open[f.id];
          return (
            <li key={f.id} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-950/5">
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 sm:grid-cols-[auto_minmax(0,1fr)_7rem_9rem_auto]">
                <span aria-hidden className="mt-2 w-5 text-center text-xs font-semibold text-zinc-400">{i + 1}</span>
                <div className="col-span-1">
                  <Controller
                    control={control}
                    name={`items.${i}.name`}
                    render={({ field }) => (
                      <ItemNameInput
                        index={i}
                        value={field.value}
                        onChange={field.onChange}
                        className={cn(CELL, "bg-white")}
                        onPick={(o) => {
                          field.onChange(o.name);
                          if (o.unitCode) {
                            setValue(`items.${i}.unitCode`, o.unitCode, { shouldDirty: true });
                            setValue(`items.${i}.unit`, getUnit(o.unitCode)?.nameTr ?? o.unit, { shouldDirty: true });
                          } else setValue(`items.${i}.unit`, o.unit, { shouldDirty: true });
                          if (o.description) setValue(`items.${i}.description`, o.description, { shouldDirty: true });
                          if (o.brand) setValue(`items.${i}.brand`, o.brand, { shouldDirty: true });
                          if (o.code) setValue(`items.${i}.materialCode`, o.code, { shouldDirty: true });
                        }}
                      />
                    )}
                  />
                  {err?.name ? <p className="mt-1 text-xs text-red-700">{err.name.message}</p> : null}
                </div>
                <button type="button" onClick={() => remove(i)} disabled={fields.length === 1} aria-label={`Kalem ${i + 1} sil`} className="mt-1.5 rounded-md p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-900 disabled:opacity-30 sm:order-last">
                  <XMarkIcon aria-hidden className="size-4" />
                </button>
                <div className="col-start-2 sm:col-start-3">
                  <input type="number" step="0.001" min={0.001} {...register(`items.${i}.quantity`, { valueAsNumber: true })} aria-label={`Kalem ${i + 1} miktarı`} className={cn(CELL, "bg-white")} />
                  {err?.quantity ? <p className="mt-1 text-xs text-red-700">{err.quantity.message}</p> : null}
                </div>
                <div className="col-start-2 sm:col-start-4">
                  <select
                    value={unitCode ?? ""}
                    aria-label={`Kalem ${i + 1} birimi`}
                    onChange={(e) => {
                      const code = e.target.value || null;
                      setValue(`items.${i}.unitCode`, code, { shouldDirty: true });
                      setValue(`items.${i}.unit`, code ? (getUnit(code)?.nameTr ?? "adet") : "adet", { shouldDirty: true });
                    }}
                    className={cn(CELL, "bg-white")}
                  >
                    {!unitCode ? <option value="">birim</option> : null}
                    {unitOptions(unitCode).map((u) => (
                      <option key={u.code} value={u.code}>
                        {u.nameTr} ({u.symbol})
                      </option>
                    ))}
                  </select>
                  <input type="hidden" {...register(`items.${i}.unit`)} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [f.id]: !detailOpen }))}
                aria-expanded={detailOpen}
                className="mt-2 ml-7 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900"
              >
                <ChevronDownIcon aria-hidden className={cn("size-3.5 transition", detailOpen && "rotate-180")} />
                Detay {detailOpen ? "" : "(açıklama, marka, hedef fiyat)"}
              </button>
              {detailOpen ? (
                <div className="mt-2 ml-7 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_9rem]">
                  <input {...register(`items.${i}.description`)} placeholder="Teknik açıklama — malzeme, ölçü, standart" aria-label={`Kalem ${i + 1} açıklaması`} className={cn(CELL, "bg-white")} />
                  <input {...register(`items.${i}.brand`)} placeholder="Marka (isteğe bağlı)" aria-label={`Kalem ${i + 1} markası`} className={cn(CELL, "bg-white")} />
                  <input type="number" step="0.01" min={0} {...register(`items.${i}.targetUnitPrice`, { setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)) })} placeholder="Hedef birim fiyat" aria-label={`Kalem ${i + 1} hedef fiyatı`} className={cn(CELL, "bg-white")} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {typeof errors?.message === "string" ? <p className="mt-1 text-xs text-red-700">{errors.message}</p> : null}
      <button type="button" onClick={() => append(NEW_ITEM)} className="mt-3 rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
        + Kalem ekle
      </button>
    </div>
  );
}
