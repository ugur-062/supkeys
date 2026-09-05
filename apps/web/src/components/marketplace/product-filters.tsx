"use client";

import { useFilters } from "./filter-shell";
import type { ProductFacets } from "@/lib/public/marketplace-api";
import { activeFilterCount, type ProductFilterState } from "@/lib/public/product-filter-params";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { Check, FilterChipBar, Group, SHOW, ShowMore, ShowMoreRadio, type FilterChip } from "./filter-primitives";
import { companyActivityLabel } from "@rothern/shared";
import { useEffect, useMemo, useState } from "react";

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





function CategoryGroup({
  facets,
  state,
  update,
  idPrefix,
}: {
  facets: ProductFacets;
  state: ProductFilterState;
  update: ReturnType<typeof useFilters<ProductFilterState>>["update"];
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
        emptyText="Eşleşen kategori yok"
      />
    </Group>
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
  update: ReturnType<typeof useFilters<ProductFilterState>>["update"];
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
  const chips: FilterChip[] = [];
  if (state.category) chips.push({ key: "cat", label: facets.categories.find((c) => c.id === state.category)?.name ?? state.category, onRemove: () => update({ category: undefined, attrs: [] }) });
  for (const c of state.cities) chips.push({ key: `c:${c}`, label: c, onRemove: () => update((s) => ({ ...s, cities: s.cities.filter((x) => x !== c) })) });
  for (const a of state.activities) chips.push({ key: `a:${a}`, label: companyActivityLabel(a), onRemove: () => update((s) => ({ ...s, activities: s.activities.filter((x) => x !== a) })) });
  if (state.verified) chips.push({ key: "v", label: "Doğrulanmış", onRemove: () => update({ verified: false }) });
  if (state.price) chips.push({ key: "p", label: state.price === "var" ? "Fiyatı yazılı" : "Teklifle", onRemove: () => update({ price: undefined }) });
  if (state.priceMin != null || state.priceMax != null) chips.push({ key: "pr", label: `${state.priceMin ?? 0} – ${state.priceMax ?? "∞"} ₺`, onRemove: () => update({ priceMin: undefined, priceMax: undefined }) });
  if (state.moqMax != null) chips.push({ key: "moq", label: `Min. sipariş ≤ ${state.moqMax}`, onRemove: () => update({ moqMax: undefined }) });
  for (const a of state.attrs) chips.push({ key: `attr:${a}`, label: a.slice(a.indexOf(":") + 1), onRemove: () => update((s) => ({ ...s, attrs: s.attrs.filter((x) => x !== a) })) });
  return <FilterChipBar chips={chips} activeCount={activeFilterCount(state)} onClearAll={clear} />;
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
