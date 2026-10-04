"use client";

import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { CheckIcon, ChevronDownIcon } from "@heroicons/react/16/solid";
import { COUNTRIES, foldSearchText } from "@rothern/shared";
import type { Locale } from "@rothern/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { countryDisplayName } from "@/i18n/domain";
import { cn } from "@/lib/utils";
import { CountryFlag } from "@/components/ui/country-flag";

/**
 * Açık listede ilk çizilen satır sayısı; liste dibine kaydırıldıkça bir sayfa
 * daha eklenir (bkz. `onScroll`). `max-h-72` kutuda ~9 satır görünür.
 */
const OPTION_PAGE = 60;

/**
 * ARANABİLİR ÜLKE SEÇİCİ (2026-09-27, kayıt tüm ülkelere açıldı): 245 ülkelik
 * native <select> kaydırılarak kullanılamazdı. Kayıt formu, adres defteri,
 * hızlı talep adresi ve banka ülkesi AYNI bileşeni kullanır.
 *
 * Arama: ekrandaki dilde ad + Türkçe ad + ISO kodu, katlanmış (ç=c, İ=i…) —
 * "almanya", "germany", "de" hepsi Almanya'yı bulur. Türkiye her zaman başta.
 *
 * Bayrak SVG görseli (`CountryFlag`, 2026-10-04): emoji bayrağı Windows'ta
 * "TR"/"DE" harfleri olarak basılıyordu. `<input>` değerine görsel giremez →
 * seçili ülkenin bayrağı kutunun SOLUNA mutlak konumlu çizilir, metin dolgusu
 * yalnız o zaman genişler; seçenek satırlarında ad yanında, dekoratif.
 */
export function CountryCombobox({
  value,
  onChange,
  codes,
  ariaLabel,
  id,
  disabled = false,
  className,
  placeholder,
}: {
  value: string;
  onChange: (code: string) => void;
  /** Seçilebilir kodlar (varsayılan tam liste; kayıt formunda kapalı ülkeler hariç). */
  codes?: readonly string[];
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  /** Kutu boşken yazı (varsayılan "Ülke ara…"; ekleme kipinde "+ Ülke ekle"). */
  placeholder?: string;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("web.shared.countryPicker");
  const [query, setQuery] = useState("");
  // Anahtar içerikten: çağıran listeyi satır içi kurarsa (`codes={….map()}`)
  // her çizimde 245 ülke yeniden sıralanmasın.
  const codesKey = codes ? codes.join(",") : null;
  const options = useMemo(() => {
    const allowed = codesKey === null ? null : new Set(codesKey.split(","));
    const rows = COUNTRIES.filter((c) => !allowed || allowed.has(c.code)).map((c) => {
      const label = countryDisplayName(c.code, locale);
      return { code: c.code, label, hay: foldSearchText(`${label} ${c.name} ${c.code}`) };
    });
    const [tr, rest] = [rows.filter((r) => r.code === "TR"), rows.filter((r) => r.code !== "TR")];
    return [...tr, ...rest.sort((a, b) => a.label.localeCompare(b.label, locale))];
  }, [codesKey, locale]);
  const q = foldSearchText(query.trim());
  const filtered = useMemo(() => (q ? options.filter((o) => o.hay.includes(q)) : options), [options, q]);
  // TEMBEL SATIRLAR (son toparlama 2026-10-04): Headless UI her seçeneği
  // kaydederken/sökerken tüm seçenek aboneliklerini dolaşır (n² iş); 245
  // satırı birden açmak ve aramayla sökmek yavaş telefonlarda takılıyor,
  // tam test paketinde form testlerini 15 sn zaman aşımına itiyordu. Liste
  // ilk `OPTION_PAGE` satırla açılır, dibe kaydırdıkça büyür; seçili ülke her
  // zaman çizilen aralıkta kalır (açılışta oraya kaydırılır). Arama sonucu
  // zaten kısa olduğundan pratikte yalnız göz gezdirmede devreye girer.
  const [limit, setLimit] = useState(OPTION_PAGE);
  const selectedIndex = filtered.findIndex((o) => o.code === value);
  const shownCount = Math.max(limit, selectedIndex + 1 + OPTION_PAGE / 4);
  const shown = useMemo(
    () => (filtered.length > shownCount ? filtered.slice(0, shownCount) : filtered),
    [filtered, shownCount],
  );
  // Seçenek satırları ÖNBELLEKLİ: kutu formun içinde; formun her tuş vuruşu
  // bu bileşeni yeniden çizer ve kapalı listede bile yüzlerce öğe (satır +
  // bayrak + ad + işaret) yeniden kuruluyordu. Liste yalnız arama, sayfa ya
  // da dil değişince kurulur; aynı öğe nesneleri React uzlaştırmasını atlatır.
  const noResults = t("noResults");
  const optionNodes = useMemo(
    () =>
      shown.length === 0 ? (
        <div className="px-3 py-2 text-sm text-zinc-500">{noResults}</div>
      ) : (
        shown.map((o) => (
          <ComboboxOption
            key={o.code}
            value={o}
            className="group flex cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-zinc-950 select-none data-focus:bg-zinc-100"
          >
            <span className="flex w-5 shrink-0 justify-center">
              <CountryFlag code={o.code} decorative />
            </span>
            <span className="flex-1 truncate">{o.label}</span>
            <CheckIcon className="invisible size-4 fill-zinc-950 group-data-selected:visible" aria-hidden="true" />
          </ComboboxOption>
        ))
      ),
    [shown, noResults],
  );
  const selected = options.find((o) => o.code === value) ?? null;
  // Arama yazılırken kutudaki metin seçili ülke değil → bayrak gizlenir.
  const showFlag = !!selected && !query;

  return (
    <Combobox
      value={selected}
      onChange={(o: (typeof options)[number] | null) => {
        if (o) onChange(o.code);
      }}
      onClose={() => {
        setQuery("");
        setLimit(OPTION_PAGE);
      }}
      disabled={disabled}
      immediate
    >
      {/* `data-slot="control"` + Catalyst `Input` dolgusu: `<Field>` etiketle
          kutu arasına komşu alanlarla aynı boşluğu (mt-3) koyar, yükseklik
          aynıdır — Ülke kutusu İl kutusundan 12 px yukarıda ve 6 px daha
          yüksek duruyordu (arayüz testi webC-09 yeniden doğrulama, D-311). */}
      <div data-slot="control" className={cn("relative w-full", className)}>
        <ComboboxInput
          id={id}
          aria-label={ariaLabel}
          displayValue={(o: (typeof options)[number] | null) => o?.label ?? ""}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(OPTION_PAGE);
          }}
          placeholder={placeholder ?? t("placeholder")}
          autoComplete="off"
          className={cn(
            "block w-full rounded-lg border border-zinc-950/10 bg-white py-[calc(--spacing(2.5)-1px)] pr-9 sm:py-[calc(--spacing(1.5)-1px)] text-base/6",
            showFlag ? "pl-9 sm:pl-8.5" : "pl-[calc(--spacing(3.5)-1px)] sm:pl-[calc(--spacing(3)-1px)]",
            "text-zinc-950 placeholder:text-zinc-500 focus:border-zinc-950/20 focus:outline-none disabled:opacity-50 sm:text-sm/6",
          )}
        />
        {showFlag ? (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center sm:left-2.5">
            <CountryFlag code={selected.code} decorative />
          </span>
        ) : null}
        <ComboboxButton className="absolute inset-y-0 right-0 flex items-center px-2.5" aria-label={t("open")}>
          <ChevronDownIcon className="size-4 fill-zinc-500" aria-hidden="true" />
        </ComboboxButton>
      </div>
      <ComboboxOptions
        anchor="bottom start"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (shown.length < filtered.length && el.scrollTop + el.clientHeight >= el.scrollHeight - 160) {
            // Çizilenden büyüt: seçili ülke sayfanın ötesindeyse çizilen satır
            // `limit`ten fazladır; `n + OPTION_PAGE` o sayıyı aşmayıp liste
            // dipte takılı kalabiliyordu (tek kaydırma olayı, scrollTop sabit).
            const drawn = shown.length;
            setLimit((n) => Math.max(n, drawn) + OPTION_PAGE);
          }
        }}
        className="z-50 max-h-72 w-(--input-width) min-w-64 overflow-auto rounded-xl border border-zinc-950/10 bg-white p-1 shadow-lg ring-1 ring-zinc-950/5 empty:invisible [--anchor-gap:0.25rem]"
      >
        {optionNodes}
      </ComboboxOptions>
    </Combobox>
  );
}
