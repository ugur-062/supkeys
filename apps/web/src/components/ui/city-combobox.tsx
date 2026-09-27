"use client";

import { Input as HeadlessInput } from "@headlessui/react";
import type { Locale } from "@rothern/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { searchGeoCities, type GeoCity } from "@/lib/public/geo-client";
import { cn } from "@/lib/utils";

/**
 * ŞEHİR SEÇİCİ — dünya şehir listesinden (2026-09-27, kullanıcı: "şehir
 * sayfaları türkiye özel olamaz"). Seçilen ülkenin şehirleri yazarken önerilir
 * (herhangi bir dilde: "münih", "munich", "münchen"); seçim `cityId` taşır →
 * firma şehir sayfasında, şehir süzgecinde ve "Yakınımda"da görünür.
 *
 * SERBEST YAZMA AÇIK: listede olmayan küçük yerleşim (nüfusu 15.000 altı)
 * yazılabilir; `cityId` boş kalır (sunucu yine metinden eşlemeyi dener).
 * Kayıt formu, adres defteri, hızlı talep adresi ve Firma Bilgileri aynı
 * bileşeni kullanır.
 */
export function CityCombobox({
  country,
  value,
  onChange,
  ariaLabel,
  id,
  placeholder,
  disabled = false,
  invalid = false,
  className,
}: {
  country: string;
  value: string;
  onChange: (next: { city: string; cityId: number | null }) => void;
  ariaLabel?: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("web.shared.cityPicker");
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<GeoCity[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const q = value.trim();
    if (!open || q.length < 2) {
      setOptions([]);
      return;
    }
    let alive = true;
    const h = setTimeout(() => {
      void searchGeoCities(q, { country, locale, limit: 8 }).then((r) => {
        if (!alive) return;
        setOptions(r);
        setActive(0);
      });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [value, open, country, locale]);

  const choose = (c: GeoCity) => {
    onChange({ city: c.name, cityId: c.id });
    setOpen(false);
    setOptions([]);
  };

  return (
    <div className={cn("relative w-full", className)}>
      {/* Headless `Input`: Catalyst `<Field><Label>` bağlamındaki etiketi bağlar
          (düz <input> etiketsiz kalıyordu — erişilebilir ad ve testler). */}
      <HeadlessInput
        id={id}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        disabled={disabled}
        maxLength={80}
        placeholder={placeholder ?? t("placeholder")}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          // Serbest yazım: seçim bozulur → `cityId` boş (sunucu metinden eşler).
          onChange({ city: e.target.value, cityId: null });
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!options.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(options[active]!);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={cn(
          "block w-full rounded-lg border bg-white px-3 py-2 text-base/6 text-zinc-950 placeholder:text-zinc-500 focus:outline-none disabled:opacity-50 sm:text-sm/6",
          invalid ? "border-red-500" : "border-zinc-950/10 focus:border-zinc-950/20",
        )}
      />
      {open && options.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-zinc-950/10 bg-white p-1 shadow-lg ring-1 ring-zinc-950/5"
        >
          {options.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(c);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("cursor-default rounded-lg px-2.5 py-1.5 text-sm text-zinc-950 select-none", i === active && "bg-zinc-100")}
            >
              {c.name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
