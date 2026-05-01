"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  COMPANY_TYPE_OPTIONS,
  INDUSTRY_OPTIONS,
  type FullRegistration,
} from "@/lib/registration/schemas";
import {
  Controller,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
  type UseFormWatch,
} from "react-hook-form";
import { AddressFields } from "./address-fields";
import { FileUpload } from "./file-upload";

interface StepFirmInfoProps {
  control: Control<FullRegistration>;
  register: UseFormRegister<FullRegistration>;
  errors: FieldErrors<FullRegistration>;
  watch: UseFormWatch<FullRegistration>;
  setValue: UseFormSetValue<FullRegistration>;
}

export function StepFirmInfo({
  control,
  register,
  errors,
  watch,
  setValue,
}: StepFirmInfoProps) {
  const taxCertUrl = watch("taxCertUrl");

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-display font-bold text-brand-900">
          Firma Bilgileri
        </h2>
        <p className="text-sm text-slate-500">
          Firmanızın yasal bilgileri — vergi levhasıyla doğrulanır.
        </p>
      </div>

      <Field error={errors.companyName?.message}>
        <Label htmlFor="companyName" required>
          Firma Adı
        </Label>
        <Input
          id="companyName"
          placeholder="Örn. ABC Tekstil A.Ş."
          autoComplete="organization"
          hasError={!!errors.companyName}
          {...register("companyName")}
        />
      </Field>

      <Field error={errors.companyType?.message}>
        <Label htmlFor="companyType" required>
          Firma Tipi
        </Label>
        <Controller
          control={control}
          name="companyType"
          render={({ field }) => (
            <select
              id="companyType"
              value={field.value ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              className={cn(
                "w-full px-3.5 py-2.5 rounded-lg border bg-white text-sm",
                "focus:outline-none focus:ring-2 focus:ring-offset-0",
                errors.companyType
                  ? "border-danger-500 focus:ring-danger-500/30"
                  : "border-surface-border focus:ring-brand-500/30 focus:border-brand-500",
                field.value ? "text-brand-900" : "text-slate-400",
              )}
            >
              <option value="">Seçiniz</option>
              {COMPANY_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
        />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field error={errors.taxNumber?.message}>
          <Label htmlFor="taxNumber" required>
            Vergi Numarası
          </Label>
          <Controller
            control={control}
            name="taxNumber"
            render={({ field }) => (
              <Input
                id="taxNumber"
                inputMode="numeric"
                maxLength={11}
                placeholder="1234567890"
                autoComplete="off"
                hasError={!!errors.taxNumber}
                value={field.value ?? ""}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^0-9]/g, "");
                  field.onChange(digits);
                }}
                onBlur={field.onBlur}
              />
            )}
          />
        </Field>

        <Field error={errors.taxOffice?.message}>
          <Label htmlFor="taxOffice" required>
            Vergi Dairesi
          </Label>
          <Input
            id="taxOffice"
            placeholder="Örn. Beşiktaş"
            hasError={!!errors.taxOffice}
            {...register("taxOffice")}
          />
        </Field>
      </div>

      <Field
        error={errors.taxCertUrl?.message}
        hint="Vergi levhanızı PDF ya da görsel olarak yükleyin"
      >
        <Label required>Vergi Levhası</Label>
        <Controller
          control={control}
          name="taxCertUrl"
          render={({ field }) => (
            <FileUpload
              value={field.value || null}
              onChange={(v) => {
                setValue("taxCertUrl", v ?? "", { shouldValidate: true });
                field.onChange(v ?? "");
              }}
              hasError={!!errors.taxCertUrl && !taxCertUrl}
            />
          )}
        />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field error={errors.industry?.message} hint="Opsiyonel">
          <Label htmlFor="industry">Sektör</Label>
          <Controller
            control={control}
            name="industry"
            render={({ field }) => (
              <select
                id="industry"
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                className={cn(
                  "w-full px-3.5 py-2.5 rounded-lg border bg-white text-sm",
                  "focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500",
                  "border-surface-border",
                  field.value ? "text-brand-900" : "text-slate-400",
                )}
              >
                <option value="">Seçiniz</option>
                {INDUSTRY_OPTIONS.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </select>
            )}
          />
        </Field>

        <Field error={errors.website?.message} hint="Opsiyonel">
          <Label htmlFor="website">Web Sitesi</Label>
          <Controller
            control={control}
            name="website"
            render={({ field }) => (
              <Input
                id="website"
                placeholder="https://www.firma.com"
                autoComplete="url"
                hasError={!!errors.website}
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && !/^https?:\/\//i.test(v)) {
                    field.onChange(`https://${v}`);
                  }
                  field.onBlur();
                }}
              />
            )}
          />
        </Field>
      </div>

      <div className="pt-2 border-t border-surface-border space-y-1">
        <h3 className="text-sm font-semibold text-brand-900 uppercase tracking-wide">
          Firma Adresi
        </h3>
      </div>

      <AddressFields
        control={control}
        errors={errors}
        watch={watch}
        setValue={setValue}
      />
    </div>
  );
}
