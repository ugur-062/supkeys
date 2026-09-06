"use client";

import { Check, FilterChipBar, Group, ShowMore, type FilterChip } from "./filter-primitives";
import { useFilters } from "./filter-shell";
import { SortBar } from "./sort-bar";
import { activeCompanyFilterCount, type CompanyFilterState } from "@/lib/public/company-filter-params";
import type { PublicDirectoryFacets } from "@/lib/public/marketplace-api";
import { companyActivityLabel } from "@rothern/shared";

/**
 * FİRMA DİZİNİ SÜZGEÇLERİ (PROMPT 4): Firma profili (Doğrulanmış, Ürünü olan,
 * Gold üye), Faaliyet tipi (çoklu), Şehir (çoklu), Kategori (çoklu, firma
 * beyanı). Sayaçlar bağlamsal. Sertifika süzgeci veri modeli çipleşmediği
 * için yok (serbest metin dizi).
 */
export function CompanyFilters({ facets, idPrefix }: { facets: PublicDirectoryFacets; idPrefix: string }) {
  const { state, update } = useFilters<CompanyFilterState>();
  const profileCount = (state.verified ? 1 : 0) + (state.hasProducts ? 1 : 0) + (state.gold ? 1 : 0);
  return (
    <div className="space-y-1">
      <Group
        title="Firma profili"
        count={profileCount}
        onClear={() => update({ verified: false, hasProducts: false, gold: false })}
        storageKey="dir-profile"
      >
        <Check id={`${idPrefix}-verified`} label="Doğrulanmış" count={facets.verified} checked={state.verified} onChange={(on) => update({ verified: on })} />
        <Check id={`${idPrefix}-products`} label="Ürünü olan" count={facets.withProducts} checked={state.hasProducts} onChange={(on) => update({ hasProducts: on })} />
        <Check id={`${idPrefix}-gold`} label="Gold Üye" count={facets.gold ?? 0} checked={state.gold} onChange={(on) => update({ gold: on })} />
      </Group>
      <Group
        title="Faaliyet tipi"
        count={state.activities.length}
        onClear={() => update({ activities: [] })}
        storageKey="dir-activity"
      >
        <ShowMore
          items={facets.activities.map((a) => ({ key: a.activity, label: companyActivityLabel(a.activity), count: a.count }))}
          selected={state.activities}
          idPrefix={`${idPrefix}-act`}
          onToggle={(k, on) => update((s) => ({ ...s, activities: on ? [...s.activities, k] : s.activities.filter((x) => x !== k) }))}
        />
      </Group>
      <Group title="Şehir" count={state.cities.length} onClear={() => update({ cities: [] })} storageKey="dir-city">
        <ShowMore
          items={facets.cities.map((c) => ({ key: c.city, label: c.city, count: c.count }))}
          selected={state.cities}
          idPrefix={`${idPrefix}-city`}
          onToggle={(k, on) => update((s) => ({ ...s, cities: on ? [...s.cities, k] : s.cities.filter((x) => x !== k) }))}
        />
      </Group>
      <Group
        title="Kategori"
        count={state.categories.length}
        onClear={() => update({ categories: [] })}
        storageKey="dir-category"
      >
        <ShowMore
          items={(facets.categories ?? []).map((c) => ({ key: c.id, label: c.name, count: c.count }))}
          selected={state.categories}
          idPrefix={`${idPrefix}-cat`}
          onToggle={(k, on) => update((s) => ({ ...s, categories: on ? [...s.categories, k] : s.categories.filter((x) => x !== k) }))}
        />
      </Group>
    </div>
  );
}

export function CompanyActiveChips({ facets }: { facets: PublicDirectoryFacets }) {
  const { state, update, clear } = useFilters<CompanyFilterState>();
  const chips: FilterChip[] = [];
  if (state.verified) chips.push({ key: "v", label: "Doğrulanmış", onRemove: () => update({ verified: false }) });
  if (state.hasProducts) chips.push({ key: "p", label: "Ürünü olan", onRemove: () => update({ hasProducts: false }) });
  if (state.gold) chips.push({ key: "g", label: "Gold Üye", onRemove: () => update({ gold: false }) });
  for (const a of state.activities) chips.push({ key: `a:${a}`, label: companyActivityLabel(a), onRemove: () => update((s) => ({ ...s, activities: s.activities.filter((x) => x !== a) })) });
  for (const c of state.cities) chips.push({ key: `c:${c}`, label: c, onRemove: () => update((s) => ({ ...s, cities: s.cities.filter((x) => x !== c) })) });
  for (const k of state.categories) chips.push({ key: `k:${k}`, label: facets.categories?.find((c) => c.id === k)?.name ?? k, onRemove: () => update((s) => ({ ...s, categories: s.categories.filter((x) => x !== k) })) });
  return <FilterChipBar chips={chips} activeCount={activeCompanyFilterCount(state)} onClearAll={clear} />;
}

export function CompanySortBar() {
  return (
    <SortBar<CompanyFilterState>
      options={[
        { value: undefined, label: "Uygunluk" },
        { value: "ad", label: "A-Z" },
        { value: "urun", label: "En çok ürün" },
        { value: "yeni", label: "En yeni" },
      ]}
    />
  );
}
