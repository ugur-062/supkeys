"use client";

import { useFilters } from "@/components/marketplace/filter-shell";
import {
  Check,
  FilterChipBar,
  Group,
  SHOW,
  ShowMore,
  type FilterChip,
} from "@/components/marketplace/filter-primitives";
import type { RequestFacets } from "@/lib/company/request-facets";
import {
  activeRequestFilterCount,
  CLOSING_WINDOWS,
  FIT_OPTIONS,
  PERIOD_WINDOWS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  type RequestFilterState,
  type RequestSort,
} from "@/lib/company/request-filter-params";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { useMemo, useState } from "react";

/**
 * AÇIK TALEP SÜZGEÇLERİ — satış anasayfasındaki liste için kenar süzgeci
 * (2026-09-05, kullanıcı: "iyi bir filtreleme olsun"). Ürün süzgeciyle AYNI
 * yapı taşları (`filter-primitives`), aynı davranış: grup başına sayaç +
 * Temizle, daraltılır, ilk 6 + "Tümünü göster", sayısı 0 olan soluk.
 *
 * Sıra "teklif verecek miyim" sorusunun sırası: neden karşımda (Uygunluk) →
 * hâlâ açık mı (Durum) → alanım mı (Kategori) → yetişir miyim (Kapsam,
 * Kapanış) → kim (Alıcı, Şehir) → koşullar (Para birimi, Usul) → ne zaman
 * çıktı (Yayın tarihi). Arama kutusu YOK — hero kutusu `?q=` yazar, burada
 * yalnız çip olarak görünür (aynı sayfada iki arama kutusu olmasın).
 */
type Update = ReturnType<typeof useFilters<RequestFilterState>>["update"];

const toggleIn = (list: string[], key: string, on: boolean) =>
  on ? [...new Set([...list, key])] : list.filter((x) => x !== key);

export function RequestFilters({ facets, idPrefix = "t" }: { facets: RequestFacets; idPrefix?: string }) {
  const { state, update } = useFilters<RequestFilterState>();
  const radioName = (g: string) => `${idPrefix}-${g}`;
  return (
    <div className="space-y-6" data-filters>
      <Group title="Uygunluk" count={state.fit.length} onClear={() => update({ fit: [] })} storageKey="talep-uygunluk">
        {FIT_OPTIONS.map((o) => (
          <Check
            key={o.key}
            id={`${idPrefix}-fit-${o.key}`}
            label={o.label}
            count={facets.fit[o.key]}
            checked={state.fit.includes(o.key)}
            onChange={(on) => update((s) => ({ ...s, fit: toggleIn(s.fit, o.key, on) as RequestFilterState["fit"] }))}
          />
        ))}
      </Group>

      <Group title="Durum" count={state.status !== "aktif" ? 1 : 0} onClear={() => update({ status: "aktif" })} storageKey="talep-durum">
        {STATUS_OPTIONS.map((o) => (
          <Check
            key={o.key}
            id={`${idPrefix}-status-${o.key}`}
            label={o.label}
            count={facets.status[o.key]}
            checked={state.status === o.key}
            onChange={() => update({ status: o.key })}
            type="radio"
            name={radioName("status")}
          />
        ))}
      </Group>

      <CategoryGroup facets={facets} state={state} update={update} idPrefix={idPrefix} />

      <Group title="Kapsam" count={state.scope ? 1 : 0} onClear={() => update({ scope: undefined })} storageKey="talep-kapsam">
        <Check id={`${idPrefix}-scope-all`} label="Hepsi" checked={!state.scope} onChange={() => update({ scope: undefined })} type="radio" name={radioName("scope")} />
        <Check id={`${idPrefix}-scope-yurtici`} label="Yurtiçi" count={facets.scope.yurtici} checked={state.scope === "yurtici"} onChange={() => update({ scope: "yurtici" })} type="radio" name={radioName("scope")} />
        <Check id={`${idPrefix}-scope-uluslararasi`} label="Uluslararası" count={facets.scope.uluslararasi} checked={state.scope === "uluslararasi"} onChange={() => update({ scope: "uluslararasi" })} type="radio" name={radioName("scope")} />
      </Group>

      <Group title="Kapanış" count={state.closing ? 1 : 0} onClear={() => update({ closing: undefined })} storageKey="talep-kapanis">
        <Check id={`${idPrefix}-closing-all`} label="Hepsi" checked={!state.closing} onChange={() => update({ closing: undefined })} type="radio" name={radioName("closing")} />
        {CLOSING_WINDOWS.map((d) => (
          <Check
            key={d}
            id={`${idPrefix}-closing-${d}`}
            label={`${d} gün içinde`}
            count={facets.closing[d]}
            checked={state.closing === d}
            onChange={() => update({ closing: d })}
            type="radio"
            name={radioName("closing")}
          />
        ))}
      </Group>

      <Group title="Alıcı" count={state.buyers.length} onClear={() => update({ buyers: [] })} storageKey="talep-alici">
        <ShowMore
          items={facets.buyers}
          selected={state.buyers}
          idPrefix={`${idPrefix}-buyer`}
          onToggle={(k, on) => update((s) => ({ ...s, buyers: toggleIn(s.buyers, k, on) }))}
          emptyText="Alıcı adı görünen talep yok"
        />
      </Group>

      <Group title="Alıcı şehri" count={state.cities.length} onClear={() => update({ cities: [] })} storageKey="talep-sehir">
        <ShowMore
          items={facets.cities}
          selected={state.cities}
          idPrefix={`${idPrefix}-city`}
          onToggle={(k, on) => update((s) => ({ ...s, cities: toggleIn(s.cities, k, on) }))}
        />
      </Group>

      <Group title="Para birimi" count={state.currencies.length} onClear={() => update({ currencies: [] })} storageKey="talep-para">
        <ShowMore
          items={facets.currencies}
          selected={state.currencies}
          idPrefix={`${idPrefix}-cur`}
          onToggle={(k, on) => update((s) => ({ ...s, currencies: toggleIn(s.currencies, k, on) }))}
        />
      </Group>

      <Group title="Usul" count={state.format ? 1 : 0} onClear={() => update({ format: undefined })} storageKey="talep-usul">
        <Check id={`${idPrefix}-format-all`} label="Hepsi" checked={!state.format} onChange={() => update({ format: undefined })} type="radio" name={radioName("format")} />
        <Check id={`${idPrefix}-format-teklif`} label="Teklif toplama" count={facets.format.teklif} checked={state.format === "teklif"} onChange={() => update({ format: "teklif" })} type="radio" name={radioName("format")} />
        <Check id={`${idPrefix}-format-pazarlik`} label="Pazarlık" count={facets.format.pazarlik} checked={state.format === "pazarlik"} onChange={() => update({ format: "pazarlik" })} type="radio" name={radioName("format")} />
      </Group>

      <Group title="Yayın tarihi" count={state.period ? 1 : 0} onClear={() => update({ period: undefined })} storageKey="talep-donem">
        <Check id={`${idPrefix}-period-all`} label="Tüm zamanlar" checked={!state.period} onChange={() => update({ period: undefined })} type="radio" name={radioName("period")} />
        {PERIOD_WINDOWS.map((d) => (
          <Check
            key={d}
            id={`${idPrefix}-period-${d}`}
            label={`Son ${d} gün`}
            count={facets.period[d]}
            checked={state.period === d}
            onChange={() => update({ period: d })}
            type="radio"
            name={radioName("period")}
          />
        ))}
      </Group>
    </div>
  );
}

function CategoryGroup({
  facets,
  state,
  update,
  idPrefix,
}: {
  facets: RequestFacets;
  state: RequestFilterState;
  update: Update;
  idPrefix: string;
}) {
  const [q, setQ] = useState("");
  const items = useMemo(() => {
    const t = q.trim().toLocaleLowerCase("tr-TR");
    return facets.categories.filter((c) => !t || c.label.toLocaleLowerCase("tr-TR").includes(t));
  }, [facets.categories, q]);
  return (
    <Group title="Kategori" count={state.categories.length} onClear={() => update({ categories: [] })} storageKey="talep-kategori">
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
      <ShowMore
        items={items}
        selected={state.categories}
        idPrefix={`${idPrefix}-cat`}
        onToggle={(k, on) => update((s) => ({ ...s, categories: toggleIn(s.categories, k, on) }))}
        emptyText="Eşleşen kategori yok"
      />
    </Group>
  );
}

/** Aktif süzgeç çipleri — arama dahil (kutusu hero'da; buradan kaldırılabilsin). */
export function RequestActiveChips({ facets }: { facets: RequestFacets }) {
  const { state, update, clear } = useFilters<RequestFilterState>();
  const chips: FilterChip[] = [];
  const name = (list: { key: string; label: string }[], k: string) => list.find((x) => x.key === k)?.label ?? k;
  if (state.q) chips.push({ key: "q", label: `Arama: "${state.q}"`, onRemove: () => update({ q: undefined }) });
  if (state.status !== "aktif")
    chips.push({ key: "status", label: `Durum: ${STATUS_OPTIONS.find((o) => o.key === state.status)?.label}`, onRemove: () => update({ status: "aktif" }) });
  for (const f of state.fit)
    chips.push({ key: `fit:${f}`, label: FIT_OPTIONS.find((o) => o.key === f)?.label ?? f, onRemove: () => update((s) => ({ ...s, fit: s.fit.filter((x) => x !== f) })) });
  for (const c of state.categories)
    chips.push({ key: `cat:${c}`, label: name(facets.categories, c), onRemove: () => update((s) => ({ ...s, categories: s.categories.filter((x) => x !== c) })) });
  if (state.scope) chips.push({ key: "scope", label: state.scope === "yurtici" ? "Yurtiçi" : "Uluslararası", onRemove: () => update({ scope: undefined }) });
  if (state.closing) chips.push({ key: "closing", label: `${state.closing} gün içinde kapanan`, onRemove: () => update({ closing: undefined }) });
  for (const b of state.buyers)
    chips.push({ key: `buyer:${b}`, label: name(facets.buyers, b), onRemove: () => update((s) => ({ ...s, buyers: s.buyers.filter((x) => x !== b) })) });
  for (const c of state.cities)
    chips.push({ key: `city:${c}`, label: c, onRemove: () => update((s) => ({ ...s, cities: s.cities.filter((x) => x !== c) })) });
  for (const c of state.currencies)
    chips.push({ key: `cur:${c}`, label: c, onRemove: () => update((s) => ({ ...s, currencies: s.currencies.filter((x) => x !== c) })) });
  if (state.format) chips.push({ key: "format", label: state.format === "pazarlik" ? "Pazarlık" : "Teklif toplama", onRemove: () => update({ format: undefined }) });
  if (state.period) chips.push({ key: "period", label: `Son ${state.period} gün`, onRemove: () => update({ period: undefined }) });
  return <FilterChipBar chips={chips} activeCount={activeRequestFilterCount(state)} onClearAll={clear} />;
}

/** Sıralama — masaüstü çipler, mobilde <select>. */
export function RequestSortControl() {
  const { state, update } = useFilters<RequestFilterState>();
  return (
    <>
      <div className="hidden items-center gap-1 text-xs sm:flex">
        <span className="text-zinc-500">Sırala:</span>
        {SORT_OPTIONS.map((o) => {
          const active = o.key === state.sort;
          return (
            <button
              key={o.label}
              type="button"
              aria-pressed={active}
              onClick={() => update({ sort: o.key })}
              className={`rounded-full px-2.5 py-1 font-medium transition ${active ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <label className="text-xs text-zinc-500 sm:hidden">
        <span className="sr-only">Sırala</span>
        <select
          value={state.sort ?? ""}
          onChange={(e) => update({ sort: (e.target.value || undefined) as RequestSort | undefined })}
          className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.label} value={o.key ?? ""}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
