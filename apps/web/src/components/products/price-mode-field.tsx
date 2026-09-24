"use client";

import { useTranslations } from "next-intl";
import type { PriceTier } from "@/hooks/use-company-items";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";

/**
 * FİYAT MODU — üç seçenekten biri ZORUNLU, hiçbiri yalan gerektirmiyor.
 *
 * Europages'te fiyat tek zorunlu sayı kutusu ve fiyatını açmak istemeyen
 * satıcıların çoğu "1,00 €" yazıp geçiyor; sonuçta alan dolu ama içi yalan,
 * sıralanamaz ve süzülemez hâle geliyor.
 *
 * Üç modun ÜÇÜ DE tamamlanma skorunda tam puan alır — dürüst seçeneği
 * cezalandırmak kullanıcıyı tam da o sahte fiyata iterdi.
 */
const MODES = [
  { value: "FIXED", title: "mode.FIXED.title", body: "mode.FIXED.body" },
  { value: "TIERED", title: "mode.TIERED.title", body: "mode.TIERED.body" },
  { value: "ON_REQUEST", title: "mode.ON_REQUEST.title", body: "mode.ON_REQUEST.body" },
] as const;

export function PriceModeField({
  mode,
  amount,
  tiers,
  currency,
  unit,
  onChange,
}: {
  mode: "FIXED" | "TIERED" | "ON_REQUEST";
  amount: string;
  tiers: PriceTier[];
  currency: string;
  unit: string;
  onChange: (next: {
    mode?: "FIXED" | "TIERED" | "ON_REQUEST";
    amount?: string;
    tiers?: PriceTier[];
    currency?: string;
  }) => void;
}) {
  const tr = useTranslations("web.panel.trade.priceModeField");
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="text-sm font-medium text-zinc-900">{tr("fiyat")}</legend>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {MODES.map((m) => (
            <label
              key={m.value}
              className={`cursor-pointer rounded-xl border p-3 transition ${
                mode === m.value
                  ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900"
                  : "border-zinc-200 hover:border-zinc-300"
              }`}
            >
              <input
                type="radio"
                name="priceMode"
                value={m.value}
                checked={mode === m.value}
                onChange={() => onChange({ mode: m.value })}
                className="sr-only"
              />
              <span className="block text-sm font-semibold text-zinc-950">
                {tr(m.title)}
              </span>
              <span className="mt-1 block text-xs/5 text-zinc-500">{tr(m.body)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {mode === "FIXED" ? (
        <Field>
          <Label htmlFor="fiyat-birim">{tr("birimFiyat")}</Label>
          <div className="flex flex-wrap gap-2">
            <input
              id="fiyat-birim"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => onChange({ amount: e.target.value })}
              placeholder={tr("birimFiyatYerTutucu")}
              className="min-w-0 flex-1 basis-40 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
            />
            <CurrencySelect value={currency} onChange={(c) => onChange({ currency: c })} />
            <span className="flex items-center px-2 text-sm text-zinc-500">
              / {unit}
            </span>
          </div>
        </Field>
      ) : null}

      {mode === "TIERED" ? (
        <div>
          <div className="flex items-center justify-between">
            {/* Bir satır listesinin başlığı — tek kontrol yok, `<label>` bağlanamaz. */}
            <Label as="p">{tr("kademeler")}</Label>
            <CurrencySelect value={currency} onChange={(c) => onChange({ currency: c })} />
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {tr("herSatirSuMiktardanItibaren")}
          </p>
          <ul className="mt-3 space-y-2">
            {tiers.map((t, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  aria-label={tr("kademeBaslangicMiktari", { n: i + 1 })}
                  type="number"
                  min={1}
                  value={t.minQty}
                  onChange={(e) => {
                    const next = [...tiers];
                    next[i] = { ...t, minQty: Number(e.target.value) };
                    onChange({ tiers: next });
                  }}
                  className="w-28 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                />
                <span className="text-sm text-zinc-500">{tr("veUzeri", { unit: unit })}</span>
                <input
                  aria-label={tr("kademeBirimFiyat", { n: i + 1 })}
                  type="number"
                  min={0}
                  step="0.01"
                  value={t.unitPrice}
                  onChange={(e) => {
                    const next = [...tiers];
                    next[i] = { ...t, unitPrice: Number(e.target.value) };
                    onChange({ tiers: next });
                  }}
                  className="w-32 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                />
                <span className="text-sm text-zinc-500">{currency}</span>
                <button
                  type="button"
                  onClick={() => onChange({ tiers: tiers.filter((_, x) => x !== i) })}
                  className="ml-auto rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                  aria-label={tr("kademeyiSil")}
                >
                  <TrashIcon aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          {tiers.length < 10 ? (
            <button
              type="button"
              onClick={() =>
                onChange({
                  tiers: [
                    ...tiers,
                    {
                      minQty: (tiers.at(-1)?.minQty ?? 0) + 100,
                      unitPrice: tiers.at(-1)?.unitPrice ?? 0,
                    },
                  ],
                })
              }
              className="mt-3 inline-flex items-center gap-1 rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <PlusIcon aria-hidden className="size-4" />
              {tr("kademeEkle")}
            </button>
          ) : null}
        </div>
      ) : null}

      {mode === "ON_REQUEST" ? (
        <p className="rounded-xl bg-zinc-50 p-4 text-sm/6 text-zinc-600 ring-1 ring-zinc-950/5">
          {tr.rich("urunSayfasindaFiyatIcinTeklifIsteyinYazacak", { strong: (c) => <strong>{c}</strong> })}
        </p>
      ) : null}
    </div>
  );
}

const CURRENCIES = ["TRY", "USD", "EUR", "GBP"];

function CurrencySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslations("web.panel.trade.priceModeField");
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t("paraBirimi")}
      className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-900"
    >
      {CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
