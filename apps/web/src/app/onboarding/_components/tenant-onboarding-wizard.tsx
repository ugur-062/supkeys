"use client";

import { AddressFields } from "@/components/registration/address-fields";
import { Select } from "@/components/catalyst/select";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRoots } from "@/hooks/use-categories";
import {
  useCompleteTenantOnboarding,
  type TenantOnboardingPayload,
} from "@/hooks/use-tenant-onboarding";
import type { AuthUser } from "@/lib/auth/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { isValidTaxId, isValidTckn } from "@supkeys/shared";
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
    taxNumber: z.string().min(10, "Vergi/TC numarası zorunlu"),
    taxOffice: z.string().min(2, "Vergi dairesi zorunlu"),
    city: z.string().min(1, "İl seçin"),
    district: z.string().min(1, "İlçe seçin"),
    neighborhood: z.string().min(2, "Mahalle zorunlu"),
    postalCode: z.string().min(2, "Posta kodu zorunlu"),
    addressLine: z.string().min(5, "Açık adres zorunlu"),
    billingTitle: z.string().optional(),
    billingEmail: z
      .string()
      .email("Geçerli bir e-posta giriniz")
      .optional()
      .or(z.literal("")),
    authorizedTckn: z.string().min(11, "T.C. Kimlik No 11 haneli olmalı"),
    authorizedTitle: z.string().min(2, "Ünvan/rol seçin"),
    categoryIds: z
      .array(z.string())
      .min(1, "En az 1 faaliyet sektörü seçin")
      .max(3, "En fazla 3 faaliyet sektörü"),
  })
  .superRefine((v, ctx) => {
    const isSole = v.companyType === "SOLE_PROPRIETOR";
    if (!isValidTaxId(v.taxNumber, isSole)) {
      ctx.addIssue({
        path: ["taxNumber"],
        code: z.ZodIssueCode.custom,
        message: isSole
          ? "11 haneli geçerli TCKN giriniz"
          : "10 haneli geçerli vergi numarası giriniz",
      });
    }
    if (!isValidTckn(v.authorizedTckn)) {
      ctx.addIssue({
        path: ["authorizedTckn"],
        code: z.ZodIssueCode.custom,
        message: "Geçerli bir T.C. Kimlik No giriniz",
      });
    }
  });

type FormValues = z.infer<typeof schema>;

const STEP_FIELDS: Record<number, (keyof FormValues)[]> = {
  1: [
    "legalName",
    "companyType",
    "taxNumber",
    "taxOffice",
    "city",
    "district",
    "neighborhood",
    "postalCode",
    "addressLine",
    "billingEmail",
  ],
  2: ["authorizedTckn", "authorizedTitle", "categoryIds"],
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
  const { data: segments, isLoading: segmentsLoading } = useRoots();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: {
      legalName: tenant.legalName ?? tenant.name ?? "",
      companyType: tenant.companyType ?? "LIMITED",
      taxNumber: tenant.taxNumber ?? "",
      taxOffice: tenant.taxOffice ?? "",
      city: tenant.city ?? "",
      district: tenant.district ?? "",
      neighborhood: tenant.neighborhood ?? "",
      postalCode: tenant.postalCode ?? "",
      addressLine: tenant.addressLine ?? "",
      billingTitle: tenant.billingTitle ?? "",
      billingEmail: tenant.billingEmail ?? "",
      authorizedTckn: tenant.authorizedTckn ?? "",
      authorizedTitle: tenant.authorizedTitle ?? "",
      categoryIds: tenant.sectorCategoryIds ?? [],
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
      taxNumber: v.taxNumber,
      taxOffice: v.taxOffice,
      city: v.city,
      district: v.district,
      neighborhood: v.neighborhood,
      postalCode: v.postalCode,
      addressLine: v.addressLine,
      billingTitle: v.billingTitle?.trim() || undefined,
      billingEmail: v.billingEmail?.trim() || undefined,
      authorizedTckn: v.authorizedTckn,
      authorizedTitle: v.authorizedTitle,
      categoryIds: v.categoryIds,
    };
    complete.mutate(payload, {
      onSuccess: async () => {
        toast.success("Firma bilgileriniz kaydedildi");
        await onDone();
      },
      onError: () => toast.error("Kaydedilemedi, lütfen tekrar deneyin"),
    });
  };

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
            <Field error={errors.legalName?.message}>
              <Label required>Firma Ünvanı</Label>
              <Input {...register("legalName")} placeholder="Yasal firma unvanı" />
            </Field>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field error={errors.companyType?.message}>
                <Label required>Firma Türü</Label>
                <Controller
                  control={control}
                  name="companyType"
                  render={({ field }) => (
                    <Select {...field}>
                      <option value="LIMITED">Limited Şirket</option>
                      <option value="JOINT_STOCK">Anonim Şirket (A.Ş.)</option>
                      <option value="SOLE_PROPRIETOR">Şahıs Şirketi</option>
                    </Select>
                  )}
                />
              </Field>
              <Field
                error={errors.taxNumber?.message}
                hint={
                  watch("companyType") === "SOLE_PROPRIETOR"
                    ? "Şahıs → 11 haneli TCKN"
                    : "Tüzel kişi → 10 haneli VKN"
                }
              >
                <Label required>Vergi Kimlik No / TC</Label>
                <Input
                  {...register("taxNumber")}
                  inputMode="numeric"
                  maxLength={11}
                  placeholder="VKN/TCKN"
                />
              </Field>
            </div>
            <Field error={errors.taxOffice?.message}>
              <Label required>Vergi Dairesi</Label>
              <Input {...register("taxOffice")} placeholder="Vergi dairesi" />
            </Field>

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
                <Field error={errors.neighborhood?.message}>
                  <Label required>Mahalle</Label>
                  <Input {...register("neighborhood")} placeholder="Mahalle" />
                </Field>
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
                hint="Fatura/ödeme akışlarında kullanılır"
              >
                <Label required>Yetkili T.C. Kimlik No</Label>
                <Input
                  {...register("authorizedTckn")}
                  inputMode="numeric"
                  maxLength={11}
                  placeholder="11 haneli TCKN"
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

            <Field error={errors.categoryIds?.message}>
              <Label required>Faaliyet Sektörü</Label>
              <p className="mb-2 text-xs text-zinc-500">
                En az 1, en fazla 3 sektör. İlk seçtiğiniz ana faaliyet
                sektörünüzdür.
              </p>
              <Controller
                control={control}
                name="categoryIds"
                render={({ field }) => (
                  <SectorChips
                    loading={segmentsLoading}
                    options={(segments ?? []).map((s) => ({
                      id: s.id,
                      name: s.nameTr,
                    }))}
                    value={field.value}
                    onChange={field.onChange}
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
            <SummaryList values={getValues()} segments={segments ?? []} />
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

function SectorChips({
  loading,
  options,
  value,
  onChange,
}: {
  loading: boolean;
  options: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Sektörler yükleniyor…
      </div>
    );
  }
  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else if (value.length < 3) {
      onChange([...value, id]);
    } else {
      toast.error("En fazla 3 sektör seçebilirsiniz");
    }
  };
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-zinc-500">
        {value.length}/3 seçildi
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const idx = value.indexOf(o.id);
          const selected = idx >= 0;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                selected
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              {selected ? (
                <span className="text-[10px] uppercase tracking-wide">
                  {idx === 0 ? "Ana" : idx + 1}
                </span>
              ) : null}
              {o.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SummaryList({
  values,
  segments,
}: {
  values: FormValues;
  segments: { id: string; nameTr: string }[];
}) {
  const typeLabel =
    values.companyType === "JOINT_STOCK"
      ? "Anonim Şirket"
      : values.companyType === "SOLE_PROPRIETOR"
        ? "Şahıs Şirketi"
        : "Limited Şirket";
  const sectorNames = values.categoryIds
    .map((id) => segments.find((s) => s.id === id)?.nameTr)
    .filter(Boolean)
    .join(", ");
  const rows: [string, string][] = [
    ["Firma Ünvanı", values.legalName],
    ["Firma Türü", typeLabel],
    ["Vergi/TC No", values.taxNumber],
    ["Vergi Dairesi", values.taxOffice],
    ["Adres", `${values.neighborhood}, ${values.district}/${values.city}`],
    ["Yetkili TCKN", values.authorizedTckn],
    ["Ünvan/Rol", values.authorizedTitle],
    ["Faaliyet Sektörü", sectorNames || "—"],
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
