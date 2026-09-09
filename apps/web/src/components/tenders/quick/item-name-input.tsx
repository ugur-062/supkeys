"use client";

import { useCatalogItems, type CatalogItem } from "@/hooks/use-company-items";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

/**
 * KALEM ADI — kataloğunuzdan otomatik tamamlama (2026-09-09 v3).
 * 2+ karakterde firmanın kalem kataloğu aranır; seçim ad + birim + açıklama
 * getirir. Katalog boşsa düz metin kutusu gibi davranır.
 */
export function ItemNameInput({
  value,
  onChange,
  onPick,
  index,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (item: CatalogItem) => void;
  index: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), 250);
    return () => clearTimeout(t);
  }, [value]);
  const { data } = useCatalogItems(debounced, open && debounced.length >= 2);
  const options = (data?.items ?? []).filter((i) => i.isActive).slice(0, 6);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={wrap} className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Ürün / hizmet adı"
        aria-label={`Kalem ${index + 1} adı`}
        aria-autocomplete="list"
        aria-expanded={open && options.length > 0}
        className={className}
      />
      {open && debounced.length >= 2 && options.length > 0 ? (
        <ul role="listbox" aria-label="Kataloğunuzdan öneriler" className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-zinc-950/10">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(o);
                  setOpen(false);
                }}
                className={cn("flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-zinc-50")}
              >
                {o.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.thumbnailUrl} alt="" className="size-8 shrink-0 rounded-md object-cover ring-1 ring-zinc-950/10" />
                ) : (
                  <span aria-hidden className="size-8 shrink-0 rounded-md bg-zinc-100" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-zinc-900">{o.name}</span>
                  <span className="block truncate text-xs text-zinc-500">
                    {[o.code, o.unit, o.brand].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-zinc-400">katalog</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
