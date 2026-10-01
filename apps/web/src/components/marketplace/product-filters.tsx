"use client";

import { countryDisplayName, useActivityLabel, useCityLabel } from "@/i18n/domain";
import type { Locale } from "@rothern/i18n";
import { citySlug, foldSearchText } from "@rothern/shared";
import { searchGeoCities, type GeoCity } from "@/lib/public/geo-client";
import { useGeoCityName, useGeoCityNames } from "./use-geo-city-name";

import { useFormatter, useLocale, useTranslations } from "next-intl";

import { useFilterAccent, useFilters } from "./filter-shell";
import type { ProductFacets } from "@/lib/public/marketplace-api";
import { PRICE_LIMIT, activeFilterCount, type ProductFilterState } from "@/lib/public/product-filter-params";
import { readViewPreference, writeViewPreference } from "@/lib/public/view-preference";
import { ListBulletIcon, MagnifyingGlassIcon, Squares2X2Icon, XMarkIcon } from "@heroicons/react/20/solid";
import {
  BadgeCheck,
  Boxes,
  Building2,
  FolderTree,
  MapPin,
  ScrollText,
  SlidersHorizontal,
  Tag,
  Users,
  Globe2,
} from "lucide-react";
import { ActivityIcon } from "./activity-icons";
import { CURRENCIES, affixCurrency, currencySymbol } from "@/lib/tenders/labels";
import {
  Check,
  FilterChipBar,
  FilterSearch,
  Group,
  PriceHistogram,
  SHOW,
  ShowMore,
  ShowMoreRadio,
  type FilterChip,
} from "./filter-primitives";
import {
  COMPANY_ACTIVITIES,
  EMPLOYEE_BUCKETS,
  RADIUS_OPTIONS,
  employeeBucketLabel,
  resolveProvince } from "@rothern/shared";

/**
 * "Min. sipariş" ön ayarları — API'deki `MOQ_BUCKETS` ile AYNI sayılar
 * olmalı, yoksa "≤100 (12)" yazan kutucuk 9 ürün gösterir. Sayı üç yerde
 * (API where, API sayaç, buradaki etiket) aynı olduğu sürece tutarlı.
 */
const MOQ_PRESETS = [10, 100, 1000] as const;
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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
  const t = useTranslations("web.marketplace.filters");
  const activityLabel = useActivityLabel();
  const { state, update } = useFilters();
  return (
    <div className="space-y-3" data-filters>
      <CategoryGroup facets={facets} state={state} update={update} idPrefix={idPrefix} />

      <Group
        title={t("companyProfile")}
        icon={<BadgeCheck className="size-4" />}
        count={(state.verified ? 1 : 0) + (state.fastReply ? 1 : 0)}
        onClear={() => update({ verified: false, fastReply: false })}
        storageKey="profil"
      >
        <Check
          id={`${idPrefix}-verified`}
          label={t("verified")}
          icon={<BadgeCheck className="size-4 text-emerald-600" />}
          count={facets.verified}
          checked={state.verified}
          onChange={(v) => update({ verified: v })}
        />
        {/* Ölçüsü olmayan firma bu süzgece GİRMEZ ("yavaş" saymıyoruz).
            Kimse ölçülmemişse sayaç 0 olur ve `Check` seçeneği kendiliğinden
            devre dışı bırakır — kırık değil, "henüz veri yok" görünür. */}
        <Check
          id={`${idPrefix}-fast`}
          label={t("fastReply")}
          count={facets.fastReply ?? 0}
          checked={state.fastReply}
          onChange={(v) => update({ fastReply: v })}
        />
      </Group>

      <Group
        title={t("supplierType")}
        icon={<Building2 className="size-4" />}
        count={state.activities.length}
        onClear={() => update({ activities: [] })}
        storageKey="faaliyet"
      >
        {/* TÜM tipler listelenir, yalnız sonuçta geçenler değil (2026-09-07).
            Eskiden `facets.activities` doğrudan basılıyordu: veride yalnız
            2 tip olduğu için kullanıcı diğer 3'ün var olduğunu bilmiyordu.
            Sayısı 0 olanı `Check` zaten soluklaştırıp devre dışı bırakıyor —
            "yok" ile "hiç tanımlı değil" arasındaki fark böyle görünür. */}
        <ShowMore
          items={COMPANY_ACTIVITIES.map((a) => ({
            key: a.code,
            label: activityLabel(a.code),
            // İkon SÜSLEME: anlam etiketin kendisinde; `ActivityIcon`
            // tanımadığı kodda null döner, satır ikonsuz çizilir.
            icon: <ActivityIcon code={a.code} />,
            count: facets.activities.find((f) => f.activity === a.code)?.count ?? 0,
          }))}
          selected={state.activities}
          idPrefix={`${idPrefix}-act`}
          onToggle={(k, on) => update((s) => ({ ...s, activities: on ? [...s.activities, k] : s.activities.filter((x) => x !== k) }))}
        />
      </Group>

      <LocationGroup facets={facets} state={state} update={update} idPrefix={idPrefix} />
      <CountryGroup facets={facets} state={state} update={update} idPrefix={idPrefix} />

      <CertificationGroup facets={facets} state={state} update={update} idPrefix={idPrefix} />

      <Group
        title={t("employees")}
        icon={<Users className="size-4" />}
        count={state.employees.length}
        onClear={() => update({ employees: [] })}
        storageKey="calisan"
        defaultOpen={false}
      >
        <ShowMore
          items={EMPLOYEE_BUCKETS.map((b) => ({
            key: String(b.key),
            label: b.label,
            count: facets.employees?.find((e) => e.key === b.key)?.count ?? 0,
          }))}
          selected={state.employees.map(String)}
          idPrefix={`${idPrefix}-emp`}
          onToggle={(k, on) =>
            update((s) => ({
              ...s,
              employees: on ? [...s.employees, Number(k)] : s.employees.filter((x) => x !== Number(k)),
            }))
          }
        />
      </Group>

      <MoqGroup facets={facets} state={state} update={update} idPrefix={idPrefix} />

      <PriceGroup facets={facets} state={state} update={update} idPrefix={idPrefix} />

      {facets.attributes.map((a) => (
        <Group
          key={a.key}
          title={a.unit ? `${a.nameTr} (${a.unit})` : a.nameTr}
          icon={<SlidersHorizontal className="size-4" />}
          count={state.attrs.filter((x) => x.startsWith(`${a.key}:`)).length}
          onClear={() => update((s) => ({ ...s, attrs: s.attrs.filter((x) => !x.startsWith(`${a.key}:`)) }))}
          storageKey={`attr-${a.key}`}
        >
          <ShowMore
            items={a.values.map((v) => ({ key: `${a.key}:${v.value}`, label: v.label ?? v.value, count: v.count }))}
            selected={state.attrs}
            idPrefix={`${idPrefix}-attr-${a.key}`}
            onToggle={(k, on) => update((s) => ({ ...s, attrs: on ? [...s.attrs, k] : s.attrs.filter((x) => x !== k) }))}
          />
        </Group>
      ))}

      <ClearAllButton />
    </div>
  );
}

/**
 * "TÜM FİLTRELERİ SIFIRLA" — rayın SONUNDA (Europages kalıbı, 2026-09-07).
 *
 * Çip şeridindeki "Tümünü temizle" listenin üstünde duruyor; ray dokuz grup
 * boyunca aşağı inen kullanıcıyı oraya geri götürmek gezinme borcuydu.
 * Aktif süzgeç yokken düğme YİNE ÇİZİLİR ama devre dışı: yeri sabit kalsın,
 * ray her sonuçta aynı yükseklikte bitsin (kullanıcı "kayboldu" sanmasın).
 *
 * `clear` tek kaynak `clearProductFilters`: süzgeçler gider, ARAMA ve
 * GÖRÜNÜM tercihleri (sıralama, sayfa başına) kalır.
 */
function ClearAllButton() {
  const t = useTranslations("web.marketplace.filters");
  const { activeCount, clear } = useFilters();
  return (
    <button
      type="button"
      onClick={clear}
      disabled={activeCount === 0}
      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
    >
      {t("resetAll")}
      {activeCount > 0 ? <span className="tnum ml-1 text-zinc-500">({activeCount})</span> : null}
    </button>
  );
}





/**
 * KONUM — il çoklu seçim (arama kutulu) + "Yakınımda" yarıçapı.
 *
 * Yarıçap İL MERKEZLERİ arasından hesaplanır (`tr-provinces.ts`); firmanın
 * kendi koordinatı yok. Grubun altındaki açıklama bunu AÇIKÇA yazar —
 * kullanıcı "25 km" seçip komşu ili görünce sistemin bozuk olduğunu
 * sanmasın. En küçük seçenek 25 km: 10 km il merkezli veride "yalnız o il"
 * demekti.
 *
 * İl seçimi ile yarıçap birlikte seçilirse İKİSİ DE uygulanır (kesişim).
 */
function LocationGroup({
  facets,
  state,
  update,
  idPrefix,
}: {
  facets: ProductFacets;
  state: ProductFilterState;
  update: (p: Partial<ProductFilterState> | ((s: ProductFilterState) => ProductFilterState)) => void;
  idPrefix: string;
}) {
  const t = useTranslations("web.marketplace.filters");
  const [q, setQ] = useState("");
  const cityLabel = useCityLabel();
  const fold = foldSearchText;
  // Dünya şehir listesi (2026-09-27): değer kalıcı adres, ad API'den okuyucunun
  // dilinde (`name`); eski API yanıtında ad yoksa Türk il adı çevrilir.
  const label = (c: ProductFacets["cities"][number]) => c.name ?? cityLabel(c.city);
  const items = facets.cities
    .filter((c) => !q || fold(c.city).includes(fold(q)) || fold(label(c)).includes(fold(q)) || state.cities.includes(c.city))
    .map((c) => ({ key: c.city, label: label(c), count: c.count }));
  return (
    // "Yakınımda" da bu grubun süzgeci (arayüz testi D-321): yalnız o seçiliyken
    // başlıkta sayaç ve "Temizle" yoktu.
    <Group
      title={t("location")}
      icon={<MapPin className="size-4" />}
      count={state.cities.length + (state.near && state.radius ? 1 : 0)}
      onClear={() => update({ cities: [], near: undefined, radius: undefined })}
      storageKey="sehir"
    >
      {facets.cities.length > SHOW ? (
        <FilterSearch id={`${idPrefix}-city-q`} value={q} onChange={setQ} placeholder={t("citySearch")} />
      ) : null}
      <ShowMore
        items={items}
        selected={state.cities}
        idPrefix={`${idPrefix}-city`}
        onToggle={(k, on) => update((s) => ({ ...s, cities: on ? [...s.cities, k] : s.cities.filter((x) => x !== k) }))}
        emptyText={t("noCity")}
      />
      <NearbyControls state={state} update={update} idPrefix={idPrefix} />
    </Group>
  );
}

/**
 * "Yakınımda": merkez + yarıçap kaydırıcısı — DÜNYA GENELİ (2026-09-27).
 * Merkez dünya şehir listesinden aranır (yazarken öneri); Türk il adı ve Türk
 * posta kodu eskisi gibi doğrudan çözülür. Süzgeç değeri şehrin kalıcı adresi.
 */
function NearbyControls({
  state,
  update,
  idPrefix,
}: {
  state: ProductFilterState;
  update: (p: Partial<ProductFilterState> | ((s: ProductFilterState) => ProductFilterState)) => void;
  idPrefix: string;
}) {
  const t = useTranslations("web.marketplace.filters");
  const locale = useLocale() as Locale;
  const currentName = useGeoCityName(state.near);
  const [text, setText] = useState("");
  const [options, setOptions] = useState<GeoCity[]>([]);
  const [open, setOpen] = useState(false);
  // Kullanıcı seçili şehri düzenlerken süzgeci kendisi kaldırdı mı? O zaman
  // near'ın düşmesi DIŞ değişim değildir — kutudaki metin silinmez (derin
  // denetim S078: "Bursa" → "Burs" yazınca kutu boşalıyordu).
  const clearedByTypingRef = useRef(false);
  // Durumdan kutuya: yalnız dışarıdan gelen değişimde (bağlantı, çip kaldırma).
  // İşaret near yeniden dolana dek kalır: `useGeoCityName` adı kendi durumunda
  // tuttuğundan near düştükten bir render SONRA '' olur; ilk atlamada işareti
  // sıfırlamak bu ikinci geçişte kutuyu yine boşaltıyordu.
  useEffect(() => {
    if (!state.near) {
      if (!clearedByTypingRef.current) setText("");
      return;
    }
    clearedByTypingRef.current = false;
    setText(currentName);
  }, [state.near, currentName]);
  // Öneri: yazılan metin seçili adla aynı değilse (250 ms gecikmeyle).
  useEffect(() => {
    const q = text.trim();
    if (!open || q.length < 2 || (state.near && q === currentName)) {
      setOptions([]);
      return;
    }
    let alive = true;
    const h = setTimeout(() => {
      void searchGeoCities(q, { locale, limit: 6 }).then((r) => alive && setOptions(r));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [text, open, state.near, currentName, locale]);
  const radius = state.radius ?? 100;
  const accent = useFilterAccent();
  const choose = (slug: string) => {
    clearedByTypingRef.current = false;
    setOpen(false);
    setOptions([]);
    update({ near: slug, radius });
  };
  // Türk posta kodu / il adı doğrudan (eski davranış; öneri beklemeden).
  const province = resolveProvince(text);
  return (
    <div className="mt-3 border-t border-zinc-100 px-2 pt-3">
      <p className="mb-1.5 text-xs font-semibold text-zinc-600">{t("nearMe")}</p>
      <input
        id={`${idPrefix}-near`}
        value={text}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          if (/^\d{5}$/.test(e.target.value.trim()) && resolveProvince(e.target.value)) {
            choose(citySlug(resolveProvince(e.target.value)!.name));
          } else if (state.near && e.target.value !== currentName) {
            clearedByTypingRef.current = true;
            update({ near: undefined, radius: undefined });
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (options[0]) choose(options[0].slug);
            else if (province) choose(citySlug(province.name));
          }
        }}
        placeholder={t("nearPlaceholder")}
        aria-label={t("nearAria")}
        autoComplete="off"
        className="h-9 w-full rounded-lg border border-zinc-200 px-2 text-sm text-zinc-900 outline-none focus:border-zinc-900"
      />
      {options.length > 0 ? (
        <ul className="mt-1 overflow-hidden rounded-lg border border-zinc-200 bg-white text-sm" role="listbox" aria-label={t("nearAria")}>
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                role="option"
                aria-selected={state.near === o.slug}
                onClick={() => choose(o.slug)}
                className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-zinc-100"
              >
                <span className="truncate">{o.name}</span>
                <span className="shrink-0 text-[11px] text-zinc-500">{countryDisplayName(o.countryCode, locale)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {text.trim().length >= 3 && !state.near && !options.length && !province ? (
        <p className="mt-1 text-[11px] text-amber-700">{t("nearNotFound")}</p>
      ) : null}
      <label className="mt-2 block text-[11px] text-zinc-500" htmlFor={`${idPrefix}-radius`}>
        {t("radius")} <span className="tnum font-medium text-zinc-700">{t("radiusKm", { radius })}</span>
      </label>
      <input
        id={`${idPrefix}-radius`}
        type="range"
        min={0}
        max={RADIUS_OPTIONS.length - 1}
        step={1}
        value={Math.max(0, RADIUS_OPTIONS.indexOf(radius as (typeof RADIUS_OPTIONS)[number]))}
        onChange={(e) => state.near && update({ near: state.near, radius: RADIUS_OPTIONS[Number(e.target.value)]! })}
        disabled={!state.near}
        className={`mt-1 w-full disabled:opacity-40 ${
          accent === "blue" ? "accent-blue-600" : "accent-zinc-950"
        }`}
      />
      <p className="tnum flex justify-between text-[10px] text-zinc-500">
        {RADIUS_OPTIONS.map((r) => (
          <span key={r}>{r}</span>
        ))}
      </p>
      {state.near ? (
        <p className="mt-1 text-[11px] text-zinc-500">
          {t("radiusHint", { name: currentName, radius })}
        </p>
      ) : null}
    </div>
  );
}

/**
 * SATICI ÜLKESİ (2026-09-27) — facet'ten dinamik: yalnız ürünü olan ülkeler,
 * ekranın dilinde ad. Çoklu seçim (OR).
 */
function CountryGroup({
  facets,
  state,
  update,
  idPrefix,
}: {
  facets: ProductFacets;
  state: ProductFilterState;
  update: (p: Partial<ProductFilterState> | ((s: ProductFilterState) => ProductFilterState)) => void;
  idPrefix: string;
}) {
  const t = useTranslations("web.marketplace.filters");
  const locale = useLocale() as Locale;
  const countries = facets.countries ?? [];
  if (countries.length < 2 && state.countries.length === 0) return null;
  const items = countries.map((c) => ({ key: c.country, label: countryDisplayName(c.country, locale), count: c.count }));
  return (
    <Group title={t("sellerCountry")} icon={<Globe2 className="size-4" />} count={state.countries.length} onClear={() => update({ countries: [] })} storageKey="ulke">
      <ShowMore
        items={items}
        selected={state.countries}
        idPrefix={`${idPrefix}-country`}
        onToggle={(k, on) => update((s) => ({ ...s, countries: on ? [...s.countries, k] : s.countries.filter((x) => x !== k) }))}
        emptyText={t("noCountry")}
      />
    </Group>
  );
}

/**
 * SERTİFİKALAR — firmaların kendi yazdığı serbest metin, facet'ten dinamik.
 *
 * Liste kürasyonlu DEĞİL: sabit bir "ISO 9001 / CE / FSC" listesi basmak,
 * veride olmayan seçenekleri vaat eder ve veride OLAN başkalarını gizlerdi.
 * Aynı sebeple normalize de edilmez — süzgeç ham dizeyle sorguluyor,
 * sayılan ile eşleşen ayrışmasın.
 */
function CertificationGroup({
  facets,
  state,
  update,
  idPrefix,
}: {
  facets: ProductFacets;
  state: ProductFilterState;
  update: (p: Partial<ProductFilterState> | ((s: ProductFilterState) => ProductFilterState)) => void;
  idPrefix: string;
}) {
  const t = useTranslations("web.marketplace.filters");
  const [q, setQ] = useState("");
  const all = facets.certifications ?? [];
  const fold = foldSearchText;
  const items = all
    .filter((c) => !q || fold(c.cert).includes(fold(q)) || state.certs.includes(c.cert))
    .map((c) => ({ key: c.cert, label: c.cert, count: c.count }));
  // Hiç sertifika beyanı yoksa grup ÇİZİLMEZ — boş kutu basmayız.
  if (all.length === 0) return null;
  return (
    <Group
      title={t("certifications")}
      icon={<ScrollText className="size-4" />}
      count={state.certs.length}
      onClear={() => update({ certs: [] })}
      storageKey="sertifika"
      defaultOpen={false}
    >
      {all.length > SHOW ? (
        <FilterSearch id={`${idPrefix}-cert-q`} value={q} onChange={setQ} placeholder={t("certSearch")} />
      ) : null}
      <ShowMore
        items={items}
        selected={state.certs}
        idPrefix={`${idPrefix}-cert`}
        onToggle={(k, on) => update((s) => ({ ...s, certs: on ? [...s.certs, k] : s.certs.filter((x) => x !== k) }))}
        emptyText={t("noCert")}
      />
    </Group>
  );
}

/**
 * MİN. SİPARİŞ — ön ayarlı tavanlar (radio: kümülatif, çoklu seçim anlamsız).
 * Serbest sayı kutusu Fiyat grubundan KALKTI: aynı ekseni iki yerde sormak
 * "≤100 seçtim ama kutuda 250 yazıyor" çelişkisi üretiyordu.
 */
function MoqGroup({
  facets,
  state,
  update,
  idPrefix,
}: {
  facets: ProductFacets;
  state: ProductFilterState;
  update: (p: Partial<ProductFilterState>) => void;
  idPrefix: string;
}) {
  const t = useTranslations("web.marketplace.filters");
  const fmt = useFormatter();
  return (
    <Group
      title={t("minOrder")}
      icon={<Boxes className="size-4" />}
      count={state.moqMax != null ? 1 : 0}
      onClear={() => update({ moqMax: undefined })}
      storageKey="moq"
      defaultOpen={false}
    >
      <Check
        id={`${idPrefix}-moq-any`}
        label={t("any")}
        checked={state.moqMax == null}
        onChange={() => update({ moqMax: undefined })}
        type="radio"
        name={`${idPrefix}-moq`}
      />
      {MOQ_PRESETS.map((n) => (
        <Check
          key={n}
          id={`${idPrefix}-moq-${n}`}
          label={`≤ ${fmt.number(n)}`}
          count={facets.moq?.[String(n)]}
          checked={state.moqMax === n}
          onChange={() => update({ moqMax: n })}
          type="radio"
          name={`${idPrefix}-moq`}
        />
      ))}
    </Group>
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
  const t = useTranslations("web.marketplace.filters");
  const [q, setQ] = useState("");
  const items = useMemo(() => {
    // Katlanmış karşılaştırma — `tr-TR` küçültme Latin "I"yı "ı" yapıyordu.
    const t = foldSearchText(q);
    return facets.categories.filter((c) => !t || foldSearchText(c.name).includes(t));
  }, [facets.categories, q]);
  // Seçili dalın adı: önce sunucunun `selectedCategory` alanı (ürünü olmayan
  // ya da L1 dışı seçimler de adıyla görünsün), sonra L1 facet listesi.
  const selectedName =
    facets.selectedCategory?.name ?? facets.categories.find((c) => c.id === state.category)?.name;
  return (
    <Group title={t("category")} icon={<FolderTree className="size-4" />} count={state.category ? 1 : 0} onClear={() => update({ category: undefined, attrs: [] })} storageKey="kategori">
      {facets.categories.length > SHOW ? (
        <div className="relative mb-2">
          <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("categorySearch")}
            aria-label={t("categorySearch")}
            className="h-9 w-full rounded-lg border border-zinc-200 pr-8 pl-8 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
          />
          {q ? (
            <button type="button" onClick={() => setQ("")} aria-label={t("clearSearch")} className="absolute top-1/2 right-2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700">
              <XMarkIcon aria-hidden className="size-4" />
            </button>
          ) : null}
        </div>
      ) : null}
      {state.category && !items.some((c) => c.id === state.category) ? (
        // İşaretli radyoya tıklamak `change` üretmez — kaldırma `onUncheck`
        // ile (arayüz testi D-320: satır tıklanınca hiçbir şey olmuyordu).
        <Check
          id={`${idPrefix}-cat-${state.category}`}
          label={selectedName ?? state.category}
          checked
          onChange={() => update({ category: undefined, attrs: [] })}
          onUncheck={() => update({ category: undefined, attrs: [] })}
          type="radio"
          name={`${idPrefix}-cat`}
        />
      ) : null}
      <ShowMoreRadio
        items={items.map((c) => ({ key: c.id, label: c.name, count: c.count }))}
        selected={state.category}
        idPrefix={`${idPrefix}-cat`}
        onSelect={(k) => update({ category: state.category === k ? undefined : k, attrs: [] })}
        emptyText={t("noCategory")}
      />
    </Group>
  );
}


/**
 * FİYAT — histogram + hazır aralıklar + serbest min/max + "fiyatsızlar dahil".
 *
 * MOQ kutusu BURADAN ÇIKTI (2026-09-07): kendi grubu var, aynı ekseni iki
 * yerde sormak çelişki üretiyordu.
 */
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
  const t = useTranslations("web.marketplace.filters");
  const fmt = useFormatter();
  const [min, setMin] = useState(state.priceMin?.toString() ?? "");
  const [max, setMax] = useState(state.priceMax?.toString() ?? "");
  const accent = useFilterAccent();
  // PARA BİRİMİ (2026-09-27, "kurla çevir"): histogram ve sınırlar bu birimde;
  // sunucu farklı birimdeki fiyatları TCMB kuruyla ortak tabanda karşılaştırır.
  // URL'deki seçim önce (yeni facet yanıtı gelmeden seçici geri atlamasın);
  // yoksa sunucunun çözdüğü varsayılan (dil ya da firma ülkesi).
  const currency = state.currency ?? facets.currency ?? "TRY";
  const sym = currencySymbol(currency);
  const priceLocale = useLocale();
  const formatPrice = (n: number) => affixCurrency(fmt.number(n), currency, priceLocale);
  // Aralık yazılırken birim de URL'e AÇIKÇA gider (paylaşılan bağlantı başka
  // dilde açılınca aralık başka birimde okunmasın).
  const setRange = (priceMin?: number, priceMax?: number) => update({ priceMin, priceMax, currency });
  useEffect(() => {
    setMin(state.priceMin?.toString() ?? "");
    setMax(state.priceMax?.toString() ?? "");
  }, [state.priceMin, state.priceMax]);
  // 400 ms debounce — her tuşta sunucuya gitmesin.
  useEffect(() => {
    const t = setTimeout(() => {
      const n = (v: string) =>
        v.trim() === "" ? undefined : Math.min(PRICE_LIMIT, Math.max(0, Math.trunc(Number(v)))) || undefined;
      let pm = n(min);
      let px = n(max);
      // Ters aralık (min > max) sessizce boş liste veriyordu (arayüz testi
      // D-074): sınırlar yer değiştirir, kutular da yeni sırayı gösterir.
      if (pm != null && px != null && pm > px) {
        [pm, px] = [px, pm];
        setMin(String(pm));
        setMax(String(px));
      }
      if (pm !== state.priceMin || px !== state.priceMax) setRange(pm, px);
    }, 400);
    return () => clearTimeout(t);
  }, [min, max]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasRange = state.priceMin != null || state.priceMax != null;
  const count = (state.price ? 1 : 0) + (hasRange ? 1 : 0);
  const hist = facets.priceHistogram;
  return (
    <Group
      title={t("price")}
      icon={<Tag className="size-4" />}
      count={count}
      onClear={() => update({ price: undefined, priceMin: undefined, priceMax: undefined, priceUnpriced: false })}
      storageKey="fiyat"
    >
      {/* Birim değişince aralık SIFIRLANIR: eski sınırlar önceki birimdeydi. */}
      <label className="mb-2 flex items-center justify-between gap-2 px-2 text-xs text-zinc-600">
        <span>{t("currency")}</span>
        <select
          value={currency}
          onChange={(e) => update({ currency: e.target.value, priceMin: undefined, priceMax: undefined, priceUnpriced: false })}
          className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900 outline-none focus:border-zinc-900"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c === currencySymbol(c) ? c : `${c} (${currencySymbol(c)})`}
            </option>
          ))}
        </select>
      </label>

      {hist ? (
        <PriceHistogram
          data={hist}
          from={state.priceMin}
          to={state.priceMax}
          formatPrice={formatPrice}
          // İlk çubuk 1'in altında fiyatlı katalogda `from=0` verir: alt
          // sınır YOK demek, `fiyatMin=0` yazılmaz (bkz. `presetRanges`, S078).
          onPick={(from, to) => setRange(from > 0 ? from : undefined, to)}
        />
      ) : null}

      {/* HAZIR ARALIKLAR — histogramın gerçek uçlarına göre türetilir; sabit
          "0-100 / 100-1.000" listesi envanterle ilgisiz kovalar basardı. */}
      {hist ? (
        <div className="mb-2 flex flex-wrap gap-1.5 px-2">
          {presetRanges(hist, formatPrice).map((r) => {
            const on = state.priceMin === r.from && state.priceMax === r.to;
            return (
              <button
                key={`${r.from ?? 0}-${r.to}`}
                type="button"
                aria-pressed={on}
                onClick={() => (on ? setRange(undefined, undefined) : setRange(r.from, r.to))}
                className={`tnum rounded-full px-2.5 py-1 text-xs transition ${
                  on
                    ? accent === "blue"
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-950 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mb-2 grid grid-cols-2 gap-2 px-2">
        <label className="text-xs text-zinc-500">
          {t("minCurrency", { currency: sym })}
          <input inputMode="numeric" maxLength={10} value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} placeholder="0" className="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-2 text-sm tabular-nums text-zinc-900 outline-none focus:border-zinc-900" />
        </label>
        <label className="text-xs text-zinc-500">
          {t("maxCurrency", { currency: sym })}
          <input inputMode="numeric" maxLength={10} value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} placeholder="∞" className="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-2 text-sm tabular-nums text-zinc-900 outline-none focus:border-zinc-900" />
        </label>
      </div>

      <p className="mb-2 px-2 text-[11px]/4 text-zinc-500">{t("currencyHint")}</p>

      {/* Yalnız ARALIK seçiliyken anlamlı: aralık fiyatın TRY karşılığına
          bakar, "teklif isteyin" ürünlerinde o alan boş ve hepsi sessizce düşerdi. */}
      {hasRange ? (
        <Check
          id={`${idPrefix}-price-unpriced`}
          label={t("includeUnpriced")}
          count={facets.price.request}
          checked={state.priceUnpriced}
          onChange={(v) => update({ priceUnpriced: v })}
        />
      ) : null}

      <Check id={`${idPrefix}-price-any`} label={t("all")} checked={!state.price} onChange={() => update({ price: undefined })} type="radio" name={`${idPrefix}-price`} />
      <Check id={`${idPrefix}-price-has`} label={t("priced")} count={facets.price.has} checked={state.price === "var"} onChange={() => update({ price: "var" })} type="radio" name={`${idPrefix}-price`} />
      <Check id={`${idPrefix}-price-req`} label={t("onRequest")} count={facets.price.request} checked={state.price === "teklif"} onChange={() => update({ price: "teklif" })} type="radio" name={`${idPrefix}-price`} />
    </Group>
  );
}

/**
 * ÜÇ HAZIR ARALIK — sınırlar ÜÇTE BİRLİK dilimlerden (sunucudan gelen
 * `quantiles`), doğrusal bölmeden DEĞİL.
 *
 * Canlıda fiyatlar 3 ₺ ile 465.000 ₺ arasında ve çarpık dağılıyor: doğrusal
 * bölmede "≤ 120.000 ₺" envanterin neredeyse tamamını, diğer iki aralık
 * hiçbir şeyi kapsıyordu. Üçte birlik sınırlarda her aralık kabaca eşit
 * sayıda ürün taşır. Quantile gelmezse (eski kenar önbelleği) aralık
 * BASILMAZ — yanlış aralık göstermektense hiç göstermemek.
 */
export function presetRanges(hist: {
  min: number;
  max: number;
  quantiles?: { p33: number; p66: number };
}, formatPrice: (n: number) => string): { from: number | undefined; to: number; label: string }[] {
  // `formatPrice` sembolü dilin yazımıyla ekler (İngilizcede önde).
  // İlk aralığın alt sınırı YOK (`undefined`, 0 değil): `fiyatMin=0` min
  // kutusuna "0" yazıyor, debounce 0'ı boş sayıp 400 ms sonra ikinci bir
  // yönlendirmeyle siliyordu — çip hiç seçili görünmüyordu (derin denetim S078).
  const q = hist.quantiles;
  if (!q || !(q.p33 < q.p66 && q.p66 < hist.max)) return [];
  return [
    { from: undefined, to: q.p33, label: `≤ ${formatPrice(q.p33)}` },
    { from: q.p33, to: q.p66, label: `${formatPrice(q.p33)} – ${formatPrice(q.p66)}` },
    { from: q.p66, to: hist.max, label: `${formatPrice(q.p66)} +` },
  ];
}

/** Aktif süzgeç çipleri — sticky şerit (grid'in üstünde). */
export function ActiveFilterChips({ facets }: { facets: ProductFacets }) {
  const t = useTranslations("web.marketplace.filters");
  const chipLocale = useLocale() as Locale;
  const { state, update, clear } = useFilters();
  const nearName = useGeoCityName(state.near);
  // Şehir adı: facet'te yoksa (daraltılmış liste) Türk il listesi ya da
  // API'den — çipte ham adres ("istanbul") yazıyordu (arayüz testi D-317).
  const cityNames = useGeoCityNames(state.cities, (c) => facets.cities.find((f) => f.city === c)?.name);
  const fmt = useFormatter();
  const activityLabel = useActivityLabel();
  const chips: FilterChip[] = [];
  if (state.category)
    chips.push({
      key: "cat",
      // Ad önce SEÇİLİ KATEGORİ alanından (ürünü olmayan/L3 dallar da adıyla
      // yazılsın); sonra L1 facet listesinden; son çare ham kod.
      label:
        facets.selectedCategory?.name ??
        facets.categories.find((c) => c.id === state.category)?.name ??
        state.category,
      onRemove: () => update({ category: undefined, attrs: [] }),
    });
  for (const c of state.cities) {
    chips.push({ key: `c:${c}`, label: cityNames[c] ?? c, onRemove: () => update((s) => ({ ...s, cities: s.cities.filter((x) => x !== c) })) });
  }
  for (const c of state.countries) chips.push({ key: `u:${c}`, label: countryDisplayName(c, chipLocale), onRemove: () => update((s) => ({ ...s, countries: s.countries.filter((x) => x !== c) })) });
  for (const a of state.activities) chips.push({ key: `a:${a}`, label: activityLabel(a), onRemove: () => update((s) => ({ ...s, activities: s.activities.filter((x) => x !== a) })) });
  if (state.verified) chips.push({ key: "v", label: t("verified"), onRemove: () => update({ verified: false }) });
  if (state.price) chips.push({ key: "p", label: state.price === "var" ? t("priced") : t("onRequest"), onRemove: () => update({ price: undefined }) });
  if (state.priceMin != null || state.priceMax != null) {
    const chipCurrency = state.currency ?? facets.currency ?? "TRY";
    const price = (n: number) => affixCurrency(fmt.number(n), chipCurrency, chipLocale);
    chips.push({
      key: "pr",
      label: `${price(state.priceMin ?? 0)} – ${state.priceMax != null ? price(state.priceMax) : "∞"}`,
      // Aralıkla birlikte "fiyatsızlar dahil" de gider (arayüz testi D-232):
      // bayrak yalnız aralıkla anlamlı, URL'de görünmez biçimde kalıyordu.
      onRemove: () => update({ priceMin: undefined, priceMax: undefined, priceUnpriced: false }),
    });
  }
  if (state.moqMax != null) chips.push({ key: "moq", label: t("moqChip", { n: fmt.number(state.moqMax) }), onRemove: () => update({ moqMax: undefined }) });
  // Sertifika ve nitelik çipleri GRUP ÖNEKLİ (arayüz testi D-317): "CE"
  // sertifikası ile "CE" nitelik değeri yan yana iki aynı çip basıyordu.
  for (const c of state.certs) chips.push({ key: `cert:${c}`, label: t("groupChip", { group: t("certification"), value: c }), onRemove: () => update((s) => ({ ...s, certs: s.certs.filter((x) => x !== c) })) });
  if (state.fastReply) chips.push({ key: "fast", label: t("fastReply"), onRemove: () => update({ fastReply: false }) });
  if (state.near && state.radius) {
    chips.push({
      key: "near",
      label: `${nearName} · ${t("radiusKm", { radius: state.radius })}`,
      onRemove: () => update({ near: undefined, radius: undefined }),
    });
  }
  for (const e of state.employees) chips.push({ key: `emp:${e}`, label: t("employeesChip", { bucket: employeeBucketLabel(e) }), onRemove: () => update((s) => ({ ...s, employees: s.employees.filter((x) => x !== e) })) });
  // Çip, kenar çubuğuyla aynı etiketi basar: URL'deki değer kanonik
  // (Türkçe), okuyucunun dilindeki ad facet'in `label`ında (derin denetim S078).
  const attrLabel = (a: string) => {
    const i = a.indexOf(":");
    const key = a.slice(0, i);
    const value = a.slice(i + 1);
    const facet = facets.attributes.find((f) => f.key === key);
    const label = facet?.values.find((v) => v.value === value)?.label ?? value;
    return facet ? t("groupChip", { group: facet.nameTr, value: label }) : label;
  };
  for (const a of state.attrs) chips.push({ key: `attr:${a}`, label: attrLabel(a), onRemove: () => update((s) => ({ ...s, attrs: s.attrs.filter((x) => x !== a) })) });
  return <FilterChipBar chips={chips} activeCount={activeFilterCount(state)} onClearAll={clear} />;
}

/** Sıralama — masaüstü çipler (fiyatta yön oku), mobilde <select>. */
/**
 * IZGARA ↔ LİSTE (2026-09-07). Yoğunluk tercihi kullanıcınındır: ızgara
 * "tarama" (çok ürün, az ayrıntı), liste "karşılaştırma" (fiyat/MOQ tek
 * sütunda alt alta). Tercih URL'de (`gorunum=liste`) — paylaşılan bağlantı
 * aynı düzende açılır ve "Tümünü temizle" onu korur — VE seçim
 * `localStorage`a yazılır: bir sonraki ziyarette (URL'de `gorunum` yoksa)
 * geri yüklenir, bkz. `ViewPreferenceSync`.
 */
export function ViewToggle() {
  const t = useTranslations("web.marketplace.filters");
  const { state, update } = useFilters<ProductFilterState>();
  const opts = [
    { k: undefined, l: t("grid"), icon: Squares2X2Icon },
    { k: "liste" as const, l: t("list"), icon: ListBulletIcon },
  ];
  const pick = (k: ProductFilterState["view"]) => {
    writeViewPreference(k);
    update({ view: k });
  };
  return (
    <div className="hidden items-center gap-1 sm:flex" role="group" aria-label={t("view")}>
      {opts.map((o) => {
        const active = (state.view ?? undefined) === o.k;
        const Icon = o.icon;
        return (
          <button
            key={o.l}
            type="button"
            aria-pressed={active}
            title={t("viewOf", { view: o.l })}
            onClick={() => pick(o.k)}
            className={`inline-flex size-8 items-center justify-center rounded-lg transition ${
              active ? "bg-zinc-100 text-zinc-950 ring-1 ring-zinc-300" : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <Icon aria-hidden className="size-4" />
            <span className="sr-only">{t("viewOf", { view: o.l })}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Kayıtlı görünüm tercihini URL'e taşır — çizim üretmez.
 *
 * Efektte okunur: `localStorage` sunucu render'ında yok, koşulu render'a
 * taşımak hydration uyuşmazlığı olurdu. Üç koruma:
 *  · URL'de `gorunum` VARSA dokunulmaz (paylaşılan bağlantı kazanır);
 *  · yalnız 1. sayfada uygulanır — `update()` süzgeç değişiminde sayfayı 1'e
 *    düşürür, `?sayfa=3` ile gelen kullanıcıyı sessizce başa atmayalım;
 *  · bir kez çalışır (`done`), sonraki tıklar kullanıcının.
 */
export function ViewPreferenceSync() {
  const { state, update } = useFilters<ProductFilterState>();
  const [done, setDone] = useState(false);
  const sp = useSearchParams();
  useEffect(() => {
    if (done) return;
    setDone(true);
    if (sp?.has("gorunum") || state.page !== 1) return;
    const pref = readViewPreference();
    // Geçmişe yazılmaz: kullanıcının değil tercihin değişimi ("geri" tuşu
    // tercihsiz adrese dönüp aynı yere geri getirmesin).
    if (pref && pref !== state.view) update({ view: pref }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);
  return null;
}

export function SortControl() {
  const t = useTranslations("web.marketplace.filters");
  const { state, update } = useFilters();
  const opts: { k: ProductFilterState["sort"]; l: string; price?: boolean }[] = [
    { k: undefined, l: t("sortRelevance") },
    { k: "yeni", l: t("sortNewest") },
    { k: state.sort === "fiyat" ? "fiyat-azalan" : "fiyat", l: `${t("sortPrice")} ${state.sort === "fiyat" ? "↑" : state.sort === "fiyat-azalan" ? "↓" : ""}`.trim(), price: true },
  ];
  const isPrice = state.sort === "fiyat" || state.sort === "fiyat-azalan";
  return (
    <>
      <div className="hidden items-center gap-2 text-xs sm:flex">
        {/* Dizin sayfalarının zemini zinc-100 → zinc-500 metin 4,39:1 kalıyor
            (a11y taraması 2026-09-12). Gri zeminde en az zinc-600. */}
        <span className="text-zinc-600">{t("sortLabel")}</span>
        <span className="flex items-center gap-0.5 rounded-lg bg-zinc-100 p-0.5 ring-1 ring-zinc-200">
        {opts.map((o) => {
          const active = o.k === state.sort || (!!o.price && isPrice);
          return (
            <button
              key={o.l}
              type="button"
              aria-pressed={active}
              onClick={() => update({ sort: o.k })}
              className={`rounded-md px-2.5 py-1 font-medium transition ${active ? "bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-300" : "text-zinc-600 hover:text-zinc-950"}`}
            >
              {o.l}
            </button>
          );
        })}
        </span>
      </div>
      <label className="text-xs text-zinc-500 sm:hidden">
        <span className="sr-only">{t("sortSr")}</span>
        <select
          value={state.sort ?? ""}
          onChange={(e) => update({ sort: (e.target.value || undefined) as ProductFilterState["sort"] })}
          className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
        >
          <option value="">{t("sortRelevance")}</option>
          <option value="yeni">{t("sortNewest")}</option>
          <option value="fiyat">{t("priceAsc")}</option>
          <option value="fiyat-azalan">{t("priceDesc")}</option>
        </select>
      </label>
    </>
  );
}
