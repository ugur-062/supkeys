"use client";

import type { TenderFormData } from "@/lib/tenders/form-schema";
import { cn } from "@/lib/utils";
import { Radio, RadioGroup } from "@headlessui/react";
import { Check, FileText, Gavel, Globe, Info, MapPin, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";

/** Sınır ötesi hedef ülke seçici (çoklu). Boş = tüm yabancı ülkeler.
 *  Firmanın kendi ülkesi seçilemez (yurtiçi tedarikçiler zaten görür). */
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
  desc?: string;
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
            <span className="rounded-md bg-success-100 px-1.5 py-0.5 text-xs font-semibold uppercase text-success-700">
              {badge}
            </span>
          ) : null}
        </span>
        {desc ? (
          <span className="mt-1.5 block text-sm leading-relaxed text-zinc-500">
            {desc}
          </span>
        ) : null}
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

/** Faz 1 — kapsam seçilir; ihale türü seçilMEZ. İlan daima RFQ (kapalı zarf)
 *  açılır — pazarlığa (açık eksiltme) geçişin tek yolu, tur kapanınca "Yeni Tur
 *  Oluştur" ile aktarmadır (taban fiyat + katılımcılar RFQ turundan gelir).
 *  Edit modunda aktarılmış eksiltme/artırma salt-okunur gösterilir. */
export function Step0TypeScope() {
  const { control, watch } = useFormContext<TenderFormData>();
  const isInternational = watch("isInternational");
  // SATIS: aynı format mantığı satış yönüne uyarlanır — RFQ = kapalı zarf
  // teklif toplama (en yüksek kazanır), pazarlık = canlı AÇIK ARTIRMA.
  const isSatis = watch("listingType") === "SATIS";
  const isAuction = watch("type") === "ENGLISH_AUCTION";

  return (
    <div className="space-y-12">
      {isAuction ? (
        /* Pazarlığa aktarılmış ihale (yalnız düzenlemede görülür) — format
           bilgisi burada gösterilmeye devam eder; değiştirilemez. */
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">İhale Türü</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Bu ihale &apos;Pazarlığa Geç&apos; ile pazarlık (açık eksiltme)
            aşamasına aktarılmış.
          </p>
          <div className="mt-5 rounded-2xl border border-zinc-950/10 bg-white p-6">
            <div className="flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white">
                <Gavel className="h-7 w-7" />
              </span>
              <div>
                <p className="text-base font-semibold text-zinc-900">
                  {isSatis ? "Pazarlık (Açık Artırma)" : "Pazarlık (Açık Eksiltme)"}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
                  {isSatis
                    ? "Canlı açık artırma; alıcı sıralaması ve fiyat artış kuralları aktif — fiyat yükselir."
                    : "Canlı açık eksiltme; tedarikçi sıralaması ve fiyat azaltma kuralları aktif."}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
              <p>Format düzenlemeyle değiştirilemez.</p>
            </div>
          </div>
        </div>
      ) : (
        /* Tür seçimi yok (ihale daima kapalı zarf açılır) — koca kart yerine
           tek kompakt bilgi notu; "Yeni Tur" pazarlık keşfi burada kalır. */
        <div className="flex items-start gap-3 rounded-xl border border-zinc-950/10 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
          <p>
            İhaleniz <strong>kapalı zarf</strong> usulüyle açılır —{" "}
            {isSatis ? "alıcılar" : "tedarikçiler"} birbirinin teklifini görmez.
            Kapanıştan sonra dilerseniz “Yeni Tur” ile canlı pazarlığa
            ({isSatis ? "açık artırma" : "açık eksiltme"}) taşıyabilirsiniz.
          </p>
        </div>
      )}

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
              <TileOption value="dom" icon={MapPin} title="Yurtiçi" />
              <TileOption value="intl" icon={Globe} title="Uluslararası" />
            </StepGroup>
          </RadioGroup>
        )}
      />

      {isInternational ? (
        /* Ülke hedefleme KALDIRILDI (ürün kararı 2026-07-27): uluslararası
           ihale TÜM yabancı ülkelerdeki firmalara açıktır (backend'de boş
           targetCountries zaten "tümü" demek; alan formda [] kalır). */
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Uluslararası ihaleniz{" "}
            {isSatis ? "yurt dışındaki tüm alıcılara" : "yurt dışındaki tüm tedarikçilere"}{" "}
            açık olur; <strong>kendi ülkenizdeki firmalara görünmez</strong>.
            Yurtiçinden de teklif almak istiyorsanız ayrı bir yurtiçi ihale
            açabilirsiniz. (Doğrudan davet ettiğiniz firmalar her durumda görür.)
          </p>
        </div>
      ) : null}
    </div>
  );
}
