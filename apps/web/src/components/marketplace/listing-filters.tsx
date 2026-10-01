"use client";

import { countryDisplayName, useCityLabel } from "@/i18n/domain";

import { useLocale, useTranslations } from "next-intl";

import { Check, FilterChipBar, Group, ShowMore, ShowMoreRadio, type FilterChip } from "./filter-primitives";
import { useFilters } from "./filter-shell";
import { SortBar } from "./sort-bar";
import { activeListingFilterCount, type ListingFilterState } from "@/lib/public/listing-filter-params";
import { hasListingCountryFacet, listingCountryOptions } from "@/lib/public/listing-country-facet";
import type { PublicFacets } from "@/lib/public/marketplace-api";
import { CountryCombobox } from "@/components/ui/country-combobox";
import { registrationCountries } from "@rothern/shared";

/** Seçicide yalnız kayda açık ülkeler — kapalı listedeki ülkeden tedarikçi olamaz. */
const SUPPLIER_COUNTRY_CODES = registrationCountries().map((c) => c.code);

const WITHIN_KEYS = ["3", "7", "30"] as const;

/**
 * ALIM TALEBİ SÜZGEÇLERİ (PROMPT 4) — ürün süzgeciyle aynı yapı taşları:
 * Kategori (tek seçim, segment), Şehir (çoklu), Kalan süre (radyo), Kapsam
 * (radyo). Sayaçlar bağlamsal (facet ucu seçili süzgeçleri alır).
 */
export function ListingFilters({ facets, idPrefix }: { facets: PublicFacets; idPrefix: string }) {
  const { state, update } = useFilters<ListingFilterState>();
  const cityLabel = useCityLabel();
  const t = useTranslations("web.marketplace.filters");
  const locale = useLocale();
  const WITHIN = WITHIN_KEYS.map((key) => ({ key, label: t("withinDays", { n: Number(key) }) }));
  const within = facets.within;
  return (
    <div className="space-y-1">
      <Group
        title={t("category")}
        count={state.category ? 1 : 0}
        onClear={() => update({ category: undefined })}
        storageKey="lst-category"
      >
        <ShowMoreRadio
          items={facets.categories.map((c) => ({ key: c.id, label: c.name, count: c.count }))}
          selected={state.category}
          idPrefix={`${idPrefix}-cat`}
          onSelect={(k) => update({ category: state.category === k ? undefined : k })}
          emptyText={t("noCategory")}
          labelFor={(k) => (facets.selectedCategory?.id === k ? facets.selectedCategory.name : k)}
        />
      </Group>
      <Group
        title={t("city")}
        count={state.cities.length}
        onClear={() => update({ cities: [] })}
        storageKey="lst-city"
      >
        <ShowMore
          items={facets.cities.map((c) => ({ key: c.city, label: c.name ?? cityLabel(c.city), count: c.count }))}
          selected={state.cities}
          idPrefix={`${idPrefix}-city`}
          onToggle={(k, on) => update((s) => ({ ...s, cities: on ? [...s.cities, k] : s.cities.filter((x) => x !== k) }))}
          labelFor={cityLabel}
        />
      </Group>
      <Group
        title={t("remaining")}
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
      {/* Görünürlük ülkesi (2026-09-21; seçenek kuralı 2026-09-27): "bu
          ülkedeki tedarikçi teklif verebilir" — ürün dizinindeki "Ülke"
          (satıcı ülkesi) ile AYNI soru değil, etiket de ayrı. Her ülke
          seçilebilir (`listingCountryOptions`): liste açıkça hedeflenen
          ülkeleri, seçici kalan her ülkeyi verir; tüm ülkelere açık talepler
          her seçimde kalır. */}
      {hasListingCountryFacet(facets, state.country) ? (
        <Group
          title={t("listingCountry")}
          count={state.country ? 1 : 0}
          onClear={() => update({ country: undefined })}
          storageKey="lst-country"
        >
          {listingCountryOptions(facets, state.country).map((c) => (
            <Check
              key={c.code}
              id={`${idPrefix}-country-${c.code}`}
              label={countryDisplayName(c.code, locale)}
              count={c.count}
              checked={state.country === c.code}
              onChange={() => update({ country: state.country === c.code ? undefined : c.code })}
            />
          ))}
          <div className="mt-2 px-2">
            <CountryCombobox
              value=""
              onChange={(code) => update({ country: code })}
              codes={SUPPLIER_COUNTRY_CODES}
              ariaLabel={t("listingCountryPick")}
              id={`${idPrefix}-country-pick`}
            />
            <p className="mt-1.5 text-xs text-zinc-500">{t("listingCountryHint")}</p>
          </div>
        </Group>
      ) : null}
    </div>
  );
}

export function ListingActiveChips({ facets }: { facets: PublicFacets }) {
  const t = useTranslations("web.marketplace.filters");
  const cityLabel = useCityLabel();
  const locale = useLocale();
  const { state, update, clear } = useFilters<ListingFilterState>();
  const chips: FilterChip[] = [];
  if (state.category) chips.push({ key: "cat", label: facets.categories.find((c) => c.id === state.category)?.name ?? facets.selectedCategory?.name ?? state.category, onRemove: () => update({ category: undefined }) });
  for (const c of state.cities) chips.push({ key: `c:${c}`, label: facets.cities.find((f) => f.city === c)?.name ?? cityLabel(c), onRemove: () => update((s) => ({ ...s, cities: s.cities.filter((x) => x !== c) })) });
  if (state.within) chips.push({ key: "w", label: t("withinDays", { n: Number(state.within) }), onRemove: () => update({ within: undefined }) });
  if (state.country) chips.push({ key: "s", label: countryDisplayName(state.country, locale), onRemove: () => update({ country: undefined }) });
  return <FilterChipBar chips={chips} activeCount={activeListingFilterCount(state)} onClearAll={clear} />;
}

export function ListingSortBar() {
  const t = useTranslations("web.marketplace.filters");
  return (
    <SortBar<ListingFilterState>
      options={[
        { value: undefined, label: t("sortRecent") },
        { value: "kapanis", label: t("sortClosing") },
      ]}
    />
  );
}
