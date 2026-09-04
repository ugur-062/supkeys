"use client";

import { useFilters } from "./filter-shell";
import type { ProductFacets } from "@/lib/public/marketplace-api";
import { activeFilterCount, type ProductFilterState } from "@/lib/public/product-filter-params";
import { ChevronDownIcon, MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { companyActivityLabel } from "@rothern/shared";
import { useEffect, useId, useMemo, useState } from "react";

/**
 * ÜRÜN SÜZGEÇLERİ — istemci, checkbox tabanlı, ÇOKLU seçim (süzgeç v3).
 *
 * · Her grup <fieldset><legend>; başlık yanında seçili sayısı + bölüm temizle;
 *   daraltılabilir (<details>, durum localStorage).
 * · Uzun listeler ilk 6, "Tümünü göster (12)"; kategoride arama kutusu.
 * · Sayıları 0 olan seçenekler soluk + devre dışı (seçili değilse).
 * · Fiyat aralığı + MOQ tavanı: 400 ms debounce.
 * · Durum URL'de (`filter-shell.tsx`); herkese açık `/urunler` ve panel
 *   "Ürün Ara" AYNI bileşeni kullanır.
 */
const SHOW = 6;

export function ProductFilters({ facets, idPrefix = "f" }: { facets: ProductFacets; idPrefix?: string }) {
  const { state, update } = useFilters();
  return (
    <div className="space-y-6" data-filters>
      <CategoryGroup facets={facets} state={state} update={update} idPrefix={idPrefix} />

      <Group title="Firma profili" count={state.verified ? 1 : 0} onClear={() => update({ verified: false })} storageKey="profil">
        <Check
          id={`${idPrefix}-verified`}
          label="Doğrulanmış"
          count={facets.verified}
          checked={state.verified}
          onChange={(v) => update({ verified: v })}
        />
      </Group>

      <Group
        title="Faaliyet tipi"
        count={state.activities.length}
        onClear={() => update({ activities: [] })}
        storageKey="faaliyet"
      >
        <ShowMore
          items={facets.activities.map((a) => ({ key: a.activity, label: companyActivityLabel(a.activity), count: a.count }))}
          selected={state.activities}
          idPrefix={`${idPrefix}-act`}
          onToggle={(k, on) => update((s) => ({ ...s, activities: on ? [...s.activities, k] : s.activities.filter((x) => x !== k) }))}
        />
      </Group>

      <Group title="Şehir" count={state.cities.length} onClear={() => update({ cities: [] })} storageKey="sehir">
        <ShowMore
          items={facets.cities.map((c) => ({ key: c.city, label: c.city, count: c.count }))}
          selected={state.cities}
          idPrefix={`${idPrefix}-city`}
          onToggle={(k, on) => update((s) => ({ ...s, cities: on ? [...s.cities, k] : s.cities.filter((x) => x !== k) }))}
        />
      </Group>

      <PriceGroup facets={facets} state={state} update={update} idPrefix={idPrefix} />

      {facets.attributes.map((a) => (
        <Group
          key={a.key}
          title={a.unit ? `${a.nameTr} (${a.unit})` : a.nameTr}
          count={state.attrs.filter((x) => x.startsWith(`${a.key}:`)).length}
          onClear={() => update((s) => ({ ...s, attrs: s.attrs.filter((x) => !x.startsWith(`${a.key}:`)) }))}
          storageKey={`attr-${a.key}`}
        >
          <ShowMore
            items={a.values.map((v) => ({ key: `${a.key}:${v.value}`, label: v.value, count: v.count }))}
            selected={state.attrs}
            idPrefix={`${idPrefix}-attr-${a.key}`}
            onToggle={(k, on) => update((s) => ({ ...s, attrs: on ? [...s.attrs, k] : s.attrs.filter((x) => x !== k) }))}
          />
        </Group>
      ))}
    </div>
  );
}

/* ───────── Gruplar ───────── */
function useOpenState(storageKey: string, initial = true) {
  const [open, setOpen] = useState(initial);
  useEffect(() => {
    try {
      const v = localStorage.getItem(`rothern.filters.${storageKey}`);
      if (v === "0") setOpen(false);
    } catch {
      /* depolama yok */
    }
  }, [storageKey]);
  const toggle = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(`rothern.filters.${storageKey}`, next ? "1" : "0");
    } catch {
      /* depolama yok */
    }
  };
  return [open, toggle] as const;
}

function Group({
  title,
  count,
  onClear,
  storageKey,
  children,
}: {
  title: string;
  count: number;
  onClear: () => void;
  storageKey: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useOpenState(storageKey);
  const id = useId();
  return (
    <fieldset className="border-t border-zinc-950/5 pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="flex flex-1 items-center gap-1 text-left text-xs font-semibold tracking-wide text-zinc-600 uppercase hover:text-zinc-950"
        >
          <legend className="contents">
            {title}
            {count > 0 ? <span className="ml-1 normal-case text-zinc-950">({count})</span> : null}
          </legend>
          <ChevronDownIcon aria-hidden className={`ml-auto size-4 transition ${open ? "" : "-rotate-90"}`} />
        </button>
        {count > 0 ? (
          <button type="button" onClick={onClear} className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-950">
            Temizle
          </button>
        ) : null}
      </div>
      <div id={id} hidden={!open} className="mt-3 space-y-1">
        {children}
      </div>
    </fieldset>
  );
}

function Check({
  id,
  label,
  count,
  checked,
  onChange,
  type = "checkbox",
  name,
}: {
  id: string;
  label: string;
  count?: number;
  checked: boolean;
  onChange: (v: boolean) => void;
  type?: "checkbox" | "radio";
  name?: string;
}) {
  const disabled = count === 0 && !checked;
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-zinc-100 ${
        checked ? "font-medium text-zinc-950" : "text-zinc-700"
      } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <input
          id={id}
          name={name}
          type={type}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4 shrink-0 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950"
        />
        <span className="line-clamp-1">{label}</span>
      </span>
      {count != null ? <span className="shrink-0 text-xs text-zinc-500">{count}</span> : null}
    </label>
  );
}

function ShowMore({
  items,
  selected,
  idPrefix,
  onToggle,
}: {
  items: { key: string; label: string; count: number }[];
  selected: string[];
  idPrefix: string;
  onToggle: (key: string, on: boolean) => void;
}) {
  const [all, setAll] = useState(false);
  // Seçili olanlar her zaman görünür (kısıtlı listede kaybolmasın).
  const visible = all ? items : items.filter((i, idx) => idx < SHOW || selected.includes(i.key));
  if (items.length === 0) return <p className="px-2 text-xs text-zinc-400">Seçenek yok</p>;
  return (
    <>
      {visible.map((i) => (
        <Check
          key={i.key}
          id={`${idPrefix}-${i.key}`}
          label={i.label}
          count={i.count}
          checked={selected.includes(i.key)}
          onChange={(on) => onToggle(i.key, on)}
        />
      ))}
      {items.length > SHOW ? (
        <button type="button" onClick={() => setAll(!all)} className="px-2 pt-1 text-xs font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-950">
          {all ? "Daha az göster" : `Tümünü göster (${items.length})`}
        </button>
      ) : null}
    </>
  );
}

function CategoryGroup({
  facets,
  state,
  update,
  idPrefix,
}: {
  facets: ProductFacets;
  state: ProductFilterState;
  update: ReturnType<typeof useFilters>["update"];
  idPrefix: string;
}) {
  const [q, setQ] = useState("");
  const items = useMemo(() => {
    const t = q.trim().toLocaleLowerCase("tr-TR");
    return facets.categories.filter((c) => !t || c.name.toLocaleLowerCase("tr-TR").includes(t));
  }, [facets.categories, q]);
  const selectedName = facets.categories.find((c) => c.id === state.category)?.name;
  return (
    <Group title="Kategori" count={state.category ? 1 : 0} onClear={() => update({ category: undefined, attrs: [] })} storageKey="kategori">
      {facets.categories.length > SHOW ? (
        <div className="relative mb-2">
          <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Kategori ara"
            aria-label="Kategori ara"
            className="h-9 w-full rounded-lg border border-zinc-200 pr-8 pl-8 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
          />
          {q ? (
            <button type="button" onClick={() => setQ("")} aria-label="Aramayı temizle" className="absolute top-1/2 right-2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700">
              <XMarkIcon aria-hidden className="size-4" />
            </button>
          ) : null}
        </div>
      ) : null}
      {state.category && !items.some((c) => c.id === state.category) ? (
        <Check id={`${idPrefix}-cat-${state.category}`} label={selectedName ?? state.category} checked onChange={() => update({ category: undefined, attrs: [] })} type="radio" name={`${idPrefix}-cat`} />
      ) : null}
      <ShowMoreRadio
        items={items.map((c) => ({ key: c.id, label: c.name, count: c.count }))}
        selected={state.category}
        idPrefix={`${idPrefix}-cat`}
        onSelect={(k) => update({ category: state.category === k ? undefined : k, attrs: [] })}
      />
    </Group>
  );
}

function ShowMoreRadio({
  items,
  selected,
  idPrefix,
  onSelect,
}: {
  items: { key: string; label: string; count: number }[];
  selected?: string;
  idPrefix: string;
  onSelect: (key: string) => void;
}) {
  const [all, setAll] = useState(false);
  const visible = all ? items : items.filter((i, idx) => idx < SHOW || i.key === selected);
  if (items.length === 0) return <p className="px-2 text-xs text-zinc-400">Eşleşen kategori yok</p>;
  return (
    <>
      {visible.map((i) => (
        <Check
          key={i.key}
          id={`${idPrefix}-${i.key}`}
          label={i.label}
          count={i.count}
          checked={selected === i.key}
          onChange={() => onSelect(i.key)}
        />
      ))}
      {items.length > SHOW ? (
        <button type="button" onClick={() => setAll(!all)} className="px-2 pt-1 text-xs font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-950">
          {all ? "Daha az göster" : `Tümünü göster (${items.length})`}
        </button>
      ) : null}
    </>
  );
}

function PriceGroup({
  facets,
  state,
  update,
  idPrefix,
}: {
  facets: ProductFacets;
  state: ProductFilterState;
  update: ReturnType<typeof useFilters>["update"];
  idPrefix: string;
}) {
  const [min, setMin] = useState(state.priceMin?.toString() ?? "");
  const [max, setMax] = useState(state.priceMax?.toString() ?? "");
  const [moq, setMoq] = useState(state.moqMax?.toString() ?? "");
  useEffect(() => { setMin(state.priceMin?.toString() ?? ""); setMax(state.priceMax?.toString() ?? ""); setMoq(state.moqMax?.toString() ?? ""); }, [state.priceMin, state.priceMax, state.moqMax]);
  // 400 ms debounce — her tuşta sunucuya gitmesin.
  useEffect(() => {
    const t = setTimeout(() => {
      const n = (v: string) => (v.trim() === "" ? undefined : Math.max(0, Math.trunc(Number(v))) || undefined);
      const pm = n(min), px = n(max), mq = n(moq);
      if (pm !== state.priceMin || px !== state.priceMax || mq !== state.moqMax) update({ priceMin: pm, priceMax: px, moqMax: mq });
    }, 400);
    return () => clearTimeout(t);
  }, [min, max, moq]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (state.price ? 1 : 0) + (state.priceMin != null || state.priceMax != null ? 1 : 0) + (state.moqMax != null ? 1 : 0);
  return (
    <Group title="Fiyat" count={count} onClear={() => update({ price: undefined, priceMin: undefined, priceMax: undefined, moqMax: undefined })} storageKey="fiyat">
      <Check id={`${idPrefix}-price-any`} label="Hepsi" checked={!state.price} onChange={() => update({ price: undefined })} type="radio" name={`${idPrefix}-price`} />
      <Check id={`${idPrefix}-price-has`} label="Fiyatı yazılı" count={facets.price.has} checked={state.price === "var"} onChange={() => update({ price: "var" })} type="radio" name={`${idPrefix}-price`} />
      <Check id={`${idPrefix}-price-req`} label="Teklifle" count={facets.price.request} checked={state.price === "teklif"} onChange={() => update({ price: "teklif" })} type="radio" name={`${idPrefix}-price`} />
      <div className="mt-2 grid grid-cols-2 gap-2 px-2">
        <label className="text-xs text-zinc-500">
          Min ₺
          <input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} placeholder="0" className="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-2 text-sm tabular-nums text-zinc-900 outline-none focus:border-zinc-900" />
        </label>
        <label className="text-xs text-zinc-500">
          Max ₺
          <input inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} placeholder="∞" className="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-2 text-sm tabular-nums text-zinc-900 outline-none focus:border-zinc-900" />
        </label>
        <label className="col-span-2 text-xs text-zinc-500">
          Min. sipariş en fazla (adet)
          <input inputMode="numeric" value={moq} onChange={(e) => setMoq(e.target.value.replace(/\D/g, ""))} placeholder="örn. 100" className="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-2 text-sm tabular-nums text-zinc-900 outline-none focus:border-zinc-900" />
        </label>
      </div>
    </Group>
  );
}

/** Aktif süzgeç çipleri — sticky şerit (grid'in üstünde). */
export function ActiveFilterChips({ facets }: { facets: ProductFacets }) {
  const { state, update, clear } = useFilters();
  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (state.category) chips.push({ key: "cat", label: facets.categories.find((c) => c.id === state.category)?.name ?? state.category, onRemove: () => update({ category: undefined, attrs: [] }) });
  for (const c of state.cities) chips.push({ key: `c:${c}`, label: c, onRemove: () => update((s) => ({ ...s, cities: s.cities.filter((x) => x !== c) })) });
  for (const a of state.activities) chips.push({ key: `a:${a}`, label: companyActivityLabel(a), onRemove: () => update((s) => ({ ...s, activities: s.activities.filter((x) => x !== a) })) });
  if (state.verified) chips.push({ key: "v", label: "Doğrulanmış", onRemove: () => update({ verified: false }) });
  if (state.price) chips.push({ key: "p", label: state.price === "var" ? "Fiyatı yazılı" : "Teklifle", onRemove: () => update({ price: undefined }) });
  if (state.priceMin != null || state.priceMax != null) chips.push({ key: "pr", label: `${state.priceMin ?? 0} – ${state.priceMax ?? "∞"} ₺`, onRemove: () => update({ priceMin: undefined, priceMax: undefined }) });
  if (state.moqMax != null) chips.push({ key: "moq", label: `Min. sipariş ≤ ${state.moqMax}`, onRemove: () => update({ moqMax: undefined }) });
  for (const a of state.attrs) chips.push({ key: `attr:${a}`, label: a.slice(a.indexOf(":") + 1), onRemove: () => update((s) => ({ ...s, attrs: s.attrs.filter((x) => x !== a) })) });
  if (chips.length === 0) return null;
  return (
    <div className="sticky top-20 z-20 -mx-2 mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-white/90 px-2 py-2 text-sm ring-1 ring-zinc-950/5 backdrop-blur">
      <span className="text-zinc-500">Süzgeçler:</span>
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.onRemove}
          className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
        >
          {c.label}
          <XMarkIcon aria-hidden className="size-3.5" />
          <span className="sr-only">süzgecini kaldır</span>
        </button>
      ))}
      <button type="button" onClick={clear} className="text-sm font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-600">
        Tümünü temizle
      </button>
      <span className="sr-only">{activeFilterCount(state)} süzgeç aktif</span>
    </div>
  );
}

/** Sıralama — masaüstü çipler (fiyatta yön oku), mobilde <select>. */
export function SortControl() {
  const { state, update } = useFilters();
  const opts: { k: ProductFilterState["sort"]; l: string }[] = [
    { k: undefined, l: "Uygunluk" },
    { k: "yeni", l: "En yeni" },
    { k: state.sort === "fiyat" ? "fiyat-azalan" : "fiyat", l: `Fiyat ${state.sort === "fiyat" ? "↑" : state.sort === "fiyat-azalan" ? "↓" : ""}`.trim() },
  ];
  const isPrice = state.sort === "fiyat" || state.sort === "fiyat-azalan";
  return (
    <>
      <div className="hidden items-center gap-1 text-xs sm:flex">
        <span className="text-zinc-500">Sırala:</span>
        {opts.map((o) => {
          const active = o.k === state.sort || (o.l.startsWith("Fiyat") && isPrice);
          return (
            <button
              key={o.l}
              type="button"
              aria-pressed={active}
              onClick={() => update({ sort: o.k })}
              className={`rounded-full px-2.5 py-1 font-medium transition ${active ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
            >
              {o.l}
            </button>
          );
        })}
      </div>
      <label className="text-xs text-zinc-500 sm:hidden">
        <span className="sr-only">Sırala</span>
        <select
          value={state.sort ?? ""}
          onChange={(e) => update({ sort: (e.target.value || undefined) as ProductFilterState["sort"] })}
          className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
        >
          <option value="">Uygunluk</option>
          <option value="yeni">En yeni</option>
          <option value="fiyat">Fiyat artan</option>
          <option value="fiyat-azalan">Fiyat azalan</option>
        </select>
      </label>
    </>
  );
}
