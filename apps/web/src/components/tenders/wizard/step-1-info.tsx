"use client";

import { Checkbox } from "@/components/catalyst/checkbox";
import { Radio, RadioGroup } from "@/components/catalyst/radio";
import { Select } from "@/components/catalyst/select";
import { CategorySelectorButton } from "@/components/categories/category-selector-button";
import { FilesTab } from "@/components/tenders/files-tab";
import {
  StagedDocuments,
  type StagedListingDoc,
} from "./staged-documents";
import { useAddresses } from "@/hooks/use-company-addresses";
import { useCategoriesByIds } from "@/hooks/use-categories";
import { companyApi } from "@/lib/company-auth/api";
import { CurrencyMultiSelect } from "@/components/currency-multi-select";
import { Button } from "@/components/ui/button";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { MoneyInputNumber } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentExchangeRates } from "@/hooks/use-exchange-rates";
import { DELIVERY_TERM_LABELS, KDV_HARIC_NOTE } from "@/lib/tenders/labels";
import type {
  PaymentCategoryValue,
  TenderFormData,
} from "@/lib/tenders/form-schema";
import type { Currency, DeliveryTerm } from "@/lib/tenders/types";
import {
  derivePaymentTiming,
  DOMESTIC_ONLY_PAYMENT_CATEGORIES,
  INTERNATIONAL_ONLY_PAYMENT_CATEGORIES,
} from "@rothern/shared";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Calendar,
  Clock,
  Eye,
  FileText,
  Gavel,
  Info,
  Loader2,
  MapPin,
  Sparkles,
  Star,
  Tag,
  Truck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import {
  Controller,
  useFormContext,
  type FieldPath,
} from "react-hook-form";

/** Ödeme şekli seçenekleri — "Ödeme Zamanı" sorusu KALDIRILDI (Faz 2);
 *  zamanlama seçilen plandan türetilir (derivePaymentTiming). */
const PAYMENT_CATEGORY_OPTIONS: {
  value: PaymentCategoryValue;
  label: string;
  hint: string;
}[] = [
  {
    value: "ADVANCE",
    label: "Peşin",
    hint: "Teslimattan önce ödenir — oran %100 veya kısmi",
  },
  {
    value: "DEFERRED",
    label: "Vadeli",
    hint: "Teslimden sonra belirlenen gün vadeyle",
  },
  {
    value: "OPEN_ACCOUNT",
    label: "Açık Hesap",
    hint: "Teslim sonrası, vadesiz",
  },
  {
    value: "MAL_MUKABILI",
    label: "Mal Mukabili",
    hint: "Malı teslim aldıktan sonra ödeme — vade opsiyonel (dış ticaret)",
  },
  { value: "CHEQUE", label: "Çek", hint: "Vade günlü çek ile" },
  { value: "SENET", label: "Senet", hint: "Vade günlü senet/bono ile" },
  {
    value: "LETTER_OF_CREDIT",
    label: "Akreditif",
    hint: "Banka güvenceli (LC) — belge karşılığı",
  },
  {
    value: "CASH_AGAINST_DOCS",
    label: "Vesaik Mukabili",
    hint: "Belge karşılığı ödeme — banka aracılı (dış ticaret)",
  },
  { value: "CUSTOM", label: "Özel", hint: "Koşulu notta tanımlayın" },
];

/** RHF-bağlı Catalyst Checkbox kartı (step-1 ayar toggle'ları). */
function FormCheckbox({
  name,
  children,
  className,
}: {
  name: FieldPath<TenderFormData>;
  children: React.ReactNode;
  className?: string;
}) {
  const { control } = useFormContext<TenderFormData>();
  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg ring-1 ring-zinc-950/10 hover:bg-zinc-50",
        className,
      )}
    >
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Checkbox
            checked={!!field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            className="mt-0.5"
          />
        )}
      />
      <div className="text-sm font-semibold text-zinc-900">{children}</div>
    </div>
  );
}

/** RHF-bağlı Catalyst RadioGroup sarmalayıcı. İçindeki kartlar
 * `has-data-checked:` ile seçili görünür. */
function FormRadioGroup({
  name,
  className,
  children,
}: {
  name: FieldPath<TenderFormData>;
  className?: string;
  children: React.ReactNode;
}) {
  const { control } = useFormContext<TenderFormData>();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <RadioGroup
          value={(field.value ?? "") as string}
          onChange={field.onChange}
          className={className}
        >
          {children}
        </RadioGroup>
      )}
    />
  );
}

// Yurtiçi — isInternational=false ihalelerde gösterilir.
// Satıcı sorumluluğu artan sırada (EXW→DDP merdiveninin yurtiçi karşılığı).
const DOMESTIC_DELIVERY_TERMS: DeliveryTerm[] = [
  "DOMESTIC_PICKUP",
  "DOMESTIC_CARRIER_COLLECT",
  "DOMESTIC_ON_VEHICLE",
  "DOMESTIC_DELIVERED",
];
// Uluslararası Incoterms — isInternational=true ihalelerde.
const INTERNATIONAL_DELIVERY_TERMS: DeliveryTerm[] = [
  "EXW",
  "FCA",
  "CPT",
  "CIP",
  "DAP",
  "DPU",
  "DDP",
  "FAS",
  "FOB",
  "CFR",
  "CIF",
];

// V2-7 — Anahtar kelimeler input'u: enter veya virgül ile chip ekler
function KeywordsInput() {
  const { setValue, watch, formState: { errors } } = useFormContext<TenderFormData>();
  const keywords = watch("keywords") ?? [];
  const Rol = watch("listingType") === "SATIS" ? "Alıcı" : "Tedarikçi";

  const addKeyword = (raw: string) => {
    const trimmed = raw.trim().slice(0, 50);
    if (!trimmed) return;
    if (keywords.includes(trimmed)) return;
    if (keywords.length >= 10) return;
    setValue("keywords", [...keywords, trimmed], { shouldValidate: true, shouldDirty: true });
  };

  const removeKeyword = (kw: string) => {
    setValue(
      "keywords",
      keywords.filter((k) => k !== kw),
      { shouldValidate: true, shouldDirty: true },
    );
  };

  return (
    <Field
      error={errors.keywords?.message as string | undefined}
      hint={`${Rol} havuzunda arama eşleşmesi için. Enter veya virgülle ayırın, en fazla 10.`}
    >
      <Label htmlFor="keywords-input">Anahtar Kelimeler</Label>
      <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg border border-surface-border bg-white min-h-[42px] focus-within:ring-2 focus-within:ring-brand-500/30 focus-within:border-brand-500">
        {keywords.map((kw) => (
          <span
            key={kw}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-800 text-xs font-semibold"
          >
            {kw}
            <button
              type="button"
              onClick={() => removeKeyword(kw)}
              className="hover:text-danger-600"
              aria-label={`${kw} kaldır`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id="keywords-input"
          type="text"
          maxLength={50}
          placeholder={keywords.length === 0 ? "Örn. monitör, laptop, kırtasiye" : ""}
          className="flex-1 min-w-[120px] text-sm outline-none bg-transparent"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              const t = e.currentTarget;
              addKeyword(t.value);
              t.value = "";
            } else if (e.key === "Backspace" && e.currentTarget.value === "" && keywords.length > 0) {
              removeKeyword(keywords[keywords.length - 1]);
            }
          }}
          onBlur={(e) => {
            const t = e.currentTarget;
            if (t.value) {
              addKeyword(t.value);
              t.value = "";
            }
          }}
        />
      </div>
      <p className="text-xs text-slate-400 mt-1">{keywords.length}/10</p>
    </Field>
  );
}

// V2-7 — Açık eksiltme görünürlük modu kartı
function VisibilityOption({
  value,
  title,
  desc,
  recommended,
}: {
  value: "OWN_ONLY" | "BEST_PRICE" | "OWN_RANK" | "BEST_AND_OWN_RANK" | "ALL";
  title: string;
  desc: string;
  recommended?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 p-3 rounded-lg ring-1 transition-colors",
        "ring-zinc-950/10 has-data-checked:ring-2 has-data-checked:ring-zinc-900 has-data-checked:bg-zinc-50",
      )}
    >
      <div className="flex items-start gap-2">
        <Radio value={value} aria-label={title} className="mt-0.5" />
        <p className="text-sm font-semibold text-zinc-900 leading-tight">
          {title}
          {recommended ? (
            <span className="mt-1 block w-fit rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              Önerilen
            </span>
          ) : null}
        </p>
      </div>
      <p className="text-xs text-zinc-500 ml-5">{desc}</p>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Info;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-9 h-9 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-brand-700" />
      </div>
      <div>
        <h3 className="font-semibold text-base text-brand-900">
          {title}
        </h3>
        {description ? (
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

// UNSPSC Segment 78 = "Nakliye, Depolama ve Posta Hizmetleri" (lojistik).
// Bu segment altındaki tüm kategori kodları "78" ile başlar.
function isLogisticsCategoryCode(code: string): boolean {
  return code.startsWith("78");
}

const TRANSPORT_MODE_OPTIONS = [
  { value: "ROAD", label: "Karayolu" },
  { value: "SEA", label: "Denizyolu" },
  { value: "AIR", label: "Havayolu" },
  { value: "RAIL", label: "Demiryolu" },
  { value: "MULTIMODAL", label: "Karma" },
] as const;

const asOptionalNumber = (v: unknown) =>
  v === "" || v === undefined || v === null ? undefined : Number(v);

function LogisticsSection() {
  const {
    register,
    formState: { errors },
  } = useFormContext<TenderFormData>();
  const lerr = errors.logistics;

  return (
    <section>
      <SectionHeader
        icon={Truck}
        title="Lojistik Bilgileri"
        description="Taşınacak yükün rota, mod ve özelliklerini belirtin."
      />
      <div className="space-y-4">
        {/* Taşıma modu */}
        <Field error={lerr?.transportMode?.message}>
          <Label required>Taşıma Modu</Label>
          <FormRadioGroup
            name="logistics.transportMode"
            className="grid grid-cols-2 md:grid-cols-5 gap-2"
          >
            {TRANSPORT_MODE_OPTIONS.map((o) => (
              <div
                key={o.value}
                className="flex items-center justify-center gap-2 p-2.5 rounded-lg ring-1 text-sm font-medium transition-colors ring-zinc-950/10 has-data-checked:ring-2 has-data-checked:ring-zinc-900 has-data-checked:bg-zinc-50"
              >
                <Radio value={o.value} aria-label={o.label} />
                {o.label}
              </div>
            ))}
          </FormRadioGroup>
        </Field>

        {/* Çıkış / Varış */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Çıkış Noktası
            </p>
            <Field error={lerr?.originCity?.message}>
              <Label htmlFor="lo-origin-city" required>
                İl
              </Label>
              <Input
                id="lo-origin-city"
                placeholder="Örn. İstanbul"
                hasError={!!lerr?.originCity}
                {...register("logistics.originCity")}
              />
            </Field>
            <Field error={lerr?.originDistrict?.message}>
              <Label htmlFor="lo-origin-district">İlçe</Label>
              <Input
                id="lo-origin-district"
                placeholder="Örn. Tuzla"
                {...register("logistics.originDistrict")}
              />
            </Field>
            <Field error={lerr?.originAddress?.message}>
              <Label htmlFor="lo-origin-address">Açık Adres</Label>
              <Textarea
                id="lo-origin-address"
                rows={2}
                placeholder="Yükleme adresi (opsiyonel)"
                {...register("logistics.originAddress")}
              />
            </Field>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Varış Noktası
            </p>
            <Field error={lerr?.destinationCity?.message}>
              <Label htmlFor="lo-dest-city" required>
                İl
              </Label>
              <Input
                id="lo-dest-city"
                placeholder="Örn. Ankara"
                hasError={!!lerr?.destinationCity}
                {...register("logistics.destinationCity")}
              />
            </Field>
            <Field error={lerr?.destinationDistrict?.message}>
              <Label htmlFor="lo-dest-district">İlçe</Label>
              <Input
                id="lo-dest-district"
                placeholder="Örn. Çankaya"
                {...register("logistics.destinationDistrict")}
              />
            </Field>
            <Field error={lerr?.destinationAddress?.message}>
              <Label htmlFor="lo-dest-address">Açık Adres</Label>
              <Textarea
                id="lo-dest-address"
                rows={2}
                placeholder="Teslim adresi (opsiyonel)"
                {...register("logistics.destinationAddress")}
              />
            </Field>
          </div>
        </div>

        {/* Kargo */}
        <Field error={lerr?.cargoType?.message}>
          <Label htmlFor="lo-cargo" required>
            Kargo Cinsi
          </Label>
          <Input
            id="lo-cargo"
            placeholder="Örn. Paletli genel kargo, makine parçası…"
            hasError={!!lerr?.cargoType}
            {...register("logistics.cargoType")}
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field error={lerr?.weightKg?.message}>
            <Label htmlFor="lo-weight">Ağırlık (kg)</Label>
            <Input
              id="lo-weight"
              type="number"
              step="0.01"
              min={0}
              placeholder="0"
              {...register("logistics.weightKg", {
                setValueAs: asOptionalNumber,
              })}
            />
          </Field>
          <Field error={lerr?.volumeM3?.message}>
            <Label htmlFor="lo-volume">Hacim (m³)</Label>
            <Input
              id="lo-volume"
              type="number"
              step="0.01"
              min={0}
              placeholder="0"
              {...register("logistics.volumeM3", {
                setValueAs: asOptionalNumber,
              })}
            />
          </Field>
          <Field error={lerr?.packageCount?.message}>
            <Label htmlFor="lo-pkg">Kap / Palet Sayısı</Label>
            <Input
              id="lo-pkg"
              type="number"
              step="1"
              min={0}
              placeholder="0"
              {...register("logistics.packageCount", {
                setValueAs: asOptionalNumber,
              })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field error={lerr?.vehicleType?.message}>
            <Label htmlFor="lo-vehicle">Araç / Ekipman Tipi</Label>
            <Input
              id="lo-vehicle"
              placeholder="Örn. Tır (tenteli), Frigo, 40' konteyner"
              {...register("logistics.vehicleType")}
            />
          </Field>
          <Field error={lerr?.loadingDate?.message}>
            <Label htmlFor="lo-loading">Yükleme Tarihi</Label>
            <Input
              id="lo-loading"
              type="date"
              {...register("logistics.loadingDate")}
            />
          </Field>
          <Field error={lerr?.deliveryDate?.message}>
            <Label htmlFor="lo-delivery">Teslim Tarihi</Label>
            <Input
              id="lo-delivery"
              type="date"
              {...register("logistics.deliveryDate")}
            />
          </Field>
        </div>

        {/* Özel durumlar */}
        <Field>
          <Label>Özel Durumlar</Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(
              [
                ["hazardous", "Tehlikeli Madde (ADR)"],
                ["refrigerated", "Soğuk Zincir"],
                ["fragile", "Kırılabilir"],
                ["stackable", "İstiflenebilir"],
              ] as const
            ).map(([key, label]) => (
              <FormCheckbox
                key={key}
                name={`logistics.${key}` as const}
                className="!p-2.5 items-center"
              >
                <span className="font-normal">{label}</span>
              </FormCheckbox>
            ))}
          </div>
        </Field>

        <Field error={lerr?.notes?.message}>
          <Label htmlFor="lo-notes">Lojistik Notu</Label>
          <Textarea
            id="lo-notes"
            rows={2}
            placeholder="Özel taşıma koşulları, sigorta, gümrük vb. (opsiyonel)"
            {...register("logistics.notes")}
          />
        </Field>
      </div>
    </section>
  );
}

export function Step1Info({
  listingId,
  stagedDocs = [],
  onStagedDocsChange,
}: {
  listingId?: string;
  /** Create modu: ilan kaydedilince yüklenecek dökümanlar (wizard state'i). */
  stagedDocs?: StagedListingDoc[];
  onStagedDocsChange?: (docs: StagedListingDoc[]) => void;
}) {
  const {
    register,
    control,
    formState: { errors },
    setValue,
    watch,
  } = useFormContext<TenderFormData>();

  const paymentCategory = watch("paymentCategory");
  const selectedPaymentHint = PAYMENT_CATEGORY_OPTIONS.find(
    (o) => o.value === paymentCategory,
  )?.hint;
  const advancePercent = watch("advancePercent");
  const lcType = watch("lcType");
  const billingSameAsDelivery = watch("billingSameAsDelivery");
  const primaryCurrency = watch("primaryCurrency");
  const allowedCurrencies = watch("allowedCurrencies") ?? [];
  const tenderType = watch("type");
  const autoExtendOnLateBid = watch("autoExtendOnLateBid");
  const isAuction = tenderType === "ENGLISH_AUCTION";
  const isSatis = watch("listingType") === "SATIS";
  // SATIS'ta karşı taraf ALICI'dır; İngiliz usulünde fiyat YÜKSELİR (artırma).
  const rol = isSatis ? "alıcı" : "tedarikçi";
  const rolPl = isSatis ? "alıcılar" : "tedarikçiler";
  const rolDat = isSatis ? "alıcıya" : "tedarikçiye";
  const Rol = isSatis ? "Alıcı" : "Tedarikçi";
  const RolDat = isSatis ? "Alıcıya" : "Tedarikçiye";
  const RolPl = isSatis ? "Alıcılar" : "Tedarikçiler";
  const RolPlDat = isSatis ? "Alıcılara" : "Tedarikçilere";
  const RolPlGen = isSatis ? "Alıcıların" : "Tedarikçilerin";
  const auctionName = isSatis ? "artırma" : "eksiltme";
  const isInternational = watch("isInternational");

  const categoryIds = watch("categoryIds") ?? [];
  const isLogistics = watch("isLogistics");

  // Lojistik — seçilen kategorilerden biri Nakliye/Depolama/Posta segmentinde
  // (UNSPSC kod 78…) ise ihale otomatik "lojistik" olur ve taşıma alanları açılır.
  const selectedCategories = useCategoriesByIds(categoryIds);
  const categoriesAreLogistics = (selectedCategories.data ?? []).some((c) =>
    isLogisticsCategoryCode(c.code),
  );
  useEffect(() => {
    if (categoriesAreLogistics !== isLogistics) {
      setValue("isLogistics", categoriesAreLogistics, { shouldValidate: true });
    }
  }, [categoriesAreLogistics, isLogistics, setValue]);

  // "AI ile bul" — bir önceki adımda girilen kalem adlarından ≤3 doğrulanmış
  // L3 kategori önerisi. Açık kullanıcı eylemi olduğundan mevcut seçimin
  // ÜZERİNE yazar; bağlayıcı değil, kullanıcı dilediğince değiştirir.
  // 403/503 (paket/AI kapalı) butonu kalıcı gizler — manuel seçici hep durur.
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApplied, setAiApplied] = useState(false);
  const [aiHidden, setAiHidden] = useState(false);
  const suggestCategories = async () => {
    if (aiLoading) return;
    const named = (watch("items") ?? [])
      .map((i) => ({
        name: (i?.name ?? "").trim().slice(0, 300),
        description: (i?.description ?? "").trim().slice(0, 500) || undefined,
      }))
      .filter((i) => i.name.length >= 2);
    if (named.length === 0) {
      toast.error("Önce Kalemler adımında en az bir kalem adı girin");
      return;
    }
    setAiLoading(true);
    try {
      const r = await companyApi.post<{
        categoryIds: string[];
        keywords?: string[];
      }>("/company/ai/tender-extract/category-suggest", { items: named });
      const ids = r.data?.categoryIds;
      if (Array.isArray(ids) && ids.length > 0) {
        setValue("categoryIds", ids.slice(0, 3), {
          shouldValidate: true,
          shouldDirty: true,
        });
        // Anahtar kelimeler: kullanıcı elle yazdıysa ÜZERİNE YAZMA — yalnız
        // alan boşken AI üretimiyle doldur.
        const kw = (r.data?.keywords ?? [])
          .filter((k): k is string => typeof k === "string" && !!k.trim())
          .map((k) => k.trim().slice(0, 50))
          .slice(0, 10);
        if (kw.length > 0 && (watch("keywords") ?? []).length === 0) {
          setValue("keywords", kw, { shouldValidate: true, shouldDirty: true });
        }
        setAiApplied(true);
      } else {
        toast.info("AI kalemlerinize uygun bir kategori bulamadı — listeden seçin");
      }
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 403 || status === 503) {
        setAiHidden(true);
      } else {
        toast.error("Kategori önerisi alınamadı — listeden seçebilirsiniz");
      }
    } finally {
      setAiLoading(false);
    }
  };
  // datetime-local "min" — geçmiş tarih seçimini anında engeller (yerel saat).
  const minDateTime = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  const { data: addresses } = useAddresses();
  const deliveryAddrs = (addresses ?? []).filter(
    (a) => a.type === "TESLIMAT" || a.type === "ILETISIM",
  );
  const billingAddrs = (addresses ?? []).filter((a) => a.type === "FATURA");
  const deliveryTerm = watch("deliveryTerm");
  // Madde 23: SATIS süresiz ihale — kapanış alanı gizlenir.
  const noCloseDate = watch("noCloseDate");
  const deliveryTermOptions = isInternational
    ? INTERNATIONAL_DELIVERY_TERMS
    : DOMESTIC_DELIVERY_TERMS;

  // Kapsam (yurtiçi/uluslararası) değişince, seçili teslim şekli yeni kapsama
  // uygun değilse temizle — yurtiçide kalan bir Incoterm (ya da tersi) kalmasın.
  useEffect(() => {
    if (deliveryTerm && !deliveryTermOptions.includes(deliveryTerm)) {
      setValue("deliveryTerm", undefined, { shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInternational]);

  // Aynı kural ödeme şeklinde: kapsam değişince yeni kapsama uymayan seçim
  // varsayılana çekilir (yurtiçi → açık hesap; uluslararası → peşin).
  useEffect(() => {
    if (
      !isInternational &&
      INTERNATIONAL_ONLY_PAYMENT_CATEGORIES.includes(paymentCategory)
    ) {
      setValue("paymentCategory", "OPEN_ACCOUNT", { shouldValidate: false });
    }
    if (
      isInternational &&
      DOMESTIC_ONLY_PAYMENT_CATEGORIES.includes(paymentCategory)
    ) {
      setValue("paymentCategory", "ADVANCE", { shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInternational]);

  // PEŞİN'e GEÇİLDİĞİNDE teminat şartını öner (otomatik işaretlenir; kullanıcı
  // kaldırabilir). Mount'ta çalışmaz — edit modunda sahibin kayıtlı tercihi
  // ezilmez. Başka kategoriye dönünce bayrak temizlenir (yalnız Peşin'de
  // anlamlı — LC'de garanti zaten bankada; backend de false'a normalize eder).
  const prevPaymentCategoryRef = useRef(paymentCategory);
  useEffect(() => {
    const prev = prevPaymentCategoryRef.current;
    prevPaymentCategoryRef.current = paymentCategory;
    if (prev === paymentCategory) return;
    // SATIS'ta teminat mektubu seçeneği YOK (madde 22) — öneri de yapılmaz.
    setValue(
      "requireGuaranteeLetter",
      !isSatis && paymentCategory === "ADVANCE",
      {
        shouldValidate: false,
        shouldDirty: true,
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentCategory]);

  // Kısmi peşin YALNIZ yurtiçi — kapsam uluslararasına dönerse %100'e çek
  // (gizlenen alanda görünmez validasyon hatası kalmasın).
  useEffect(() => {
    if (
      isInternational &&
      paymentCategory === "ADVANCE" &&
      (advancePercent ?? 100) !== 100
    ) {
      setValue("advancePercent", 100, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInternational, paymentCategory, advancePercent]);

  return (
    <div className="space-y-8">
      {/* SECTION: Genel Bilgiler */}
      <section>
        <SectionHeader
          icon={Info}
          title="Genel Bilgiler"
          description="İhalenize ad verin ve kısaca tanımlayın."
        />
        <div className="space-y-4">
          <Field error={errors.title?.message}>
            <Label htmlFor="title" required>
              İhale Adı
            </Label>
            <Input
              id="title"
              placeholder="Örn. 2026 Q3 IT Sarf Malzeme Alımı"
              hasError={!!errors.title}
              {...register("title")}
            />
          </Field>

          <Field error={errors.description?.message}>
            <Label htmlFor="description">Açıklama</Label>
            <Textarea
              id="description"
              rows={3}
              placeholder="İhalenin amacı, kapsamı, özel gereksinimler…"
              hasError={!!errors.description}
              {...register("description")}
            />
          </Field>

          <KeywordsInput />

          {/* Açık İhale — görünürlük */}
          <Field
            hint={`Davetli: yalnız seçtikleriniz. Bağlantılarıma Açık: bağlı ${rolPl} davet beklemeden görür. Herkese Açık: ek olarak premium ${rolPl} de teklif verir.`}
          >
            <Label>İhale Görünürlüğü</Label>
            <FormRadioGroup
              name="visibility"
              className="grid grid-cols-1 md:grid-cols-3 gap-3"
            >
              <div className="flex items-start gap-3 p-3 rounded-lg ring-1 transition-colors ring-zinc-950/10 has-data-checked:ring-2 has-data-checked:ring-zinc-900 has-data-checked:bg-zinc-50">
                <Radio value="PRIVATE" aria-label="Davetli (Kapalı)" className="mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-zinc-900">
                    Davetli (Kapalı)
                  </p>
                  <p className="text-xs text-zinc-500">
                    Sadece davet ettiğiniz {rolPl} görür ve teklif verir.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg ring-1 transition-colors ring-zinc-950/10 has-data-checked:ring-2 has-data-checked:ring-zinc-900 has-data-checked:bg-zinc-50">
                <Radio value="CONNECTIONS" aria-label="Bağlantılarıma Açık" className="mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-zinc-900">
                    Bağlantılarıma Açık
                  </p>
                  <p className="text-xs text-zinc-500">
                    Bağlantılı {rolPl} davet beklemeden görür ve teklif verir;
                    premium/herkese-açık değil.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg ring-1 transition-colors ring-zinc-950/10 has-data-checked:ring-2 has-data-checked:ring-zinc-900 has-data-checked:bg-zinc-50">
                <Radio value="PUBLIC" aria-label="Herkese Açık" className="mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-zinc-900">
                    Herkese Açık
                  </p>
                  <p className="text-xs text-zinc-500">
                    Davetlilere ek olarak premium {rolPl} de teklif
                    verebilir. (Kapalı zarf gizliliği korunur.)
                  </p>
                </div>
              </div>
            </FormRadioGroup>
          </Field>
        </div>
      </section>

      {/* V2-6 — SECTION: Kategoriler (+ "AI ile bul": girdi = önceki adımın kalemleri) */}
      <section>
        <SectionHeader
          icon={Tag}
          title="Kategoriler"
          description={`İhalenizin ana konusunu tanımlayan kategoriyi seçin (gerekiyorsa en fazla 3). Doğru kategori seçimi, raporlama ve ${rol} eşleştirmesi için kritik.`}
        />
        {/* Hata metnini yalnız CategorySelectorButton basar (Field'a da
            verilirse aynı mesaj iki kez görünüyordu). */}
        <Field>
          <div className="flex flex-wrap items-center gap-2">
            <Label required>Kategoriler</Label>
            {!aiHidden ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={suggestCategories}
                disabled={aiLoading}
              >
                {aiLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {aiLoading ? "AI kategorileri buluyor…" : "AI ile bul"}
              </Button>
            ) : null}
            {aiApplied ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-800 ring-1 ring-zinc-300">
                <Sparkles className="h-3 w-3" />
                AI önerisi — kontrol edin
              </span>
            ) : null}
          </div>
          <div className="mt-2">
            <CategorySelectorButton
              value={categoryIds}
              onChange={(ids) => {
                setAiApplied(false);
                setValue("categoryIds", ids, { shouldValidate: true });
              }}
              mode="multi"
              maxSelection={3}
              placeholder="İhale kategorilerini seçin"
              modalTitle="İhale Kategorileri Seç"
              error={errors.categoryIds?.message as string | undefined}
            />
          </div>
        </Field>
      </section>

      {/* Lojistik — seçilen kategori Nakliye/Depolama segmentindeyse açılır */}
      {isLogistics ? <LogisticsSection /> : null}

      {/* SATIS — Satış Fiyatları: toplu alanlar (kapsam Kalemler adımında seçildi) */}
      {isSatis ? (
        <section>
          <SectionHeader
            icon={Wallet}
            title="Satış Fiyatları"
            description="Taban fiyatın altındaki teklifler kabul edilmez. Hemen-al fiyatı verirseniz alıcı o fiyattan anında teklif oluşturabilir (onayınızla sipariş olur)."
          />
          {watch("priceScope") === "KALEM" ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-slate-700">
              Kalem Bazlı fiyatlandırma seçtiniz — taban ve hemen-al birim
              fiyatları <strong>Kalemler adımında</strong> kalem üzerinde
              girilir.
            </div>
          ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field error={errors.minPrice?.message as string | undefined}>
              <Label required htmlFor="satis-min-price">
                Taban Fiyat ({primaryCurrency})
              </Label>
              <Controller
                control={control}
                name="minPrice"
                render={({ field }) => (
                  <MoneyInputNumber
                    id="satis-min-price"
                    hasError={!!errors.minPrice}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </Field>
            <Field
              error={errors.buyNowPrice?.message as string | undefined}
              hint="Boş bırakılabilir — verilirse taban fiyattan düşük olamaz."
            >
              <Label htmlFor="satis-buynow-price">
                Hemen Al Fiyatı ({primaryCurrency})
              </Label>
              <Controller
                control={control}
                name="buyNowPrice"
                render={({ field }) => (
                  <MoneyInputNumber
                    id="satis-buynow-price"
                    hasError={!!errors.buyNowPrice}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </Field>
          </div>
          )}
        </section>
      ) : null}

      {/* V2-7 — SECTION: Teklif ve Sıralama Görünürlüğü (sadece İngiliz Usulü) */}
      {isAuction ? (
        <section>
          <SectionHeader
            icon={Eye}
            title="Teklif ve Sıralama Görünürlüğü"
            description={`${RolPlGen} canlı ${auctionName}da ne göreceğini belirleyin.`}
          />
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 mb-4 flex items-start gap-2">
            <Info className="w-4 h-4 text-brand-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-slate-700">
              Yapacağınız seçimlerin hiçbirinde {rolPl} birbirlerinin ismini
              göremez.
            </p>
          </div>
          <Field error={errors.bidVisibility?.message as string | undefined}>
            <FormRadioGroup
              name="bidVisibility"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3"
            >
              <VisibilityOption
                value="OWN_ONLY"
                title="Sadece kendi teklifi"
                desc={`${Rol}, ihaledeki hiçbir teklifi ve sıralamayı göremez.`}
              />
              <VisibilityOption
                value="BEST_PRICE"
                title="Sadece en iyi teklif"
                desc={`${Rol}, ihaledeki en iyi teklifi görür.`}
              />
              <VisibilityOption
                value="OWN_RANK"
                title="Sadece kendi sıralaması"
                desc={`${Rol}, sadece kendi sıralamasını görür. Rekabet baskısı yaratır, fiyat bilgisi sızdırmaz — çoğu ihale için en dengeli mod.`}
                recommended
              />
              <VisibilityOption
                value="BEST_AND_OWN_RANK"
                title="En iyi teklif ve kendi sıralaması"
                desc={`${Rol}, ihaledeki en iyi teklifi ve kendi sıralamasını görür.`}
              />
              <VisibilityOption
                value="ALL"
                title="Tüm teklifler ve sıralama"
                desc={`${Rol}, ihaledeki tüm teklifleri ve sıralamaları görür.`}
              />
            </FormRadioGroup>
          </Field>
        </section>
      ) : null}

      {/* SECTION: İhale Kuralları */}
      <section>
        <SectionHeader
          icon={Gavel}
          title="İhale Kuralları"
          description={`${RolPlGen} teklif verme şeklini belirleyin.`}
        />
        <div className="space-y-3">
          {isAuction ? (
            // Pazarlık kuralları: monotonluk + turda tek teklif. Minimum
            // azaltma payı kaldırıldı (2026-07-13) — zorunlu pay çıpa etkisi
            // yaratıyordu; tek-teklif hakkı sembolik indirimi zaten caydırır.
            <>
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked
                    disabled
                    className="mt-0.5"
                    aria-label={
                      isSatis
                        ? "Fiyatlar sürekli artar (sabit kural)"
                        : "Fiyatlar sürekli azalır (sabit kural)"
                    }
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-brand-900">
                      {isSatis
                        ? "Alıcıların verdiği teklif fiyatları sürekli artar."
                        : "Tedarikçilerin verdiği teklif fiyatları sürekli azalır."}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {isSatis
                        ? "Her yeni teklif, o firmanın kendi önceki teklifinden yüksek olmalıdır."
                        : "Her yeni teklif, o firmanın kendi önceki teklifinden düşük olmalıdır."}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-start gap-3 border-t border-slate-100 pt-3">
                  <Checkbox
                    checked
                    disabled
                    className="mt-0.5"
                    aria-label="Tur başına tek teklif (sabit kural)"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-brand-900">
                      Her firma tur başına bir teklif verir.
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Gönderilen teklif o turda değiştirilemez; yeni fiyat için
                      yeni tur açılır. Önceki turdan taşınan teklif bu hakkı
                      kullanmaz.
                    </p>
                  </div>
                </div>
              </div>

              <FormCheckbox name="requireAllItems">
                {`${RolPlGen} tüm kalemlere teklif vermesi zorunludur.`}
              </FormCheckbox>
              <FormCheckbox name="requireBidDocument">
                {`${RolPlGen}, teklif dosyası yüklemesi zorunludur.`}
              </FormCheckbox>
              {/* Kapanış hatırlatması artık otomatik — kullanıcıya sorulmaz. */}

              {/* Auto-extend (son dakika teklif → süre uzatma) */}
              <FormCheckbox name="autoExtendOnLateBid">
                <p>Son dakika gelen teklif kapanışı otomatik uzatsın.</p>
                <p className="text-xs font-normal text-zinc-500">
                  Kapanışa az süre kalmışken yeni teklif gelirse süre uzatılır
                  (snipe koruma).
                </p>
              </FormCheckbox>
              {autoExtendOnLateBid ? (
                <div className="ml-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field
                    error={
                      errors.autoExtendThresholdMin?.message as
                        | string
                        | undefined
                    }
                    hint="Kapanışa kaç dk kala teklif gelirse uzatılsın"
                  >
                    <Label htmlFor="autoExtendThresholdMin">
                      Eşik (dk)
                    </Label>
                    <Input
                      id="autoExtendThresholdMin"
                      type="number"
                      min={1}
                      max={30}
                      placeholder="2"
                      hasError={!!errors.autoExtendThresholdMin}
                      {...register("autoExtendThresholdMin", {
                        setValueAs: (v) =>
                          v === "" || v === undefined
                            ? undefined
                            : Number(v),
                      })}
                    />
                  </Field>
                  <Field
                    error={
                      errors.autoExtendByMinutes?.message as
                        | string
                        | undefined
                    }
                    hint="Her uzatmada eklenecek süre"
                  >
                    <Label htmlFor="autoExtendByMinutes">
                      Uzatma (dk)
                    </Label>
                    <Input
                      id="autoExtendByMinutes"
                      type="number"
                      min={1}
                      max={30}
                      placeholder="2"
                      hasError={!!errors.autoExtendByMinutes}
                      {...register("autoExtendByMinutes", {
                        setValueAs: (v) =>
                          v === "" || v === undefined
                            ? undefined
                            : Number(v),
                      })}
                    />
                  </Field>
                </div>
              ) : null}
            </>
          ) : (
            // RFQ: mevcut kurallar
            <>
              <FormCheckbox name="isSealedBid">
                <p>Kapalı Zarf (varsayılan)</p>
                <p className="text-xs font-normal text-zinc-500">
                  {RolPl} birbirinin tekliflerini görmez. Süre dolunca tüm
                  teklifler size açılır.
                </p>
              </FormCheckbox>
              <FormCheckbox name="requireAllItems">
                <p>Tüm kalemlere teklif zorunlu</p>
                <p className="text-xs font-normal text-zinc-500">
                  {Rol} tek bir kaleme teklif veremez; tümüne fiyat girmek
                  zorundadır.
                </p>
              </FormCheckbox>
              <FormCheckbox name="requireBidDocument">
                <p>Teklif dosyası zorunlu</p>
                <p className="text-xs font-normal text-zinc-500">
                  {Rol} teklifi gönderirken en az 1 dosya yüklemelidir.
                </p>
              </FormCheckbox>
              {/* Kapanış hatırlatması artık otomatik: kapanıştan önce, henüz
                  teklif vermemiş davetlilere gönderilir (kullanıcıya sorulmaz). */}
            </>
          )}
          {/* CC-1: kalem hedef/istenen fiyatının karşı tarafa görünürlüğü — RFQ
              ve auction'da aynı; varsayılan kapalı (çıpalama riski). */}
          <FormCheckbox name="showTargetToSuppliers">
            <p>
              Hedef fiyatları {isSatis ? "alıcılara" : "tedarikçilere"} göster
            </p>
            <p className="text-xs font-normal text-zinc-500">
              Kapalı (varsayılan): kalem hedef/istenen birim fiyatları yalnız
              sizde kalır. Açarsanız {isSatis ? "alıcılar" : "tedarikçiler"} bu
              fiyatı görür — teklifler o rakama yakınsayabilir.
            </p>
          </FormCheckbox>
        </div>
      </section>

      {/* SECTION: Para Birimleri — V2-6 çoklu seçim, 8 birim */}
      <section>
        <SectionHeader
          icon={Wallet}
          title={isAuction ? "İhale Para Ayarları" : "Para Birimleri"}
          description={
            isAuction
              ? `${RolPlGen} kendi para biriminde ${isSatis ? "artırır" : "azaltır"} — pay, açılış günü TCMB kuruyla birimine çevrilir. Ondalık basamak fiyat gösteriminde kullanılır.`
              : `${RolPlGen} hangi para birimlerinde teklif verebileceğini belirleyin. Birden fazla seçebilirsiniz; ★ ana para birimi TRY equivalent karşılaştırmasının bazıdır.`
          }
        />
        <div className="space-y-4">
          {isAuction ? (
            <div className="space-y-4">
              <Field
                error={
                  (errors.allowedCurrencies?.message as string | undefined) ??
                  (errors.primaryCurrency?.message as string | undefined)
                }
              >
                <Label required>Para Birimleri</Label>
                <CurrencyMultiSelect
                  value={allowedCurrencies as Currency[]}
                  onChange={(next) => {
                    setValue("allowedCurrencies", next, {
                      shouldValidate: true,
                      shouldDirty: true,
                    });
                    if (!next.includes(primaryCurrency)) {
                      setValue("primaryCurrency", next[0] ?? "TRY", {
                        shouldValidate: true,
                      });
                    }
                  }}
                  primary={primaryCurrency}
                  onPrimaryChange={(p) =>
                    setValue("primaryCurrency", p, { shouldValidate: true })
                  }
                  error={
                    (errors.allowedCurrencies?.message as string | undefined) ??
                    (errors.primaryCurrency?.message as string | undefined)
                  }
                />
              </Field>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field error={errors.decimalPlaces?.message as string | undefined}>
                  <Label htmlFor="decimalPlaces" required>
                    Ondalık Basamak İzni
                  </Label>
                  <Select
                    id="decimalPlaces"
                    {...register("decimalPlaces", {
                      setValueAs: (v) => Number(v),
                    })}
                  >
                    <option value="0">0</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </Select>
                </Field>
              </div>
              {allowedCurrencies.length > 1 ? (
                <p className="text-xs text-slate-500">
                  {isSatis ? "Artış" : "Azaltma"} payı ★ ana birimde tanımlanır;
                  tur açılışında o günün TCMB kuruyla diğer birimlere sabitlenir
                  — her {rol} yalnız kendi biriminde{" "}
                  {isSatis ? "artırır" : "azaltır"}.
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <Field
                error={
                  (errors.allowedCurrencies?.message as string | undefined) ??
                  (errors.primaryCurrency?.message as string | undefined)
                }
              >
                <Label required>Para Birimleri</Label>
                <CurrencyMultiSelect
                  value={allowedCurrencies as Currency[]}
                  onChange={(next) => {
                    setValue("allowedCurrencies", next, {
                      shouldValidate: true,
                      shouldDirty: true,
                    });
                    if (!next.includes(primaryCurrency)) {
                      setValue("primaryCurrency", next[0] ?? "TRY", {
                        shouldValidate: true,
                      });
                    }
                  }}
                  primary={primaryCurrency}
                  onPrimaryChange={(p) =>
                    setValue("primaryCurrency", p, { shouldValidate: true })
                  }
                  error={
                    (errors.allowedCurrencies?.message as string | undefined) ??
                    (errors.primaryCurrency?.message as string | undefined)
                  }
                />
              </Field>

              {primaryCurrency && primaryCurrency !== "TRY" ? (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-success-50 border border-success-200 text-xs text-success-900">
                  <Info className="w-4 h-4 text-success-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold mb-0.5">
                      TCMB Kuru ile Otomatik Karşılaştırma
                    </p>
                    <p className="text-success-800/80">
                      Ana para birimi olarak {primaryCurrency} seçildi. Diğer
                      birimlerdeki teklifler {rol === "alıcı" ? "alıcının" : "tedarikçinin"} gönderim tarihindeki
                      TCMB kuruyla TRY'ye çevrilerek karşılaştırılır.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Yayınlandıktan sonra para birimleri değiştirilemez.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* SECTION: Teslimat */}
      <section>
        <SectionHeader
          icon={Truck}
          title="Teslimat"
          description="Teslim şekli ve adresi (Incoterms 2020)"
        />
        <div className="space-y-4">
          <Field
            error={errors.deliveryTerm?.message}
            hint={
              isInternational
                ? "Uluslararası — Incoterms"
                : "Yurtiçi teslim şekli"
            }
          >
            <Label htmlFor="deliveryTerm" required>
              Teslim Şekli
            </Label>
            <Select id="deliveryTerm" {...register("deliveryTerm")}>
              <option value="">— Seçiniz —</option>
              {deliveryTermOptions.map((t) => (
                <option key={t} value={t}>
                  {DELIVERY_TERM_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            error={errors.deliveryAddressId?.message}
            hint={
              deliveryAddrs.length === 0
                ? "Adres defterinizde teslimat adresi yok — Ayarlar → Adresler'den ekleyin."
                : isSatis
                  ? "Opsiyonel — malın bulunduğu / yükleneceği adres; davetli alıcılar görür."
                  : `Opsiyonel — hizmet ihalesinde boş bırakabilirsiniz. Seçilirse davet edilen ${rolPl} görür.`
            }
          >
            <Label htmlFor="deliveryAddressId">
              {isSatis ? "Teslim / Yükleme Noktası" : "Teslimat Adresi"}
            </Label>
            <Select id="deliveryAddressId" {...register("deliveryAddressId")}>
              <option value="">— Seçiniz —</option>
              {deliveryAddrs.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                  {a.city ? ` — ${a.city}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          {/* SATIS'ta fatura adresi anlamsız: faturayı SİZ kesersiniz, size
              kesilecek fatura yok — alan yalnız ALIM'da. Varsayılan: fatura
              adresi = teslimat adresi (tik); tik kaldırılırsa seçim zorunlu. */}
          {isSatis ? null : (
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={billingSameAsDelivery}
                  onChange={(e) => {
                    setValue("billingSameAsDelivery", e.target.checked, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    if (e.target.checked) {
                      setValue("billingAddressId", undefined, {
                        shouldValidate: true,
                      });
                    }
                  }}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Fatura adresim teslimat adresim ile aynı
              </label>
              {billingSameAsDelivery ? null : (
                <Field
                  error={errors.billingAddressId?.message}
                  hint="Yalnızca sizin gördüğünüz fatura adresi."
                >
                  <Label htmlFor="billingAddressId" required>
                    Fatura Adresi
                  </Label>
                  <Select
                    id="billingAddressId"
                    {...register("billingAddressId")}
                  >
                    <option value="">— Seçiniz —</option>
                    {billingAddrs.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                        {a.city ? ` — ${a.city}` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
          )}
        </div>
      </section>

      {/* SECTION: Ödeme */}
      <section>
        <SectionHeader
          icon={Wallet}
          title="Ödeme Koşulları"
          description={
            isSatis
              ? "Alıcının faturayı nasıl ödeyeceğini belirtin."
              : "Faturanın nasıl ödeneceğini belirtin."
          }
        />
        <div className="space-y-4">
          <Field error={errors.paymentCategory?.message}>
            <Label htmlFor="paymentCategory" required>
              Ödeme Şekli
            </Label>
            <p className="mb-2 text-xs text-zinc-400">{KDV_HARIC_NOTE}</p>
            <div className="sm:max-w-xs">
              <Select
                id="paymentCategory"
                invalid={!!errors.paymentCategory}
                {...register("paymentCategory")}
              >
                {PAYMENT_CATEGORY_OPTIONS.filter(
                  // Kapsama uyan şekiller listelenir: dış-ticaret şekilleri
                  // (akreditif/vesaik/mal mukabili) yalnız uluslararası;
                  // açık hesap/çek/senet yalnız yurtiçi (madde 20).
                  (o) =>
                    isInternational
                      ? !DOMESTIC_ONLY_PAYMENT_CATEGORIES.includes(o.value)
                      : !INTERNATIONAL_ONLY_PAYMENT_CATEGORIES.includes(
                          o.value,
                        ),
                ).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            {selectedPaymentHint ? (
              <p className="mt-1.5 text-xs text-zinc-500">
                {selectedPaymentHint}
              </p>
            ) : null}
          </Field>

          {/* PEŞİN — oran; kısmi peşin YALNIZ yurtiçi (uluslararasında %100). */}
          {paymentCategory === "ADVANCE" ? (
            isInternational ? (
              <p className="text-xs text-zinc-500">
                Uluslararası ihalede peşin ödeme <strong>tam (%100)</strong>{" "}
                uygulanır — kısmi peşin yalnız yurtiçi ihalelerde seçilebilir.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  error={errors.advancePercent?.message}
                  hint="%100 = tam peşin. Daha düşük oranda kalan kısım teslim sonrası ödenir."
                >
                  <Label htmlFor="advancePercent">Peşin Oranı (%)</Label>
                  <Input
                    id="advancePercent"
                    type="number"
                    min={1}
                    max={100}
                    placeholder="100"
                    hasError={!!errors.advancePercent}
                    {...register("advancePercent", {
                      setValueAs: (v) =>
                        v === "" || v === undefined ? undefined : Number(v),
                    })}
                  />
                </Field>
                {(advancePercent ?? 100) < 100 ? (
                  <Field
                    error={errors.paymentDays?.message}
                    hint="Boş bırakılırsa kalan tutar teslimde/açık hesap ödenir."
                  >
                    <Label htmlFor="paymentDays">Kalan İçin Vade (gün)</Label>
                    <Input
                      id="paymentDays"
                      type="number"
                      min={1}
                      max={365}
                      placeholder="30"
                      hasError={!!errors.paymentDays}
                      {...register("paymentDays", {
                        setValueAs: (v) =>
                          v === "" || v === undefined ? undefined : Number(v),
                      })}
                    />
                  </Field>
                ) : null}
              </div>
            )
          ) : null}

          {/* VADELİ / ÇEK / SENET — vade günü zorunlu (tek paymentDays alanı). */}
          {paymentCategory === "DEFERRED" ||
          paymentCategory === "CHEQUE" ||
          paymentCategory === "SENET" ? (
            <Field
              error={errors.paymentDays?.message}
              hint={
                paymentCategory === "CHEQUE"
                  ? "Çekin vadesi kaç gün olacak?"
                  : paymentCategory === "SENET"
                    ? "Senedin vadesi kaç gün olacak?"
                    : isSatis
                      ? "Alıcı faturayı kaç gün vadede ödeyecek?"
                      : "Faturayı kaç gün vadede ödeyeceksiniz?"
              }
            >
              <Label htmlFor="paymentDays" required>
                Vade Gün Sayısı
              </Label>
              <Input
                id="paymentDays"
                type="number"
                min={1}
                max={365}
                placeholder="30"
                hasError={!!errors.paymentDays}
                {...register("paymentDays", {
                  setValueAs: (v) =>
                    v === "" || v === undefined ? undefined : Number(v),
                })}
              />
            </Field>
          ) : null}

          {/* MAL MUKABİLİ — vade OPSİYONEL (boş = teslimde muaccel). */}
          {paymentCategory === "MAL_MUKABILI" ? (
            <Field
              error={errors.paymentDays?.message}
              hint="Boş bırakılırsa teslimde ödenir. Gün girilirse teslimden o kadar gün sonra vade takip edilir."
            >
              <Label htmlFor="paymentDays">Vade (gün) — opsiyonel</Label>
              <Input
                id="paymentDays"
                type="number"
                min={1}
                max={365}
                placeholder="30"
                hasError={!!errors.paymentDays}
                {...register("paymentDays", {
                  setValueAs: (v) =>
                    v === "" || v === undefined ? undefined : Number(v),
                })}
              />
            </Field>
          ) : null}

          {/* AKREDİTİF — alt tip + Usance vadesi + Teyitli. */}
          {paymentCategory === "LETTER_OF_CREDIT" ? (
            <div className="space-y-3">
              <Field error={errors.lcType?.message}>
                <Label required>Akreditif Tipi</Label>
                <FormRadioGroup name="lcType" className="grid grid-cols-2 gap-3">
                  <div className="flex items-start gap-2 p-3 rounded-lg ring-1 transition-colors ring-zinc-950/10 has-data-checked:ring-2 has-data-checked:ring-zinc-900 has-data-checked:bg-zinc-50">
                    <Radio value="SIGHT" aria-label="Sight" className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-zinc-900">
                        Sight
                      </span>
                      <span className="block text-xs text-zinc-500">
                        Belgeler bankaya sunulunca ödenir
                      </span>
                    </span>
                  </div>
                  <div className="flex items-start gap-2 p-3 rounded-lg ring-1 transition-colors ring-zinc-950/10 has-data-checked:ring-2 has-data-checked:ring-zinc-900 has-data-checked:bg-zinc-50">
                    <Radio value="USANCE" aria-label="Usance" className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-zinc-900">
                        Usance
                      </span>
                      <span className="block text-xs text-zinc-500">
                        Belge ibrazından sonra vadeyle ödenir
                      </span>
                    </span>
                  </div>
                </FormRadioGroup>
              </Field>
              {lcType === "USANCE" ? (
                <Field
                  error={errors.paymentDays?.message}
                  hint="Belge ibrazından itibaren vade (30/60/90 gün gibi)."
                >
                  <Label htmlFor="paymentDays" required>
                    Vade Gün Sayısı
                  </Label>
                  <Input
                    id="paymentDays"
                    type="number"
                    min={1}
                    max={365}
                    placeholder="90"
                    hasError={!!errors.paymentDays}
                    {...register("paymentDays", {
                      setValueAs: (v) =>
                        v === "" || v === undefined ? undefined : Number(v),
                    })}
                  />
                </Field>
              ) : null}
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  {...register("lcConfirmed")}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300"
                />
                <span className="text-xs text-zinc-600">
                  <span className="font-semibold text-zinc-900">
                    Teyitli akreditif
                  </span>
                  <br />
                  İkinci bir banka da ödeme garantisi verir — karşı tarafın
                  ülke/banka riski yüksekse tercih edilir.
                </span>
              </label>
            </div>
          ) : null}

          {/* Ödeme notu — Özel'de zorunlu koşul, diğerlerinde opsiyonel ek şart. */}
          <Field
            error={errors.paymentNote?.message}
            hint={
              paymentCategory === "CUSTOM"
                ? `Ödeme koşulunu açıkça yazın — ${rolPl} teklif vermeden görür.`
                : "Opsiyonel — devredilebilir/rotatif akreditif gibi ek şartları buraya yazın."
            }
          >
            <Label htmlFor="paymentNote" required={paymentCategory === "CUSTOM"}>
              Ödeme Koşulu Notu
            </Label>
            <Textarea
              id="paymentNote"
              rows={2}
              placeholder="Örn. %30 sipariş onayında, kalan mal kabulünde…"
              hasError={!!errors.paymentNote}
              {...register("paymentNote")}
            />
          </Field>

          {/* Türetilen zamanlama — soru DEĞİL, bilgi. */}
          <p className="text-xs text-zinc-500">
            Ödeme zamanlaması seçiminizden otomatik belirlenir:{" "}
            <strong>
              {derivePaymentTiming(paymentCategory) === "BEFORE_DELIVERY"
                ? "teslim öncesi"
                : "teslim sonrası"}
            </strong>
            . Ayrıca sorulmaz.
          </p>

          {/* Teminat mektubu seçeneği — yalnız ALIM + PEŞİN'de: alıcı parayı
              önden verdiği için sistem teslimat garantisi ÖNERİR (otomatik
              işaretli), karar ilan sahibinindir. SATIS'ta kaldırıldı (madde 22). */}
          {!isSatis && paymentCategory === "ADVANCE" ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  {...register("requireGuaranteeLetter")}
                  className="mt-0.5 h-4 w-4 rounded border-amber-300"
                />
                <span className="text-xs text-amber-800">
                  <span className="font-semibold">
                    Teminat mektubu iste{" "}
                    <span className="rounded bg-amber-200/70 px-1 py-px text-xs font-semibold uppercase">
                      Önerilir
                    </span>
                  </span>
                  <br />
                  {isSatis ? (
                    <>
                      Peşin ödemede parayı önden alan taraf sizsiniz —
                      işaretlerseniz siparişi onaylamadan önce{" "}
                      <strong>teminat mektubu</strong> yüklemeniz gerekir
                      (teslimat garantisi, alıcıya güven verir).
                    </>
                  ) : (
                    <>
                      İşaretlerseniz <strong>kazanan tedarikçi</strong> siparişi
                      onaylamadan önce <strong>teminat mektubu</strong> yüklemek
                      zorunda olur (teslimat garantisi). İşaretlemezseniz
                      teminat istenmez.
                    </>
                  )}
                </span>
              </label>
            </div>
          ) : null}
        </div>
      </section>

      {/* SECTION: Hüküm/Notlar */}
      <section>
        <SectionHeader
          icon={FileText}
          title="Hüküm, Koşullar & Notlar"
          description={`${RolDat} iletilecek ek bilgiler.`}
        />
        <div className="space-y-4">
          <Field
            error={errors.termsAndConditions?.message}
            hint={`${RolPlDat} açık metin olarak gösterilir.`}
          >
            <Label htmlFor="termsAndConditions">Hüküm ve Koşullar</Label>
            <Textarea
              id="termsAndConditions"
              rows={3}
              placeholder="Garanti, iade, gecikme cezası, KDV durumu…"
              hasError={!!errors.termsAndConditions}
              {...register("termsAndConditions")}
            />
          </Field>
          {/* Dahili Notlar wizard'dan kaldırıldı (2026-08-02) — yayın
              sonrası ⋮ menüsündeki "İç Notlar" dialoğundan girilir. */}
        </div>
      </section>

      {/* SECTION: İhale Dökümanları (Hüküm/Notlar'ın hemen altında).
          Edit: doğrudan yüklenir (FilesTab). Create: staged — ilan
          kaydedilince (taslak/yayın) sırayla yüklenir. */}
      <section>
        {listingId ? (
          <FilesTab listingId={listingId} isOwner canEdit />
        ) : (
          <StagedDocuments
            docs={stagedDocs}
            onChange={(d) => onStagedDocsChange?.(d)}
          />
        )}
      </section>

      {/* SECTION: Zaman */}
      <section>
        <SectionHeader
          icon={Calendar}
          title="Açılış / Kapanış"
          description={`${RolPl} ne zamandan ne zamana kadar teklif verebilecek?`}
        />
        {/* Alt alta: kompakt tarih+saat grupları yan yana iki kolonda boşluklu
            ve dengesiz duruyordu. */}
        <div className="space-y-4">
          <Field
            error={errors.bidsOpenAt?.message}
            hint="Şimdiki zaman öntanımlıdır (yayınlanınca hemen açılır); ileri bir tarih seçerseniz ihale o ana kadar tekliflere kapalı kalır."
          >
            <Label htmlFor="bidsOpenAt-date">Açılış Tarihi</Label>
            <Controller
              control={control}
              name="bidsOpenAt"
              render={({ field }) => (
                <DateTimeInput
                  idPrefix="bidsOpenAt"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  defaultTime="00:00"
                  min={minDateTime}
                  hasError={!!errors.bidsOpenAt}
                  dateAriaLabel="Açılış tarihi"
                  timeAriaLabel="Açılış saati"
                />
              )}
            />
          </Field>
          {/* Madde 23: SATIS ilanı SÜRESİZ açılabilir — kapanış tarihi yok,
              ilan sahibi kapatana/kazandırana kadar açık kalır. */}
          {isSatis ? (
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                {...register("noCloseDate")}
                className="h-4 w-4 rounded border-zinc-300"
              />
              Süresiz ihale (kapanış tarihi yok)
            </label>
          ) : null}
          {isSatis && noCloseDate ? (
            <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              İhale süresiz açık kalır — siz kapatana ya da kazandırana kadar
              teklif alınır.
            </p>
          ) : (
            <Field
              error={errors.bidsCloseAt?.message}
              hint="Saat seçmezseniz ihale gün sonunda (23:59) kapanır."
            >
              <Label htmlFor="bidsCloseAt-date" required>
                Kapanış Tarihi
              </Label>
              <Controller
                control={control}
                name="bidsCloseAt"
                render={({ field }) => (
                  <DateTimeInput
                    idPrefix="bidsCloseAt"
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    defaultTime="23:59"
                    min={minDateTime}
                    hasError={!!errors.bidsCloseAt}
                    dateAriaLabel="Kapanış tarihi"
                    timeAriaLabel="Kapanış saati"
                  />
                )}
              />
            </Field>
          )}
        </div>
        <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
          <Clock className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
          <p>
            Kapanış tarihinden sonra teklif kabul edilmez ve ihale kazandırma
            aşamasına geçer.
          </p>
        </div>
      </section>
    </div>
  );
}
