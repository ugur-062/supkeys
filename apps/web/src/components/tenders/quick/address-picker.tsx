"use client";

import type { CompanyAddress } from "@/hooks/use-company-addresses";
import { cn } from "@/lib/utils";
import { CheckCircleIcon, MapPinIcon } from "@heroicons/react/20/solid";

/** Teslimat adresi — kart seçimi (select yerine): başlık, il, açık adres okunur. */
export function AddressPicker({ addresses, value, onChange, onAdd }: { addresses: CompanyAddress[]; value: string; onChange: (id: string) => void; onAdd: () => void }) {
  const list = addresses.filter((a) => a.type !== "FATURA");
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {list.map((a) => {
        const on = value === a.id;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onChange(a.id)}
            aria-pressed={on}
            className={cn("flex items-start gap-2.5 rounded-xl border p-3 text-left transition", on ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-600" : "border-zinc-300 hover:bg-zinc-50")}
          >
            {on ? <CheckCircleIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-blue-600" /> : <MapPinIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-zinc-400" />}
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-zinc-950">
                {a.title}
                {a.isDefault ? <span className="ml-1.5 rounded bg-zinc-100 px-1 py-0.5 text-[10px] font-medium text-zinc-600">varsayılan</span> : null}
              </span>
              <span className="block truncate text-xs text-zinc-600">{[a.district, a.city].filter(Boolean).join(" / ") || "—"}</span>
              <span className="block truncate text-xs text-zinc-500">{a.addressLine}</span>
            </span>
          </button>
        );
      })}
      <button type="button" onClick={onAdd} className="flex items-center justify-center rounded-xl border border-dashed border-zinc-300 p-3 text-sm font-medium text-zinc-700 hover:border-zinc-900 hover:text-zinc-900">
        + Yeni adres
      </button>
    </div>
  );
}
