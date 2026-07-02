"use client";

import { useCompanyAuth } from "@/hooks/use-company-auth";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import { cn } from "@/lib/utils";
import { Radio, RadioGroup } from "@headlessui/react";
import { COUNTRIES } from "@supkeys/shared";
import { Check, FileText, Gavel, Globe, Info, MapPin, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";

/** Sınır ötesi hedef ülke seçici (çoklu). Boş = tüm yabancı ülkeler.
 *  Firmanın kendi ülkesi seçilemez (yurtiçi tedarikçiler zaten görür). */
function TargetCountryPicker({
  value,
  onChange,
  excludeCode,
  rolPl = "tedarikçiler",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  excludeCode?: string;
  /** Karşı taraf çoğul adı — ALIM'da tedarikçiler, SATIS'ta alıcılar. */
  rolPl?: string;
}) {
  const [query, setQuery] = useState("");
  const selectable = useMemo(
    () => COUNTRIES.filter((c) => c.code !== excludeCode),
    [excludeCode],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    return selectable.filter(
      (c) =>
        !q ||
        c.name.toLocaleLowerCase("tr").includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [query, selectable]);
  const toggle = (code: string) =>
    onChange(
      value.includes(code)
        ? value.filter((c) => c !== code)
        : [...value, code],
    );
  const nameOf = (code: string) =>
    COUNTRIES.find((c) => c.code === code)?.name ?? code;

  return (
    <div className="mt-5 rounded-2xl border border-zinc-950/10 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-zinc-900">
          Hedef Ülkeler
        </h3>
        <span className="text-xs font-medium text-zinc-500">
          {value.length === 0
            ? "Tüm ülkeler (sınırlama yok)"
            : `${value.length} ülke seçili`}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        İhalenin açılacağı ülkeleri seçin. Boş bırakırsanız{" "}
        <strong>tüm yabancı ülkelerdeki</strong> {rolPl === "alıcılar" ? "alıcılara" : "tedarikçilere"} açılır.
        Uluslararası ihale olduğu için <strong>yurtiçi {rolPl} görmez</strong>.
      </p>

      {value.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {value.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700"
            >
              {nameOf(code)}
              <button
                type="button"
                onClick={() => toggle(code)}
                aria-label={`${nameOf(code)} ülkesini kaldır`}
                className="text-brand-400 hover:text-brand-700"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ülke ara…"
        aria-label="Hedef ülke ara"
        className="mt-3 w-full rounded-lg border border-surface-border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
      />
      <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-zinc-100">
        {filtered.map((c) => {
          const checked = value.includes(c.code);
          return (
            <label
              key={c.code}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-50"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(c.code)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              <span className="text-zinc-700">{c.name}</span>
              <span className="ml-auto text-xs text-zinc-400">{c.code}</span>
            </label>
          );
        })}
        {filtered.length === 0 ? (
          <div className="px-3 py-3 text-sm text-zinc-400">Sonuç yok</div>
        ) : null}
      </div>
    </div>
  );
}

/** Büyük, tam tıklanabilir seçim kutucuğu (İhale Türü + Kapsam). */
function TileOption({
  value,
  icon: Icon,
  title,
  desc,
  badge,
}: {
  value: string;
  icon: typeof Info;
  title: string;
  desc: string;
  badge?: string;
}) {
  return (
    <Radio
      value={value}
      className={cn(
        "group relative flex cursor-pointer flex-col gap-4 rounded-2xl border bg-white p-6 transition",
        "border-zinc-950/10 hover:border-zinc-950/20 hover:shadow-sm",
        "focus:outline-none data-focus:ring-2 data-focus:ring-brand-500/40",
        "data-checked:border-brand-600 data-checked:bg-brand-50/40 data-checked:ring-1 data-checked:ring-brand-600",
      )}
    >
      {/* Seçili rozeti */}
      <span className="absolute right-4 top-4 hidden h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white group-data-checked:flex">
        <Check className="h-4 w-4" />
      </span>

      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 transition-colors group-data-checked:bg-brand-600 group-data-checked:text-white">
        <Icon className="h-7 w-7" />
      </span>

      <span>
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-zinc-900">{title}</span>
          {badge ? (
            <span className="rounded-md bg-success-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-success-700">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="mt-1.5 block text-sm leading-relaxed text-zinc-500">
          {desc}
        </span>
      </span>
    </Radio>
  );
}

function StepGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500">{hint}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

/** Faz 1 — yalnızca ihale türü ve kapsam seçilir. */
export function Step0TypeScope() {
  const { control, watch } = useFormContext<TenderFormData>();
  const isInternational = watch("isInternational");
  // SATIS: aynı iki format, satış yönüne uyarlanır — RFQ = kapalı zarf teklif
  // toplama (en yüksek kazanır), İngiliz usulü = canlı AÇIK ARTIRMA (fiyat
  // yükselir). Taban + hemen-al fiyatlar adım 1'de.
  const isSatis = watch("listingType") === "SATIS";
  const { company } = useCompanyAuth();

  return (
    <div className="space-y-12">
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <RadioGroup
            value={(field.value ?? "") as string}
            onChange={field.onChange}
          >
            <StepGroup
              title="İhale Türü"
              hint="Teklifleri nasıl toplamak istediğinizi seçin."
            >
              <TileOption
                value="RFQ"
                icon={FileText}
                title="RFQ (Kapalı Teklif)"
                desc={
                  isSatis
                    ? "Alıcılar birbirini görmez. Süre dolunca teklifler açılır; en yüksek teklif kazanır."
                    : "Tedarikçiler birbirini görmez. Süre dolunca teklifler açılır."
                }
              />
              <TileOption
                value="ENGLISH_AUCTION"
                icon={Gavel}
                title={isSatis ? "İngiliz Usulü Açık Artırma" : "İngiliz Usulü"}
                badge="Yeni"
                desc={
                  isSatis
                    ? "Canlı açık artırma; alıcı sıralaması ve fiyat artış kuralları aktif — fiyat yükselir."
                    : "Canlı açık eksiltme; tedarikçi sıralaması ve fiyat azaltma kuralları aktif."
                }
              />
            </StepGroup>
          </RadioGroup>
        )}
      />

      <Controller
        control={control}
        name="isInternational"
        render={({ field }) => (
          <RadioGroup
            value={field.value ? "intl" : "dom"}
            onChange={(v) => field.onChange(v === "intl")}
          >
            <StepGroup
              title="Kapsam"
              hint="Teslim şekli seçenekleri kapsama göre uyarlanır."
            >
              <TileOption
                value="dom"
                icon={MapPin}
                title="Yurtiçi"
                desc={
                  isSatis
                    ? "Yurtiçi satış. Yurtiçi teslim şekilleri (depodan teslim, adrese teslim)."
                    : "Yurtiçi tedarik. Yurtiçi teslim şekilleri (fabrika/depo teslim, adrese teslim)."
                }
              />
              <TileOption
                value="intl"
                icon={Globe}
                title="Uluslararası"
                desc={
                  isSatis
                    ? "Sınır ötesi satış. Incoterms 2020 teslim şekilleri (FOB, CIF, DDP…)."
                    : "Sınır ötesi tedarik. Incoterms 2020 teslim şekilleri (FOB, CIF, DDP…)."
                }
              />
            </StepGroup>
          </RadioGroup>
        )}
      />

      {isInternational ? (
        <Controller
          control={control}
          name="targetCountries"
          render={({ field }) => (
            <TargetCountryPicker
              value={field.value ?? []}
              onChange={field.onChange}
              excludeCode={company?.country}
              rolPl={isSatis ? "alıcılar" : "tedarikçiler"}
            />
          )}
        />
      ) : null}
    </div>
  );
}
