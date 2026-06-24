"use client";

import { AddressFields } from "@/components/registration/address-fields";
import { Select } from "@/components/catalyst/select";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategorySelectorButton } from "@/components/categories/category-selector-button";
import { SegmentOnlyPicker } from "@/components/categories/segment-only-picker";
import {
  useCompleteTenantOnboarding,
  type TenantOnboardingPayload,
} from "@/hooks/use-tenant-onboarding";
import type { AuthUser } from "@/lib/auth/types";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  COUNTRIES,
  countryName,
  isValidTaxIdForCountry,
  isValidTckn,
} from "@supkeys/shared";
import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const TITLE_OPTIONS = [
  "Yönetici",
  "Genel Müdür",
  "Müdür",
  "Firma Sahibi",
  "Yetkili",
  "Diğer",
];

const schema = z
  .object({
    legalName: z.string().min(2, "Yasal firma ünvanı zorunlu"),
    companyType: z.enum(["JOINT_STOCK", "LIMITED", "SOLE_PROPRIETOR"]),
    country: z.string().min(2).default("TR"),
    taxNumber: z.string().min(4, "Vergi/sicil numarası zorunlu"),
    taxOffice: z.string().optional().default(""),
    city: z.string().min(1, "Şehir zorunlu"),
    district: z.string().optional().default(""),
    stateRegion: z.string().optional().default(""),
    neighborhood: z.string().optional().default(""),
    postalCode: z.string().optional().default(""),
    addressLine: z.string().min(5, "Açık adres zorunlu"),
    billingTitle: z.string().optional(),
    billingEmail: z
      .string()
      .email("Geçerli bir e-posta giriniz")
      .optional()
      .or(z.literal("")),
    authorizedTckn: z.string().optional().default(""),
    authorizedTitle: z.string().min(2, "Ünvan/rol seçin"),
    mainCategoryIds: z
      .array(z.string())
      .min(1, "En az 1 ana kategori seçin")
      .max(3, "En fazla 3 ana kategori"),
    subCategoryIds: z.array(z.string()).default([]),
  })
  .superRefine((v, ctx) => {
    const isTR = (v.country || "TR") === "TR";
    const isSole = v.companyType === "SOLE_PROPRIETOR";
    if (!isValidTaxIdForCountry(v.taxNumber, v.country || "TR", isSole)) {
      ctx.addIssue({
        path: ["taxNumber"],
        code: z.ZodIssueCode.custom,
        message: isTR
          ? isSole
            ? "11 haneli geçerli TCKN giriniz"
            : "10 haneli geçerli vergi numarası giriniz"
          : "Geçerli bir vergi/sicil numarası giriniz",
      });
    }
    if (isTR) {
      if (!isValidTckn(v.authorizedTckn)) {
        ctx.addIssue({
          path: ["authorizedTckn"],
          code: z.ZodIssueCode.custom,
          message: "Geçerli bir T.C. Kimlik No giriniz",
        });
      }
      if (!v.taxOffice || v.taxOffice.trim().length < 2) {
        ctx.addIssue({
          path: ["taxOffice"],
          code: z.ZodIssueCode.custom,
          message: "Vergi dairesi zorunlu",
        });
      }
      if (!v.district || v.district.trim().length < 1) {
        ctx.addIssue({
          path: ["district"],
          code: z.ZodIssueCode.custom,
          message: "İlçe seçin",
        });
      }
    }
  });

type FormValues = z.infer<typeof schema>;

const STEP_FIELDS: Record<number, (keyof FormValues)[]> = {
  1: [
    "legalName",
    "companyType",
    "country",
    "taxNumber",
    "taxOffice",
    "city",
    "district",
    "stateRegion",
    "neighborhood",
    "postalCode",
    "addressLine",
    "billingEmail",
  ],
  2: ["authorizedTckn", "authorizedTitle", "mainCategoryIds"],
};

export function TenantOnboardingWizard({
  tenant,
  user,
  onDone,
}: {
  tenant: AuthUser["tenant"];
  user: Pick<AuthUser, "firstName" | "lastName">;
  onDone: () => void | Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [declared, setDeclared] = useState(false);
  const complete = useCompleteTenantOnboarding();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: {
      legalName: tenant.legalName ?? tenant.name ?? "",
      companyType: tenant.companyType ?? "LIMITED",
      country: tenant.country ?? "TR",
      taxNumber: tenant.taxNumber ?? "",
      taxOffice: tenant.taxOffice ?? "",
      city: tenant.city ?? "",
      district: tenant.district ?? "",
      stateRegion: tenant.stateRegion ?? "",
      neighborhood: tenant.neighborhood ?? "",
      postalCode: tenant.postalCode ?? "",
      addressLine: tenant.addressLine ?? "",
      billingTitle: tenant.billingTitle ?? "",
      billingEmail: tenant.billingEmail ?? "",
      authorizedTckn: tenant.authorizedTckn ?? "",
      authorizedTitle: tenant.authorizedTitle ?? "",
      mainCategoryIds: tenant.sectorCategoryIds ?? [],
      subCategoryIds: tenant.subCategoryIds ?? [],
    },
  });

  const {
    control,
    register,
    watch,
    setValue,
    trigger,
    getValues,
    formState: { errors },
  } = form;

  const next = async () => {
    const ok = await trigger(STEP_FIELDS[step]);
    if (ok) setStep((s) => s + 1);
  };

  const submit = async () => {
    const ok = await trigger();
    if (!ok) {
      setStep(1);
      return;
    }
    if (!declared) {
      toast.error("Beyanı onaylamanız gerekiyor");
      return;
    }
    const v = getValues();
    const payload: TenantOnboardingPayload = {
      legalName: v.legalName,
      companyType: v.companyType,
      country: v.country || "TR",
      taxNumber: v.taxNumber,
      taxOffice: v.taxOffice?.trim() || undefined,
      city: v.city,
      district: v.district?.trim() || undefined,
      stateRegion: v.stateRegion?.trim() || undefined,
      neighborhood: v.neighborhood?.trim() || undefined,
      postalCode: v.postalCode?.trim() || undefined,
      addressLine: v.addressLine,
      billingTitle: v.billingTitle?.trim() || undefined,
      billingEmail: v.billingEmail?.trim() || undefined,
      authorizedTckn: v.authorizedTckn?.trim() || undefined,
      authorizedTitle: v.authorizedTitle,
      mainCategoryIds: v.mainCategoryIds,
      subCategoryIds: v.subCategoryIds,
    };
    complete.mutate(payload, {
      onSuccess: async () => {
        toast.success("Firma bilgileriniz kaydedildi");
        await onDone();
      },
      onError: () => toast.error("Kaydedilemedi, lütfen tekrar deneyin"),
    });
  };

  const isTR = (watch("country") || "TR") === "TR";

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Stepper step={step} />

      <div className="mt-6 rounded-2xl border border-zinc-950/10 bg-white p-6 shadow-sm">
        {step === 1 ? (
          <div className="space-y-5">
            <SectionTitle
              title="Şirket Bilgileri"
              desc="Yasal firma unvanı, firma türü, vergi bilgileri ve adresler."
            />
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field error={errors.legalName?.message}>
                <Label required>Firma Ünvanı</Label>
                <Input
                  {...register("legalName")}
                  placeholder="Yasal firma unvanı"
                />
              </Field>
              <Field error={errors.country?.message}>
                <Label required>Ülke</Label>
                <Controller
                  control={control}
                  name="country"
                  render={({ field }) => (
                    <Select {...field}>
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field error={errors.companyType?.message}>
                <Label required>Firma Türü</Label>
                <Controller
                  control={control}
                  name="companyType"
                  render={({ field }) => (
                    <Select {...field}>
                      <option value="LIMITED">
                        {isTR ? "Limited Şirket" : "Limited / LLC"}
                      </option>
                      <option value="JOINT_STOCK">
                        {isTR ? "Anonim Şirket (A.Ş.)" : "Anonim / Corporation"}
                      </option>
                      <option value="SOLE_PROPRIETOR">
                        {isTR ? "Şahıs Şirketi" : "Şahıs / Sole Proprietor"}
                      </option>
                    </Select>
                  )}
                />
              </Field>
              <Field
                error={errors.taxNumber?.message}
                hint={
                  !isTR
                    ? "VAT / sicil no"
                    : watch("companyType") === "SOLE_PROPRIETOR"
                      ? "Şahıs → 11 haneli TCKN"
                      : "Tüzel kişi → 10 haneli VKN"
                }
              >
                <Label required>
                  {isTR ? "Vergi Kimlik No / TC" : "Vergi / Sicil No"}
                </Label>
                <Input
                  {...register("taxNumber")}
                  inputMode={isTR ? "numeric" : "text"}
                  maxLength={isTR ? 11 : 30}
                  placeholder={isTR ? "VKN/TCKN" : "VAT / Tax ID"}
                />
              </Field>
            </div>
            {isTR ? (
              <Field error={errors.taxOffice?.message}>
                <Label required>Vergi Dairesi</Label>
                <Input {...register("taxOffice")} placeholder="Vergi dairesi" />
              </Field>
            ) : null}

            <div className="border-t border-zinc-100 pt-5">
              <p className="mb-3 text-sm font-semibold text-zinc-900">
                Fatura Adresi
              </p>
              <div className="space-y-5">
                <AddressFields
                  control={control}
                  errors={errors}
                  watch={watch}
                  setValue={setValue}
                />
                {isTR ? (
                  <Field error={errors.neighborhood?.message}>
                    <Label required>Mahalle</Label>
                    <Input {...register("neighborhood")} placeholder="Mahalle" />
                  </Field>
                ) : null}
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <Field hint="Opsiyonel">
                    <Label>Fatura Ünvanı</Label>
                    <Input
                      {...register("billingTitle")}
                      placeholder="Boşsa firma ünvanı kullanılır"
                    />
                  </Field>
                  <Field error={errors.billingEmail?.message} hint="Opsiyonel">
                    <Label>Fatura E-postası</Label>
                    <Input
                      {...register("billingEmail")}
                      type="email"
                      placeholder="fatura@firma.com"
                    />
                  </Field>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <SectionTitle
              title="Kişisel Bilgiler"
              desc="Yetkili kişi T.C. kimlik numarası, ünvan ve faaliyet sektörü."
            />
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field hint="Kayıt sırasında alındı">
                <Label>Ad</Label>
                <Input value={user.firstName} disabled readOnly />
              </Field>
              <Field hint="Kayıt sırasında alındı">
                <Label>Soyad</Label>
                <Input value={user.lastName} disabled readOnly />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field
                error={errors.authorizedTckn?.message}
                hint={isTR ? "Fatura/ödeme akışlarında kullanılır" : "Opsiyonel"}
              >
                <Label required={isTR}>
                  {isTR ? "Yetkili T.C. Kimlik No" : "Yetkili Kimlik No"}
                </Label>
                <Input
                  {...register("authorizedTckn")}
                  inputMode={isTR ? "numeric" : "text"}
                  maxLength={isTR ? 11 : 40}
                  placeholder={isTR ? "11 haneli TCKN" : "Passport / ID (ops.)"}
                />
              </Field>
              <Field error={errors.authorizedTitle?.message}>
                <Label required>Ünvan / Rol</Label>
                <Controller
                  control={control}
                  name="authorizedTitle"
                  render={({ field }) => (
                    <Select {...field}>
                      <option value="">Görevinizi seçin</option>
                      {TITLE_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </Field>
            </div>

            <Field error={errors.mainCategoryIds?.message}>
              <Label required>Ana Kategoriler</Label>
              <p className="mb-2 text-xs text-zinc-500">
                En fazla 3 ana faaliyet alanınız (segment). İlki ana kategoridir.
              </p>
              <Controller
                control={control}
                name="mainCategoryIds"
                render={({ field }) => (
                  <SegmentOnlyPicker
                    value={field.value}
                    onChange={field.onChange}
                    maxSelection={3}
                    placeholder="Ana kategori seç (en fazla 3)"
                  />
                )}
              />
            </Field>

            <Field>
              <Label>Alt Kategoriler</Label>
              <p className="mb-2 text-xs text-zinc-500">
                Satın aldığınız ürün/hizmet kategorileri (sınırsız).
              </p>
              <Controller
                control={control}
                name="subCategoryIds"
                render={({ field }) => (
                  <CategorySelectorButton
                    value={field.value}
                    onChange={field.onChange}
                    mode="multi"
                    maxSelection={999}
                    placeholder="Alt kategori ekle"
                    modalTitle="Alt Kategoriler"
                    modalDescription="Ürün/hizmet kategorilerinizi seçin (sınırsız)."
                  />
                )}
              />
            </Field>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-5">
            <SectionTitle
              title="Özet & Beyan"
              desc="Bilgilerinizi kontrol edin ve beyanı onaylayın."
            />
            <SummaryList values={getValues()} />
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-950/10 bg-zinc-50 p-3">
              <input
                type="checkbox"
                checked={declared}
                onChange={(e) => setDeclared(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span className="text-sm text-zinc-700">
                Verdiğim bilgilerin doğru ve güncel olduğunu beyan ederim.
              </span>
            </label>
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-between border-t border-zinc-100 pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || complete.isPending}
          >
            Geri
          </Button>
          {step < 3 ? (
            <Button type="button" onClick={next}>
              Devam
            </Button>
          ) : (
            <Button
              type="button"
              onClick={submit}
              loading={complete.isPending}
              disabled={complete.isPending || !declared}
            >
              Tamamla ve Panele Geç
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  const steps = ["Şirket Bilgileri", "Kişisel Bilgiler", "Özet & Beyan"];
  return (
    <ol className="flex items-center gap-2">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const active = step === n;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                active || done
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-500"
              }`}
            >
              {done ? <Check className="h-4 w-4" /> : n}
            </span>
            <span
              className={`hidden text-xs font-medium sm:block ${
                active ? "text-zinc-900" : "text-zinc-500"
              }`}
            >
              {label}
            </span>
            {n < steps.length ? (
              <span className="mx-1 hidden h-px flex-1 bg-zinc-200 sm:block" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function SectionTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
      <p className="text-sm text-zinc-500">{desc}</p>
    </div>
  );
}

function SummaryList({ values }: { values: FormValues }) {
  const typeLabel =
    values.companyType === "JOINT_STOCK"
      ? "Anonim Şirket"
      : values.companyType === "SOLE_PROPRIETOR"
        ? "Şahıs Şirketi"
        : "Limited Şirket";
  const isTR = (values.country || "TR") === "TR";
  const addressParts = [
    values.neighborhood,
    values.district || values.stateRegion,
    values.city,
    isTR ? null : countryName(values.country || "TR"),
  ].filter((p): p is string => !!p && p.trim().length > 0);
  const rows: [string, string][] = [
    ["Firma Ünvanı", values.legalName],
    ["Ülke", countryName(values.country || "TR")],
    ["Firma Türü", typeLabel],
    ["Vergi/Sicil No", values.taxNumber],
    ...((isTR && values.taxOffice
      ? [["Vergi Dairesi", values.taxOffice]]
      : []) as [string, string][]),
    ["Adres", addressParts.join(", ") || "—"],
    ...((values.authorizedTckn
      ? [["Yetkili Kimlik", values.authorizedTckn]]
      : []) as [string, string][]),
    ["Ünvan/Rol", values.authorizedTitle],
    [
      "Kategoriler",
      `${values.mainCategoryIds.length} ana${values.subCategoryIds.length ? ` · ${values.subCategoryIds.length} alt` : ""}`,
    ],
  ];
  return (
    <dl className="divide-y divide-zinc-100 rounded-lg border border-zinc-950/10">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
          <dt className="text-zinc-500">{k}</dt>
          <dd className="text-right font-medium text-zinc-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
