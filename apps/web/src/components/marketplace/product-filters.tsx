"use client";

import { useFilterAccent, useFilters } from "./filter-shell";
import type { ProductFacets } from "@/lib/public/marketplace-api";
import { activeFilterCount, type ProductFilterState } from "@/lib/public/product-filter-params";
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
} from "lucide-react";
import { ActivityIcon } from "./activity-icons";
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
  companyActivityLabel,
  employeeBucketLabel,
  resolveProvince,
} from "@rothern/shared";

/**
 * "Min. sipariş" ön ayarları — API'deki `MOQ_BUCKETS` ile AYNI sayılar
 * olmalı, yoksa "≤100 (12)" yazan kutucuk 9 ürün gösterir. Sayı üç yerde
 * (API where, API sayaç, buradaki etiket) aynı olduğu sürece tutarlı.
 */
const MOQ_PRESETS = [10, 100, 1000] as const;
import { useSearchParams } from "next/navigation";
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
    <div className="space-y-3" data-filters>
      <CategoryGroup facets={facets} state={state} update={update} idPrefix={idPrefix} />

      <Group
        title="Firma profili"
        icon={<BadgeCheck className="size-4" />}
        count={(state.verified ? 1 : 0) + (state.fastReply ? 1 : 0)}
        onClear={() => update({ verified: false, fastReply: false })}
        storageKey="profil"
      >
        <Check
          id={`${idPrefix}-verified`}
          label="Doğrulanmış"
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
          label="Hızlı yanıt veren"
          count={facets.fastReply ?? 0}
          checked={state.fastReply}
          onChange={(v) => update({ fastReply: v })}
        />
      </Group>

      <Group
        title="Tedarikçi türü"
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
            label: a.nameTr,
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

      <CertificationGroup facets={facets} state={state} update={update} idPrefix={idPrefix} />

      <Group
        title="Çalışan sayısı"
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
            items={a.values.map((v) => ({ key: `${a.key}:${v.value}`, label: v.value, count: v.count }))}
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
  const { activeCount, clear } = useFilters();
  return (
    <button
      type="button"
      onClick={clear}
      disabled={activeCount === 0}
      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
    >
      Tüm filtreleri sıfırla
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
  const [q, setQ] = useState("");
  const fold = (v: string) => v.toLocaleLowerCase("tr");
  const items = facets.cities
    .filter((c) => !q || fold(c.city).includes(fold(q)) || state.cities.includes(c.city))
    .map((c) => ({ key: c.city, label: c.city, count: c.count }));
  return (
    <Group title="Konum" icon={<MapPin className="size-4" />} count={state.cities.length} onClear={() => update({ cities: [] })} storageKey="sehir">
      {facets.cities.length > SHOW ? (
        <FilterSearch id={`${idPrefix}-city-q`} value={q} onChange={setQ} placeholder="İl ara" />
      ) : null}
      <ShowMore
        items={items}
        selected={state.cities}
        idPrefix={`${idPrefix}-city`}
        onToggle={(k, on) => update((s) => ({ ...s, cities: on ? [...s.cities, k] : s.cities.filter((x) => x !== k) }))}
        emptyText="Eşleşen il yok"
      />
      <NearbyControls state={state} update={update} idPrefix={idPrefix} />
    </Group>
  );
}

/** "Yakınımda": merkez (il ya da posta kodu) + yarıçap kaydırıcısı. */
function NearbyControls({
  state,
  update,
  idPrefix,
}: {
  state: ProductFilterState;
  update: (p: Partial<ProductFilterState> | ((s: ProductFilterState) => ProductFilterState)) => void;
  idPrefix: string;
}) {
  const [near, setNear] = useState(state.near ?? "");
  const province = resolveProvince(near);
  /**
   * Durumdan kutuya senkron — ama KULLANICI YAZARKEN DEĞİL.
   *
   * Düz `setNear(state.near ?? "")` bir hata üretiyordu: çözülmeyen bir harf
   * yazıldığı anda süzgeç temizleniyor, bu efekt tetikleniyor ve kutuyu
   * BOŞALTIYORDU — yani "İzmir"i silip yeniden yazmaya kalkan kullanıcının
   * yazdığı kayboluyordu. Kutu yalnız dışarıdan gelen bir değişimde
   * (geri tuşu, çipten kaldırma, paylaşılan bağlantı) güncellenir.
   */
  useEffect(() => {
    const local = resolveProvince(near)?.name;
    if (state.near === local) return; // zaten senkron
    if (!state.near && !local) return; // kullanıcı yazıyor, henüz çözülmedi
    setNear(state.near ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.near]);
  const radius = state.radius ?? 100;
  const accent = useFilterAccent();
  // Merkez ÇÖZÜLENE dek süzgeç yazılmaz: yarım bir kısıt listeyi boşaltırdı.
  const apply = (nextRadius: number) => {
    if (province) update({ near: province.name, radius: nextRadius });
  };
  return (
    <div className="mt-3 border-t border-zinc-100 px-2 pt-3">
      <p className="mb-1.5 text-xs font-semibold text-zinc-600">Yakınımda</p>
      <input
        id={`${idPrefix}-near`}
        value={near}
        onChange={(e) => {
          setNear(e.target.value);
          const p = resolveProvince(e.target.value);
          if (p) update({ near: p.name, radius });
          else if (state.near) update({ near: undefined, radius: undefined });
        }}
        placeholder="İl ya da posta kodu"
        aria-label="Yakınımda — il ya da posta kodu"
        className="h-9 w-full rounded-lg border border-zinc-200 px-2 text-sm text-zinc-900 outline-none focus:border-zinc-900"
      />
      {near && !province ? (
        <p className="mt-1 text-[11px] text-amber-700">İl bulunamadı — il adı ya da 5 haneli posta kodu yazın.</p>
      ) : null}
      <label className="mt-2 block text-[11px] text-zinc-500" htmlFor={`${idPrefix}-radius`}>
        Yarıçap: <span className="tnum font-medium text-zinc-700">{radius} km</span>
      </label>
      <input
        id={`${idPrefix}-radius`}
        type="range"
        min={0}
        max={RADIUS_OPTIONS.length - 1}
        step={1}
        value={Math.max(0, RADIUS_OPTIONS.indexOf(radius as (typeof RADIUS_OPTIONS)[number]))}
        onChange={(e) => apply(RADIUS_OPTIONS[Number(e.target.value)]!)}
        disabled={!province}
        className={`mt-1 w-full disabled:opacity-40 ${
          accent === "blue" ? "accent-blue-600" : "accent-zinc-950"
        }`}
      />
      <p className="tnum flex justify-between text-[10px] text-zinc-400">
        {RADIUS_OPTIONS.map((r) => (
          <span key={r}>{r}</span>
        ))}
      </p>
      {province ? (
        <p className="mt-1 text-[11px] text-zinc-500">
          {province.name} ve merkezleri {radius} km içindeki iller.
        </p>
      ) : null}
    </div>
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
  const [q, setQ] = useState("");
  const all = facets.certifications ?? [];
  const fold = (v: string) => v.toLocaleLowerCase("tr");
  const items = all
    .filter((c) => !q || fold(c.cert).includes(fold(q)) || state.certs.includes(c.cert))
    .map((c) => ({ key: c.cert, label: c.cert, count: c.count }));
  // Hiç sertifika beyanı yoksa grup ÇİZİLMEZ — boş kutu basmayız.
  if (all.length === 0) return null;
  return (
    <Group
      title="Sertifikalar"
      icon={<ScrollText className="size-4" />}
      count={state.certs.length}
      onClear={() => update({ certs: [] })}
      storageKey="sertifika"
      defaultOpen={false}
    >
      {all.length > SHOW ? (
        <FilterSearch id={`${idPrefix}-cert-q`} value={q} onChange={setQ} placeholder="Sertifika ara" />
      ) : null}
      <ShowMore
        items={items}
        selected={state.certs}
        idPrefix={`${idPrefix}-cert`}
        onToggle={(k, on) => update((s) => ({ ...s, certs: on ? [...s.certs, k] : s.certs.filter((x) => x !== k) }))}
        emptyText="Eşleşen sertifika yok"
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
  return (
    <Group
      title="Min. sipariş"
      icon={<Boxes className="size-4" />}
      count={state.moqMax != null ? 1 : 0}
      onClear={() => update({ moqMax: undefined })}
      storageKey="moq"
      defaultOpen={false}
    >
      <Check
        id={`${idPrefix}-moq-any`}
        label="Farketmez"
        checked={state.moqMax == null}
        onChange={() => update({ moqMax: undefined })}
        type="radio"
        name={`${idPrefix}-moq`}
      />
      {MOQ_PRESETS.map((n) => (
        <Check
          key={n}
          id={`${idPrefix}-moq-${n}`}
          label={`≤ ${n.toLocaleString("tr-TR")}`}
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
  const [q, setQ] = useState("");
  const items = useMemo(() => {
    const t = q.trim().toLocaleLowerCase("tr-TR");
    return facets.categories.filter((c) => !t || c.name.toLocaleLowerCase("tr-TR").includes(t));
  }, [facets.categories, q]);
  const selectedName = facets.categories.find((c) => c.id === state.category)?.name;
  return (
    <Group title="Kategori" icon={<FolderTree className="size-4" />} count={state.category ? 1 : 0} onClear={() => update({ category: undefined, attrs: [] })} storageKey="kategori">
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
  const [min, setMin] = useState(state.priceMin?.toString() ?? "");
  const [max, setMax] = useState(state.priceMax?.toString() ?? "");
  const accent = useFilterAccent();
  useEffect(() => {
    setMin(state.priceMin?.toString() ?? "");
    setMax(state.priceMax?.toString() ?? "");
  }, [state.priceMin, state.priceMax]);
  // 400 ms debounce — her tuşta sunucuya gitmesin.
  useEffect(() => {
    const t = setTimeout(() => {
      const n = (v: string) => (v.trim() === "" ? undefined : Math.max(0, Math.trunc(Number(v))) || undefined);
      const pm = n(min);
      const px = n(max);
      if (pm !== state.priceMin || px !== state.priceMax) update({ priceMin: pm, priceMax: px });
    }, 400);
    return () => clearTimeout(t);
  }, [min, max]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasRange = state.priceMin != null || state.priceMax != null;
  const count = (state.price ? 1 : 0) + (hasRange ? 1 : 0);
  const hist = facets.priceHistogram;
  return (
    <Group
      title="Fiyat"
      icon={<Tag className="size-4" />}
      count={count}
      onClear={() => update({ price: undefined, priceMin: undefined, priceMax: undefined, priceUnpriced: false })}
      storageKey="fiyat"
    >
      {hist ? (
        <PriceHistogram
          data={hist}
          from={state.priceMin}
          to={state.priceMax}
          onPick={(from, to) => update({ priceMin: from, priceMax: to })}
        />
      ) : null}

      {/* HAZIR ARALIKLAR — histogramın gerçek uçlarına göre türetilir; sabit
          "0-100 / 100-1.000" listesi envanterle ilgisiz kovalar basardı. */}
      {hist ? (
        <div className="mb-2 flex flex-wrap gap-1.5 px-2">
          {presetRanges(hist).map((r) => {
            const on = state.priceMin === r.from && state.priceMax === r.to;
            return (
              <button
                key={`${r.from}-${r.to}`}
                type="button"
                onClick={() => update(on ? { priceMin: undefined, priceMax: undefined } : { priceMin: r.from, priceMax: r.to })}
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
          Min ₺
          <input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} placeholder="0" className="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-2 text-sm tabular-nums text-zinc-900 outline-none focus:border-zinc-900" />
        </label>
        <label className="text-xs text-zinc-500">
          Max ₺
          <input inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} placeholder="∞" className="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-2 text-sm tabular-nums text-zinc-900 outline-none focus:border-zinc-900" />
        </label>
      </div>

      {/* Yalnız ARALIK seçiliyken anlamlı: aralık `priceAmount`a bakar,
          "teklif isteyin" ürünlerinde o alan boş ve hepsi sessizce düşerdi. */}
      {hasRange ? (
        <Check
          id={`${idPrefix}-price-unpriced`}
          label="Fiyatı belirtilmemiş ürünler dahil"
          count={facets.price.request}
          checked={state.priceUnpriced}
          onChange={(v) => update({ priceUnpriced: v })}
        />
      ) : null}

      <Check id={`${idPrefix}-price-any`} label="Hepsi" checked={!state.price} onChange={() => update({ price: undefined })} type="radio" name={`${idPrefix}-price`} />
      <Check id={`${idPrefix}-price-has`} label="Fiyatı yazılı" count={facets.price.has} checked={state.price === "var"} onChange={() => update({ price: "var" })} type="radio" name={`${idPrefix}-price`} />
      <Check id={`${idPrefix}-price-req`} label="Teklifle" count={facets.price.request} checked={state.price === "teklif"} onChange={() => update({ price: "teklif" })} type="radio" name={`${idPrefix}-price`} />
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
function presetRanges(hist: {
  min: number;
  max: number;
  quantiles?: { p33: number; p66: number };
}): { from: number; to: number; label: string }[] {
  const q = hist.quantiles;
  if (!q || !(q.p33 < q.p66 && q.p66 < hist.max)) return [];
  const fmt = (n: number) => n.toLocaleString("tr-TR");
  return [
    { from: 0, to: q.p33, label: `≤ ${fmt(q.p33)} ₺` },
    { from: q.p33, to: q.p66, label: `${fmt(q.p33)} – ${fmt(q.p66)} ₺` },
    { from: q.p66, to: hist.max, label: `${fmt(q.p66)} ₺ +` },
  ];
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
  if (state.moqMax != null) chips.push({ key: "moq", label: `Min. sipariş ≤ ${state.moqMax.toLocaleString("tr-TR")}`, onRemove: () => update({ moqMax: undefined }) });
  for (const c of state.certs) chips.push({ key: `cert:${c}`, label: c, onRemove: () => update((s) => ({ ...s, certs: s.certs.filter((x) => x !== c) })) });
  if (state.fastReply) chips.push({ key: "fast", label: "Hızlı yanıt veren", onRemove: () => update({ fastReply: false }) });
  if (state.near && state.radius) {
    chips.push({
      key: "near",
      label: `${state.near} · ${state.radius} km`,
      onRemove: () => update({ near: undefined, radius: undefined }),
    });
  }
  for (const e of state.employees) chips.push({ key: `emp:${e}`, label: `${employeeBucketLabel(e)} çalışan`, onRemove: () => update((s) => ({ ...s, employees: s.employees.filter((x) => x !== e) })) });
  for (const a of state.attrs) chips.push({ key: `attr:${a}`, label: a.slice(a.indexOf(":") + 1), onRemove: () => update((s) => ({ ...s, attrs: s.attrs.filter((x) => x !== a) })) });
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
  const { state, update } = useFilters<ProductFilterState>();
  const opts = [
    { k: undefined, l: "Izgara", icon: Squares2X2Icon },
    { k: "liste" as const, l: "Liste", icon: ListBulletIcon },
  ];
  const pick = (k: ProductFilterState["view"]) => {
    writeViewPreference(k);
    update({ view: k });
  };
  return (
    <div className="hidden items-center gap-1 sm:flex" role="group" aria-label="Görünüm">
      {opts.map((o) => {
        const active = (state.view ?? undefined) === o.k;
        const Icon = o.icon;
        return (
          <button
            key={o.l}
            type="button"
            aria-pressed={active}
            title={`${o.l} görünümü`}
            onClick={() => pick(o.k)}
            className={`inline-flex size-8 items-center justify-center rounded-lg transition ${
              active ? "bg-zinc-100 text-zinc-950 ring-1 ring-zinc-300" : "text-zinc-500 hover:bg-zinc-100"
            }`}
          >
            <Icon aria-hidden className="size-4" />
            <span className="sr-only">{o.l} görünümü</span>
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
    if (pref && pref !== state.view) update({ view: pref });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);
  return null;
}

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
      <div className="hidden items-center gap-2 text-xs sm:flex">
        <span className="text-zinc-500">Sırala:</span>
        <span className="flex items-center gap-0.5 rounded-lg bg-zinc-100 p-0.5 ring-1 ring-zinc-200">
        {opts.map((o) => {
          const active = o.k === state.sort || (o.l.startsWith("Fiyat") && isPrice);
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
