"use client";

import { Checkbox } from "@/components/catalyst/checkbox";
import { Radio, RadioGroup } from "@/components/catalyst/radio";
import { Select } from "@/components/catalyst/select";
import { CategorySelectorButton } from "@/components/categories/category-selector-button";
import { FilesTab } from "@/components/tenders/files-tab";
import { useAddresses } from "@/hooks/use-company-addresses";
import { CurrencyMultiSelect } from "@/components/currency-multi-select";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCategoriesByIds } from "@/hooks/use-categories";
import { DELIVERY_TERM_LABELS } from "@/lib/tenders/labels";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import type { Currency, DeliveryTerm } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Calendar,
  Clock,
  Eye,
  FileText,
  Gavel,
  Info,
  MapPin,
  Star,
  Tag,
  Truck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import {
  Controller,
  useFormContext,
  type FieldPath,
} from "react-hook-form";

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
      <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg border border-surface-border bg-white min-h-[42px] focus-within:ring-2 focus-within:ring-brand-500/30 focus-within:border-brand-500">
        {keywords.map((kw) => (
          <span
            key={kw}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-100/70 text-brand-800 text-xs font-semibold"
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
      <p className="text-[11px] text-slate-400 mt-1">{keywords.length}/10</p>
    </Field>
  );
}

// V2-7 — Açık eksiltme görünürlük modu kartı
function VisibilityOption({
  value,
  title,
  desc,
}: {
  value: "OWN_ONLY" | "BEST_PRICE" | "OWN_RANK" | "BEST_AND_OWN_RANK" | "ALL";
  title: string;
  desc: string;
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
      <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0 mt-0.5">
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

interface Step1Props {
  /** V2-2 — wizard'da `File[]` olarak stage edilen dosyalar. Yayın sonrası R2'ye yüklenir. */
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

export function Step1Info({ listingId }: { listingId?: string }) {
  const {
    register,
    formState: { errors },
    setValue,
    watch,
  } = useFormContext<TenderFormData>();

  const paymentTerm = watch("paymentTerm");
  const primaryCurrency = watch("primaryCurrency");
  const allowedCurrencies = watch("allowedCurrencies") ?? [];
  const tenderType = watch("type");
  const isLogistics = watch("isLogistics");
  const decrementType = watch("priceDecrementType");
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

  // V2-7 — Açık eksiltme seçilince tek para birimi zorunlu + decrement default'ları.
  useEffect(() => {
    if (isAuction) {
      if (allowedCurrencies.length > 1) {
        setValue("allowedCurrencies", [primaryCurrency], {
          shouldValidate: true,
        });
      }
      if (!decrementType) {
        setValue("priceDecrementType", "AMOUNT", { shouldValidate: false });
        setValue("priceDecrementBasis", "OWN_LAST_BID", { shouldValidate: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuction]);

  const categoryIds = watch("categoryIds") ?? [];

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
            hint={`Herkese açık ihaleye premium ${rolPl} davet beklemeden teklif verebilir; davetli ihale yalnızca davet ettiklerinize gider.`}
          >
            <Label>İhale Görünürlüğü</Label>
            <FormRadioGroup
              name="visibility"
              className="grid grid-cols-1 md:grid-cols-2 gap-3"
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

      {/* V2-6 — SECTION: Kategoriler */}
      <section>
        <SectionHeader
          icon={Tag}
          title="Kategoriler"
          description={`İhalenizin konusu olan ürün/hizmet kategorilerini seçin. Birden fazla kategori seçebilirsiniz (en fazla 10). Doğru kategori seçimi, raporlama ve ${rol} eşleştirmesi için kritik.`}
        />
        <Field error={errors.categoryIds?.message as string | undefined}>
          <Label required>Kategoriler</Label>
          <CategorySelectorButton
            value={categoryIds}
            onChange={(ids) =>
              setValue("categoryIds", ids, { shouldValidate: true })
            }
            mode="multi"
            maxSelection={10}
            placeholder="İhale kategorilerini seçin"
            modalTitle="İhale Kategorileri Seç"
            error={errors.categoryIds?.message as string | undefined}
          />
        </Field>
      </section>

      {/* SATIS — Satış Fiyatları: kapsam (TOPLU/KALEM) + toplu alanlar */}
      {isSatis ? (
        <section>
          <SectionHeader
            icon={Wallet}
            title="Satış Fiyatları"
            description="Taban fiyatın altındaki teklifler kabul edilmez. Hemen-al fiyatı verirseniz alıcı o fiyattan anında teklif oluşturabilir (onayınızla sipariş olur)."
          />
          <Field className="mb-4">
            <Label required>Fiyatlandırma</Label>
            <FormRadioGroup
              name="priceScope"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
              <div className="flex items-start gap-3 rounded-lg p-3 ring-1 ring-zinc-950/10 transition-colors has-data-checked:bg-zinc-50 has-data-checked:ring-2 has-data-checked:ring-zinc-900">
                <Radio value="TOPLU" aria-label="Toplu fiyat" className="mt-0.5" />
                <p className="text-sm font-semibold text-zinc-900">
                  Toplu
                  <span className="block text-xs font-normal text-zinc-500">
                    İhale geneli tek taban + tek hemen-al fiyatı.
                  </span>
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-lg p-3 ring-1 ring-zinc-950/10 transition-colors has-data-checked:bg-zinc-50 has-data-checked:ring-2 has-data-checked:ring-zinc-900">
                <Radio
                  value="KALEM"
                  aria-label="Kalem bazlı fiyat"
                  className="mt-0.5"
                />
                <p className="text-sm font-semibold text-zinc-900">
                  Kalem Bazlı
                  <span className="block text-xs font-normal text-zinc-500">
                    Her kaleme ayrı taban + hemen-al birim fiyatı (Kalemler
                    adımında girilir).
                  </span>
                </p>
              </div>
            </FormRadioGroup>
          </Field>
          {watch("priceScope") === "KALEM" ? (
            <div className="rounded-lg border border-brand-100 bg-brand-50/30 p-3 text-xs text-slate-700">
              Kalem taban ve hemen-al birim fiyatlarını{" "}
              <strong>Kalemler adımında</strong> her kalemin üzerinde
              gireceksiniz.
            </div>
          ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field error={errors.minPrice?.message as string | undefined}>
              <Label required htmlFor="satis-min-price">
                Taban Fiyat ({primaryCurrency})
              </Label>
              <Input
                id="satis-min-price"
                type="number"
                min={0}
                step="0.01"
                hasError={!!errors.minPrice}
                {...register("minPrice", {
                  setValueAs: (v) =>
                    v === "" || v == null ? undefined : Number(v),
                })}
              />
            </Field>
            <Field
              error={errors.buyNowPrice?.message as string | undefined}
              hint="Boş bırakılabilir — verilirse taban fiyattan düşük olamaz."
            >
              <Label htmlFor="satis-buynow-price">
                Hemen-Al Fiyatı ({primaryCurrency})
              </Label>
              <Input
                id="satis-buynow-price"
                type="number"
                min={0}
                step="0.01"
                hasError={!!errors.buyNowPrice}
                {...register("buyNowPrice", {
                  setValueAs: (v) =>
                    v === "" || v == null ? undefined : Number(v),
                })}
              />
            </Field>
          </div>
          )}
        </section>
      ) : null}

      {/* Lojistik — seçilen kategori Nakliye/Depolama segmentindeyse açılır */}
      {isLogistics ? <LogisticsSection /> : null}

      {/* V2-7 — SECTION: Teklif ve Sıralama Görünürlüğü (sadece İngiliz Usulü) */}
      {isAuction ? (
        <section>
          <SectionHeader
            icon={Eye}
            title="Teklif ve Sıralama Görünürlüğü"
            description={`${RolPlGen} canlı ${auctionName}da ne göreceğini belirleyin.`}
          />
          <div className="rounded-xl border border-brand-100 bg-brand-50/30 p-4 mb-4 flex items-start gap-2">
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
                desc={`${Rol}, sadece kendi sıralamasını görür.`}
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
            // İngiliz Usulü: decrement kuralı + checkboxlar
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
                        ? "Alıcıların verdiği teklif fiyatları sürekli artsın."
                        : "Tedarikçilerin kalem bazında verdiği teklif fiyatları sürekli azalsın."}
                    </p>
                    <FormRadioGroup
                      name="priceDecrementBasis"
                      className="mt-3 ml-1 space-y-2"
                    >
                      <div className="flex items-start gap-3">
                        <Radio
                          value="OWN_LAST_BID"
                          aria-label="Kendi son teklifini baz alsın"
                          className="mt-0.5"
                        />
                        <p className="text-sm font-semibold text-zinc-900">
                          Kendi son teklifini baz alsın.
                          <span className="block text-xs font-normal text-zinc-500">
                            {isSatis
                              ? "Her yeni teklif, alıcının kendi önceki teklifinden en az artış kadar yüksek olur."
                              : "Her yeni teklif, tedarikçinin kendi önceki teklifinden en az azaltma kadar düşük olur."}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <Radio
                          value="BEST_BID"
                          aria-label="İhaledeki en iyi teklifi baz alsın"
                          className="mt-0.5"
                        />
                        <p className="text-sm font-semibold text-zinc-900">
                          İhaledeki en iyi teklifi baz alsın.
                          <span className="block text-xs font-normal text-zinc-500">
                            {isSatis
                              ? "Yeni teklif vermek için mevcut en yüksek teklifi en az artış kadar geçmek gerekir (klasik açık artırma)."
                              : "Yeni teklif vermek için mevcut en iyi teklifi en az azaltma kadar geçmek gerekir (klasik ters eksiltme)."}
                          </span>
                        </p>
                      </div>
                    </FormRadioGroup>

                    <div className="mt-4 ml-7">
                      <p className="text-xs font-semibold text-slate-700 mb-2">
                        {isSatis
                          ? "Fiyat Artış Seçenekleri"
                          : "Fiyat Azaltma Seçenekleri"}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field
                          error={
                            errors.priceDecrementType?.message as
                              | string
                              | undefined
                          }
                        >
                          <Label htmlFor="priceDecrementType">
                            {isSatis ? "Fiyat Artış Tipi" : "Fiyat Azaltma Tipi"}
                          </Label>
                          <Select
                            id="priceDecrementType"
                            {...register("priceDecrementType")}
                          >
                            <option value="">— Seçiniz —</option>
                            <option value="AMOUNT">Tutar</option>
                            <option value="PERCENT">Yüzde</option>
                          </Select>
                        </Field>
                        <Field
                          error={
                            errors.priceDecrementValue?.message as
                              | string
                              | undefined
                          }
                        >
                          <Label htmlFor="priceDecrementValue">
                            {isSatis
                              ? "Fiyat Artış Değeri"
                              : "Fiyat Azaltma Değeri"}
                          </Label>
                          <div className="relative">
                            <Input
                              id="priceDecrementValue"
                              type="number"
                              step="0.0001"
                              min={0}
                              placeholder="0.00"
                              hasError={!!errors.priceDecrementValue}
                              {...register("priceDecrementValue", {
                                setValueAs: (v) =>
                                  v === "" || v === undefined
                                    ? undefined
                                    : Number(v),
                              })}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">
                              {decrementType === "PERCENT"
                                ? "%"
                                : primaryCurrency}
                            </span>
                          </div>
                        </Field>
                      </div>
                    </div>
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
        </div>
      </section>

      {/* SECTION: Para Birimleri — V2-6 çoklu seçim, 8 birim */}
      <section>
        <SectionHeader
          icon={Wallet}
          title={isAuction ? "İhale Para Ayarları" : "Para Birimleri"}
          description={
            isAuction
              ? `Açık ${auctionName} tek para biriminde yapılır. Ondalık basamak fiyat gösteriminde kullanılır.`
              : `${RolPlGen} hangi para birimlerinde teklif verebileceğini belirle. Birden fazla seçebilirsin; ★ ana para birimi TRY equivalent karşılaştırmasının bazıdır.`
          }
        />
        <div className="space-y-4">
          {isAuction ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field error={errors.primaryCurrency?.message as string | undefined}>
                <Label htmlFor="primaryCurrency" required>
                  İhale Para Birimi
                </Label>
                <Select
                  id="primaryCurrency"
                  value={primaryCurrency}
                  onChange={(e) => {
                    const next = e.target.value as Currency;
                    setValue("primaryCurrency", next, { shouldValidate: true });
                    setValue("allowedCurrencies", [next], {
                      shouldValidate: true,
                    });
                  }}
                >
                  <option value="TRY">TRY</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="CHF">CHF</option>
                  <option value="JPY">JPY</option>
                  <option value="AED">AED</option>
                  <option value="CNY">CNY</option>
                </Select>
              </Field>
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
              <Field>
                <Label htmlFor="auctionExtraCurrencies">
                  Farklı Para Birimi
                </Label>
                <Select
                  id="auctionExtraCurrencies"
                  disabled
                  title="Açık eksiltme tek para biriminde yapılır"
                >
                  <option>—</option>
                </Select>
              </Field>
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
            <Label htmlFor="deliveryTerm">Teslim Şekli</Label>
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
            hint={
              deliveryAddrs.length === 0
                ? "Adres defterinizde teslimat adresi yok — Ayarlar → Adresler'den ekleyin."
                : isSatis
                  ? "Malın bulunduğu / yükleneceği adres — davetli alıcılar görür."
                  : `Davet edilen ${rolPl} bu adresi görür.`
            }
          >
            <Label htmlFor="deliveryAddressId">
              {isSatis ? "Teslim / Yükleme Noktası" : "Teslimat Adresi"}
            </Label>
            <Select id="deliveryAddressId" {...register("deliveryAddressId")}>
              <option value="">— Seçiniz (opsiyonel) —</option>
              {deliveryAddrs.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                  {a.city ? ` — ${a.city}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          {/* SATIS'ta fatura adresi anlamsız: faturayı SİZ kesersiniz, size
              kesilecek fatura yok — alan yalnız ALIM'da. */}
          {isSatis ? null : (
            <Field hint="Yalnızca sizin gördüğünüz fatura adresi (opsiyonel).">
              <Label htmlFor="billingAddressId">Fatura Adresi</Label>
              <Select id="billingAddressId" {...register("billingAddressId")}>
                <option value="">— Seçiniz (opsiyonel) —</option>
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
          <Field error={errors.paymentTerm?.message}>
            <Label required>Ödeme Tipi</Label>
            <FormRadioGroup name="paymentTerm" className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 p-3 rounded-lg ring-1 transition-colors ring-zinc-950/10 has-data-checked:ring-2 has-data-checked:ring-zinc-900 has-data-checked:bg-zinc-50">
                <Radio value="CASH" aria-label="Peşin" />
                <span className="text-sm font-semibold text-zinc-900">Peşin</span>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg ring-1 transition-colors ring-zinc-950/10 has-data-checked:ring-2 has-data-checked:ring-zinc-900 has-data-checked:bg-zinc-50">
                <Radio value="DEFERRED" aria-label="Vadeli" />
                <span className="text-sm font-semibold text-zinc-900">
                  Vadeli
                </span>
              </div>
            </FormRadioGroup>
          </Field>

          {/* Madde 33 — peşin/nakit ödemede teminat mektubu uyarısı */}
          {paymentTerm === "CASH" ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
              <p className="text-xs text-amber-800">
                {isSatis ? (
                  <>
                    Peşin (nakit) satışta parayı önden alan taraf sizsiniz —
                    siparişi onaylarken <strong>teminat mektubu</strong>{" "}
                    yüklemeniz gerekir (teslimat garantisi).
                  </>
                ) : (
                  <>
                    Peşin (nakit) ödemede, <strong>kazanan tedarikçi</strong>{" "}
                    siparişi onaylamadan önce <strong>teminat mektubu</strong>{" "}
                    yüklemek zorundadır (teslimat garantisi).
                  </>
                )}
              </p>
            </div>
          ) : null}

          {paymentTerm === "DEFERRED" ? (
            <Field
              error={errors.paymentDays?.message}
              hint={
                isSatis
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

          {/* Faz 3 madde 16 — Ödeme zamanı: sipariş ödeme akışını belirler. */}
          <Field
            error={errors.paymentTiming?.message}
            hint={
              isSatis
                ? "Teslim öncesi seçilirse siparişi siz onayladıktan sonra, teslim sonrası seçilirse sipariş tamamlanınca alıcı ödeme kaydı girer."
                : "Teslim öncesi seçilirse tedarikçi onayından sonra, teslim sonrası seçilirse sipariş tamamlanınca ödeme kaydı girilebilir."
            }
          >
            <Label required>Ödeme Zamanı</Label>
            <FormRadioGroup
              name="paymentTiming"
              className="grid grid-cols-2 gap-3"
            >
              <div className="flex items-center gap-2 p-3 rounded-lg ring-1 transition-colors ring-zinc-950/10 has-data-checked:ring-2 has-data-checked:ring-zinc-900 has-data-checked:bg-zinc-50">
                <Radio value="BEFORE_DELIVERY" aria-label="Teslim öncesi" />
                <span className="text-sm font-semibold text-zinc-900">
                  Teslim öncesi
                </span>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg ring-1 transition-colors ring-zinc-950/10 has-data-checked:ring-2 has-data-checked:ring-zinc-900 has-data-checked:bg-zinc-50">
                <Radio value="AFTER_DELIVERY" aria-label="Teslim sonrası" />
                <span className="text-sm font-semibold text-zinc-900">
                  Teslim sonrası
                </span>
              </div>
            </FormRadioGroup>
          </Field>
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

          <Field
            error={errors.internalNotes?.message}
            hint={`Sadece kendi ekibiniz görür, ${rolDat} iletilmez.`}
          >
            <Label htmlFor="internalNotes">Dahili Notlar (özel)</Label>
            <Textarea
              id="internalNotes"
              rows={2}
              placeholder="Bütçe, hedef fiyat aralığı, pazarlık notları…"
              hasError={!!errors.internalNotes}
              {...register("internalNotes")}
            />
          </Field>
        </div>
      </section>

      {/* SECTION: İhale Dökümanları (Hüküm/Notlar'ın hemen altında) */}
      <section>
        {listingId ? (
          <FilesTab listingId={listingId} isOwner canEdit />
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
            <p>
              İhale dökümanlarını (şartname, teknik resim vb.) ilanı
              oluşturduktan sonra <strong>Düzenle</strong> ekranından
              ekleyebilirsiniz.
            </p>
          </div>
        )}
      </section>

      {/* SECTION: Zaman */}
      <section>
        <SectionHeader
          icon={Calendar}
          title="Açılış / Kapanış"
          description={`${RolPl} ne zamandan ne zamana kadar teklif verebilecek?`}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            error={errors.bidsOpenAt?.message}
            hint="Boş bırakılırsa yayınlanır anda açılır."
          >
            <Label htmlFor="bidsOpenAt">Açılış Tarihi</Label>
            <Input
              id="bidsOpenAt"
              type="datetime-local"
              min={minDateTime}
              hasError={!!errors.bidsOpenAt}
              {...register("bidsOpenAt")}
            />
          </Field>
          <Field error={errors.bidsCloseAt?.message}>
            <Label htmlFor="bidsCloseAt" required>
              Kapanış Tarihi
            </Label>
            <Input
              id="bidsCloseAt"
              type="datetime-local"
              min={minDateTime}
              hasError={!!errors.bidsCloseAt}
              {...register("bidsCloseAt")}
            />
          </Field>
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
