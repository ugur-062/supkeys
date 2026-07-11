"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Loader2,
  Search,
  Star,
  X as XIcon,
} from "lucide-react";
import { useCurrentExchangeRates } from "@/hooks/use-exchange-rates";
import type { Currency } from "@/lib/format-currency";
import { CURRENCY_NAMES, CURRENCY_SYMBOL } from "@/lib/tenders/labels";

const CURRENCIES: Currency[] = [
  "TRY",
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "JPY",
  "AED",
  "CNY",
  "RUB",
];

interface Props {
  /** Seçili para birimleri (ilk eleman = primary). En az 1 olmalı. */
  value: Currency[];
  onChange: (next: Currency[]) => void;
  /** İlk seçilen birim primary; bu callback ile değiştirilebilir. Sağlanmazsa value[0] kullanılır. */
  primary?: Currency;
  onPrimaryChange?: (next: Currency) => void;
  error?: string;
  disabled?: boolean;
  maxSelection?: number;
}

/**
 * V2-6 — İhale wizard'ı için multi-currency combobox.
 * Trigger: seçili chip listesi (primary star ile işaretli) + sayaç + chevron.
 * Click → popover: arama + 8 currency checkbox listesi, her satır rate (₺ karşılığı).
 * Primary chip üzerine tıklayarak veya dropdown'da star ikonuyla değiştirilebilir.
 */
export function CurrencyMultiSelect({
  value,
  onChange,
  primary,
  onPrimaryChange,
  error,
  disabled,
  maxSelection = 8,
}: Props) {
  const ratesQuery = useCurrentExchangeRates();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Primary defaults to first element if not explicitly provided.
  const effectivePrimary: Currency | undefined = primary ?? value[0];

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    queueMicrotask(() => searchRef.current?.focus());
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!warningMsg) return;
    const t = setTimeout(() => setWarningMsg(null), 3000);
    return () => clearTimeout(t);
  }, [warningMsg]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return CURRENCIES;
    return CURRENCIES.filter(
      (c) =>
        c.toLowerCase().includes(q) ||
        CURRENCY_NAMES[c].toLocaleLowerCase("tr-TR").includes(q),
    );
  }, [search]);

  const formatRate = (c: Currency): string => {
    if (c === "TRY") return "1.0000";
    const rate = ratesQuery.data?.rates?.[c];
    if (rate === undefined) return "...";
    return `₺${rate.toLocaleString("tr-TR", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    })}`;
  };

  const toggle = (c: Currency) => {
    if (disabled) return;
    if (value.includes(c)) {
      if (value.length === 1) {
        setWarningMsg("En az 1 para birimi seçili olmalı");
        return;
      }
      const next = value.filter((x) => x !== c);
      // Removed currency was primary → fall back to next first
      if (c === effectivePrimary && onPrimaryChange) {
        onPrimaryChange(next[0]!);
      }
      onChange(next);
      return;
    }
    if (value.length >= maxSelection) {
      setWarningMsg(`En fazla ${maxSelection} para birimi seçebilirsiniz`);
      return;
    }
    const next = [...value, c];
    onChange(next);
    // İlk eklendiyse primary olarak ata
    if (next.length === 1 && onPrimaryChange) onPrimaryChange(c);
  };

  const setAsPrimary = (c: Currency, e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || !value.includes(c) || !onPrimaryChange) return;
    onPrimaryChange(c);
  };

  return (
    <div className="relative" ref={rootRef}>
      {/* Trigger — combobox role (div, button değil; içeride chip X butonları olabilsin) */}
      <div
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`flex min-h-[52px] w-full cursor-pointer items-center gap-2 rounded-xl border-2 bg-white px-3 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500/30 ${
          disabled ? "cursor-not-allowed opacity-60" : ""
        } ${
          error
            ? "border-rose-300"
            : open
              ? "border-zinc-500"
              : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {value.length === 0 ? (
            <span className="text-sm text-slate-500">
              Para birimlerini seçin
            </span>
          ) : (
            value.map((c) => {
              const isPrimary = c === effectivePrimary;
              return (
                <span
                  key={c}
                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-semibold ${
                    isPrimary
                      ? "border-zinc-500 bg-zinc-50 text-zinc-800"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                  title={`${CURRENCY_NAMES[c]} ${
                    isPrimary ? "(Ana para birimi)" : ""
                  }`}
                >
                  {isPrimary ? (
                    <Star className="h-3 w-3 fill-current text-amber-500" />
                  ) : null}
                  <span className="font-mono">
                    {CURRENCY_SYMBOL[c]} {c}
                  </span>
                  {!disabled && value.length > 1 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(c);
                      }}
                      className="ml-0.5 rounded p-0.5 hover:bg-slate-200 hover:text-rose-600"
                      aria-label={`${c} kaldır`}
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  ) : null}
                </span>
              );
            })
          )}
        </div>
        <span className="flex flex-shrink-0 items-center gap-2 text-xs text-slate-500">
          <span>
            {value.length}/{maxSelection}
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </span>
      </div>

      {error ? (
        <p className="mt-1.5 text-xs text-rose-600">{error}</p>
      ) : null}

      {/* Dropdown */}
      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {/* Search */}
          <div className="border-b border-slate-100 bg-slate-50/60 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Para birimi ara..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
            </div>
            {warningMsg ? (
              <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
                ⚠️ {warningMsg}
              </div>
            ) : null}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {ratesQuery.isLoading && !ratesQuery.data ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">
                Sonuç bulunamadı
              </div>
            ) : (
              <ul role="listbox">
                {filtered.map((c) => {
                  const isSelected = value.includes(c);
                  const isPrimary = c === effectivePrimary;
                  return (
                    <li
                      key={c}
                      role="option"
                      aria-selected={isSelected}
                      className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                        isSelected
                          ? "bg-zinc-50 hover:bg-zinc-100"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(c)}
                        className="flex flex-1 items-center gap-3 text-left"
                      >
                        <div
                          className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 ${
                            isSelected
                              ? "border-zinc-500 bg-zinc-500"
                              : "border-slate-300 bg-white"
                          }`}
                        >
                          {isSelected ? (
                            <Check className="h-3.5 w-3.5 text-white" />
                          ) : null}
                        </div>

                        <div className="flex flex-1 items-center gap-2">
                          <span className="w-7 text-center font-mono text-sm text-slate-500">
                            {CURRENCY_SYMBOL[c]}
                          </span>
                          <span
                            className={`font-mono text-sm ${
                              isSelected
                                ? "font-semibold text-zinc-900"
                                : "text-slate-700"
                            }`}
                          >
                            {c}
                          </span>
                          <span className="text-sm text-slate-500">
                            — {CURRENCY_NAMES[c]}
                          </span>
                        </div>

                        <span className="font-mono text-xs text-slate-500">
                          {formatRate(c)}
                        </span>
                      </button>

                      {isSelected && onPrimaryChange ? (
                        <button
                          type="button"
                          onClick={(e) => setAsPrimary(c, e)}
                          className={`flex-shrink-0 rounded p-1 ${
                            isPrimary
                              ? "text-amber-500"
                              : "text-slate-300 hover:text-amber-500"
                          }`}
                          title={
                            isPrimary
                              ? "Ana para birimi"
                              : "Ana para birimi yap"
                          }
                          aria-label="Ana para birimi"
                        >
                          <Star
                            className={`h-4 w-4 ${
                              isPrimary ? "fill-current" : ""
                            }`}
                          />
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-3 py-2 text-xs">
            <span className="text-slate-600">
              {value.length}/{maxSelection} seçildi · ★ ana
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md bg-zinc-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-600"
            >
              Tamam
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
