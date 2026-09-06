"use client";

import { Check, FilterChipBar, Group, ShowMore, ShowMoreRadio, type FilterChip } from "./filter-primitives";
import { useFilters } from "./filter-shell";
import { SortBar } from "./sort-bar";
import { activeListingFilterCount, type ListingFilterState } from "@/lib/public/listing-filter-params";
import type { PublicFacets } from "@/lib/public/marketplace-api";

const SCOPE_LABEL = { yurtici: "Yurtiçi", uluslararasi: "Uluslararası" } as const;
const WITHIN: { key: "3" | "7" | "30"; label: string }[] = [
  { key: "3", label: "3 gün içinde" },
  { key: "7", label: "7 gün içinde" },
  { key: "30", label: "30 gün içinde" },
];

/**
 * ALIM TALEBİ SÜZGEÇLERİ (PROMPT 4) — ürün süzgeciyle aynı yapı taşları:
 * Kategori (tek seçim, segment), Şehir (çoklu), Kalan süre (radyo), Kapsam
 * (radyo). Sayaçlar bağlamsal (facet ucu seçili süzgeçleri alır).
 */
export function ListingFilters({ facets, idPrefix }: { facets: PublicFacets; idPrefix: string }) {
  const { state, update } = useFilters<ListingFilterState>();
  const within = facets.within;
  return (
    <div className="space-y-1">
      <Group
        title="Kategori"
        count={state.category ? 1 : 0}
        onClear={() => update({ category: undefined })}
        storageKey="lst-category"
      >
        <ShowMoreRadio
          items={facets.categories.map((c) => ({ key: c.id, label: c.name, count: c.count }))}
          selected={state.category}
          idPrefix={`${idPrefix}-cat`}
          onSelect={(k) => update({ category: state.category === k ? undefined : k })}
          emptyText="Eşleşen kategori yok"
        />
      </Group>
      <Group
        title="Şehir"
        count={state.cities.length}
        onClear={() => update({ cities: [] })}
        storageKey="lst-city"
      >
        <ShowMore
          items={facets.cities.map((c) => ({ key: c.city, label: c.city, count: c.count }))}
          selected={state.cities}
          idPrefix={`${idPrefix}-city`}
          onToggle={(k, on) => update((s) => ({ ...s, cities: on ? [...s.cities, k] : s.cities.filter((x) => x !== k) }))}
        />
      </Group>
      <Group
        title="Kalan süre"
        count={state.within ? 1 : 0}
        onClear={() => update({ within: undefined })}
        storageKey="lst-within"
      >
        {WITHIN.map((w) => (
          <Check
            key={w.key}
            id={`${idPrefix}-within-${w.key}`}
            label={w.label}
            count={within ? within[w.key] : undefined}
            checked={state.within === w.key}
            onChange={() => update({ within: state.within === w.key ? undefined : w.key })}
          />
        ))}
      </Group>
      <Group
        title="Kapsam"
        count={state.scope ? 1 : 0}
        onClear={() => update({ scope: undefined })}
        storageKey="lst-scope"
      >
        {(facets.scopes ?? []).map((s) => {
          const key = s.scope === "domestic" ? "yurtici" : "uluslararasi";
          return (
            <Check
              key={key}
              id={`${idPrefix}-scope-${key}`}
              label={SCOPE_LABEL[key]}
              count={s.count}
              checked={state.scope === key}
              onChange={() => update({ scope: state.scope === key ? undefined : key })}
            />
          );
        })}
      </Group>
    </div>
  );
}

export function ListingActiveChips({ facets }: { facets: PublicFacets }) {
  const { state, update, clear } = useFilters<ListingFilterState>();
  const chips: FilterChip[] = [];
  if (state.category) chips.push({ key: "cat", label: facets.categories.find((c) => c.id === state.category)?.name ?? state.category, onRemove: () => update({ category: undefined }) });
  for (const c of state.cities) chips.push({ key: `c:${c}`, label: c, onRemove: () => update((s) => ({ ...s, cities: s.cities.filter((x) => x !== c) })) });
  if (state.within) chips.push({ key: "w", label: `${state.within} gün içinde`, onRemove: () => update({ within: undefined }) });
  if (state.scope) chips.push({ key: "s", label: SCOPE_LABEL[state.scope], onRemove: () => update({ scope: undefined }) });
  return <FilterChipBar chips={chips} activeCount={activeListingFilterCount(state)} onClearAll={clear} />;
}

export function ListingSortBar() {
  return (
    <SortBar<ListingFilterState>
      options={[
        { value: undefined, label: "Son eklenen" },
        { value: "kapanis", label: "Süresi yaklaşan" },
      ]}
    />
  );
}
