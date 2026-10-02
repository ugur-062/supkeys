"use client";

import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { CheckIcon, ChevronDownIcon } from "@heroicons/react/16/solid";
import { COUNTRIES, countryFlag, foldSearchText } from "@rothern/shared";
import type { Locale } from "@rothern/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { countryDisplayName } from "@/i18n/domain";
import { cn } from "@/lib/utils";

/**
 * ARANABİLİR ÜLKE SEÇİCİ (2026-09-27, kayıt tüm ülkelere açıldı): 245 ülkelik
 * native <select> kaydırılarak kullanılamazdı. Kayıt formu, adres defteri,
 * hızlı talep adresi ve banka ülkesi AYNI bileşeni kullanır.
 *
 * Arama: ekrandaki dilde ad + Türkçe ad + ISO kodu, katlanmış (ç=c, İ=i…) —
 * "almanya", "germany", "de" hepsi Almanya'yı bulur. Türkiye her zaman başta.
 */
export function CountryCombobox({
  value,
  onChange,
  codes,
  ariaLabel,
  id,
  disabled = false,
  className,
}: {
  value: string;
  onChange: (code: string) => void;
  /** Seçilebilir kodlar (varsayılan tam liste; kayıt formunda kapalı ülkeler hariç). */
  codes?: readonly string[];
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("web.shared.countryPicker");
  const [query, setQuery] = useState("");
  const options = useMemo(() => {
    const allowed = codes ? new Set(codes) : null;
    const rows = COUNTRIES.filter((c) => !allowed || allowed.has(c.code)).map((c) => {
      const label = countryDisplayName(c.code, locale);
      return { code: c.code, label, flag: countryFlag(c.code), hay: foldSearchText(`${label} ${c.name} ${c.code}`) };
    });
    const [tr, rest] = [rows.filter((r) => r.code === "TR"), rows.filter((r) => r.code !== "TR")];
    return [...tr, ...rest.sort((a, b) => a.label.localeCompare(b.label, locale))];
  }, [codes, locale]);
  const q = foldSearchText(query.trim());
  const filtered = q ? options.filter((o) => o.hay.includes(q)) : options;
  const selected = options.find((o) => o.code === value) ?? null;

  return (
    <Combobox
      value={selected}
      onChange={(o: (typeof options)[number] | null) => {
        if (o) onChange(o.code);
      }}
      onClose={() => setQuery("")}
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
          displayValue={(o: (typeof options)[number] | null) => (o ? `${o.flag ? `${o.flag} ` : ""}${o.label}` : "")}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("placeholder")}
          autoComplete="off"
          className="block w-full rounded-lg border border-zinc-950/10 bg-white py-[calc(--spacing(2.5)-1px)] pr-9 pl-[calc(--spacing(3.5)-1px)] sm:py-[calc(--spacing(1.5)-1px)] sm:pl-[calc(--spacing(3)-1px)] text-base/6 text-zinc-950 placeholder:text-zinc-500 focus:border-zinc-950/20 focus:outline-none disabled:opacity-50 sm:text-sm/6"
        />
        <ComboboxButton className="absolute inset-y-0 right-0 flex items-center px-2.5" aria-label={t("open")}>
          <ChevronDownIcon className="size-4 fill-zinc-500" aria-hidden="true" />
        </ComboboxButton>
      </div>
      <ComboboxOptions
        anchor="bottom start"
        className="z-50 max-h-72 w-(--input-width) min-w-64 overflow-auto rounded-xl border border-zinc-950/10 bg-white p-1 shadow-lg ring-1 ring-zinc-950/5 empty:invisible [--anchor-gap:0.25rem]"
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-sm text-zinc-500">{t("noResults")}</div>
        ) : (
          filtered.map((o) => (
            <ComboboxOption
              key={o.code}
              value={o}
              className="group flex cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-zinc-950 select-none data-focus:bg-zinc-100"
            >
              <span className="w-5 shrink-0 text-center" aria-hidden="true">
                {o.flag ?? ""}
              </span>
              <span className="flex-1 truncate">{o.label}</span>
              <CheckIcon className="invisible size-4 fill-zinc-950 group-data-selected:visible" aria-hidden="true" />
            </ComboboxOption>
          ))
        )}
      </ComboboxOptions>
    </Combobox>
  );
}
