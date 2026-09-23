"use client";

import { useActivityLabel, useCityLabel } from "@/i18n/domain";

import { useTranslations } from "next-intl";

import { Check, FilterChipBar, Group, ShowMore, type FilterChip } from "./filter-primitives";
import { useFilters } from "./filter-shell";
import { SortBar } from "./sort-bar";
import { activeCompanyFilterCount, type CompanyFilterState } from "@/lib/public/company-filter-params";
import type { PublicDirectoryFacets } from "@/lib/public/marketplace-api";
import { useCategoriesByIds } from "@/hooks/use-categories";
import { useMemo } from "react";

/**
 * Seçili kategori kodlarının ADI. Facet listesi yalnız FİRMASI OLAN
 * kategorileri taşır; ürün sekmesinden 0 firmalı bir kodla geçince ad orada
 * yoktur ve çip/süzgeç ham kodu ("42181500") basardı. Eksik kodlar herkese
 * açık `categories/by-ids` ucundan çözülür (ziyaretçide de çalışır). Çözülene
 * dek kod yerine "…" yazılır — kod kullanıcıya hiç gösterilmez.
 */
function useCategoryNames(selected: string[], facets: PublicDirectoryFacets): (id: string) => string {
  const facetName = useMemo(() => new Map((facets.categories ?? []).map((c) => [c.id, c.name])), [facets.categories]);
  const missing = useMemo(() => selected.filter((id) => !facetName.has(id)), [selected, facetName]);
  const resolved = useCategoriesByIds(missing);
  return (id) => facetName.get(id) ?? resolved.data?.find((c) => c.id === id)?.nameTr ?? "…";
}

/**
 * FİRMA DİZİNİ SÜZGEÇLERİ (PROMPT 4): Firma profili (Doğrulanmış, Ürünü olan,
 * Gold üye), Faaliyet tipi (çoklu), Şehir (çoklu), Kategori (çoklu, firma
 * beyanı). Sayaçlar bağlamsal. Sertifika süzgeci veri modeli çipleşmediği
 * için yok (serbest metin dizi).
 */
export function CompanyFilters({
  facets,
  idPrefix,
  showConnection = false,
}: {
  facets: PublicDirectoryFacets;
  idPrefix: string;
  /** Bağlantı durumu grubu — YALNIZ panelde (ziyaretçinin bağlantısı yok). */
  showConnection?: boolean;
}) {
  const t = useTranslations("web.marketplace.filters");
  const cityLabel = useCityLabel();
  const activityLabel = useActivityLabel();
  const { state, update } = useFilters<CompanyFilterState>();
  const profileCount = (state.verified ? 1 : 0) + (state.hasProducts ? 1 : 0) + (state.gold ? 1 : 0);
  const categoryName = useCategoryNames(state.categories, facets);
  // Seçili ama listede olmayan (0 firmalı) kategori de adıyla ve tikli görünsün
  // ki kullanıcı kenar süzgecinden kaldırabilsin (ürün süzgeciyle aynı kalıp).
  const categoryItems = [
    ...state.categories.filter((k) => !(facets.categories ?? []).some((c) => c.id === k)).map((k) => ({ key: k, label: categoryName(k), count: 0 })),
    ...(facets.categories ?? []).map((c) => ({ key: c.id, label: c.name, count: c.count })),
  ];
  return (
    <div className="space-y-3">
      {showConnection ? (
        <Group
          title={t("connection")}
          count={state.connection ? 1 : 0}
          onClear={() => update({ connection: undefined })}
          storageKey="dir-connection"
        >
          {/* Tek seçim: "bağlı" ve "bağlı değil" birlikte anlamsız olurdu. */}
          <Check
            id={`${idPrefix}-conn-yes`}
            type="radio"
            label={t("connected")}
            checked={state.connection === "bagli"}
            onChange={(on) => update({ connection: on ? "bagli" : undefined })}
          />
          <Check
            id={`${idPrefix}-conn-no`}
            type="radio"
            label={t("notConnected")}
            checked={state.connection === "yeni"}
            onChange={(on) => update({ connection: on ? "yeni" : undefined })}
          />
        </Group>
      ) : null}
      <Group
        title={t("companyProfile")}
        count={profileCount}
        onClear={() => update({ verified: false, hasProducts: false, gold: false })}
        storageKey="dir-profile"
      >
        <Check id={`${idPrefix}-verified`} label={t("verified")} count={facets.verified} checked={state.verified} onChange={(on) => update({ verified: on })} />
        <Check id={`${idPrefix}-products`} label={t("hasProducts")} count={facets.withProducts} checked={state.hasProducts} onChange={(on) => update({ hasProducts: on })} />
        <Check id={`${idPrefix}-gold`} label={t("goldMember")} count={facets.gold ?? 0} checked={state.gold} onChange={(on) => update({ gold: on })} />
      </Group>
      <Group
        title={t("activityType")}
        count={state.activities.length}
        onClear={() => update({ activities: [] })}
        storageKey="dir-activity"
      >
        <ShowMore
          items={facets.activities.map((a) => ({ key: a.activity, label: activityLabel(a.activity), count: a.count }))}
          selected={state.activities}
          idPrefix={`${idPrefix}-act`}
          onToggle={(k, on) => update((s) => ({ ...s, activities: on ? [...s.activities, k] : s.activities.filter((x) => x !== k) }))}
        />
      </Group>
      <Group title={t("city")} count={state.cities.length} onClear={() => update({ cities: [] })} storageKey="dir-city">
        <ShowMore
          items={facets.cities.map((c) => ({ key: c.city, label: cityLabel(c.city), count: c.count }))}
          selected={state.cities}
          idPrefix={`${idPrefix}-city`}
          onToggle={(k, on) => update((s) => ({ ...s, cities: on ? [...s.cities, k] : s.cities.filter((x) => x !== k) }))}
        />
      </Group>
      <Group
        title={t("category")}
        count={state.categories.length}
        onClear={() => update({ categories: [] })}
        storageKey="dir-category"
      >
        <ShowMore
          items={categoryItems}
          selected={state.categories}
          idPrefix={`${idPrefix}-cat`}
          onToggle={(k, on) => update((s) => ({ ...s, categories: on ? [...s.categories, k] : s.categories.filter((x) => x !== k) }))}
        />
      </Group>
    </div>
  );
}

export function CompanyActiveChips({ facets }: { facets: PublicDirectoryFacets }) {
  const t = useTranslations("web.marketplace.filters");
  const cityLabel = useCityLabel();
  const activityLabel = useActivityLabel();
  const { state, update, clear } = useFilters<CompanyFilterState>();
  const categoryName = useCategoryNames(state.categories, facets);
  const chips: FilterChip[] = [];
  if (state.verified) chips.push({ key: "v", label: t("verified"), onRemove: () => update({ verified: false }) });
  if (state.hasProducts) chips.push({ key: "p", label: t("hasProducts"), onRemove: () => update({ hasProducts: false }) });
  if (state.gold) chips.push({ key: "g", label: t("goldMember"), onRemove: () => update({ gold: false }) });
  if (state.connection)
    chips.push({
      key: "conn",
      label: state.connection === "bagli" ? t("connected") : t("notConnected"),
      onRemove: () => update({ connection: undefined }),
    });
  for (const a of state.activities) chips.push({ key: `a:${a}`, label: activityLabel(a), onRemove: () => update((s) => ({ ...s, activities: s.activities.filter((x) => x !== a) })) });
  for (const c of state.cities) chips.push({ key: `c:${c}`, label: cityLabel(c), onRemove: () => update((s) => ({ ...s, cities: s.cities.filter((x) => x !== c) })) });
  for (const k of state.categories) chips.push({ key: `k:${k}`, label: categoryName(k), onRemove: () => update((s) => ({ ...s, categories: s.categories.filter((x) => x !== k) })) });
  return <FilterChipBar chips={chips} activeCount={activeCompanyFilterCount(state)} onClearAll={clear} />;
}

export function CompanySortBar() {
  const t = useTranslations("web.marketplace.filters");
  return (
    <SortBar<CompanyFilterState>
      options={[
        { value: undefined, label: t("sortRelevance") },
        { value: "ad", label: t("sortAZ") },
        { value: "urun", label: t("sortMostProducts") },
        { value: "yeni", label: t("sortNewest") },
      ]}
    />
  );
}
