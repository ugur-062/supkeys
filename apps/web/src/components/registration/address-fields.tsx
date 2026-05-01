"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  TURKEY_LOCATIONS,
  getDistrictsByCity,
} from "@supkeys/shared";
import { useEffect, useMemo } from "react";
import {
  Controller,
  type Control,
  type FieldErrors,
  type Path,
  type UseFormSetValue,
  type UseFormWatch,
} from "react-hook-form";

interface AddressFieldsValues {
  city: string;
  district: string;
  addressLine: string;
  postalCode?: string;
}

interface AddressFieldsProps<T extends AddressFieldsValues> {
  control: Control<T>;
  errors: FieldErrors<T>;
  watch: UseFormWatch<T>;
  setValue: UseFormSetValue<T>;
}

export function AddressFields<T extends AddressFieldsValues>({
  control,
  errors,
  watch,
  setValue,
}: AddressFieldsProps<T>) {
  const cityName = watch("city" as Path<T>) as unknown as string;

  const districts = useMemo(() => {
    return cityName ? getDistrictsByCity(cityName) : [];
  }, [cityName]);

  // Şehir değişince ilçe seçimini sıfırla (eski seçim yeni şehirde olmayabilir)
  useEffect(() => {
    if (!cityName) return;
    const currentDistrict = (watch as (n: string) => string)("district");
    if (currentDistrict && !districts.includes(currentDistrict)) {
      setValue("district" as Path<T>, "" as never, { shouldValidate: false });
    }
  }, [cityName, districts, setValue, watch]);

  const cityError = (errors as Record<string, { message?: string }>).city
    ?.message;
  const districtError = (errors as Record<string, { message?: string }>)
    .district?.message;
  const addressError = (errors as Record<string, { message?: string }>)
    .addressLine?.message;
  const postalError = (errors as Record<string, { message?: string }>)
    .postalCode?.message;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field error={cityError}>
          <Label htmlFor="city" required>
            İl
          </Label>
          <Controller
            control={control}
            name={"city" as Path<T>}
            render={({ field }) => (
              <select
                id="city"
                value={(field.value as string) ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                className={cn(
                  "w-full px-3.5 py-2.5 rounded-lg border bg-white",
                  "text-brand-900 text-sm",
                  "focus:outline-none focus:ring-2 focus:ring-offset-0",
                  cityError
                    ? "border-danger-500 focus:ring-danger-500/30"
                    : "border-surface-border focus:ring-brand-500/30 focus:border-brand-500",
                )}
              >
                <option value="">Seçiniz</option>
                {TURKEY_LOCATIONS.map((loc) => (
                  <option key={loc.il} value={loc.il}>
                    {loc.il}
                  </option>
                ))}
              </select>
            )}
          />
        </Field>

        <Field error={districtError}>
          <Label htmlFor="district" required>
            İlçe
          </Label>
          <Controller
            control={control}
            name={"district" as Path<T>}
            render={({ field }) => (
              <select
                id="district"
                value={(field.value as string) ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                disabled={!cityName}
                className={cn(
                  "w-full px-3.5 py-2.5 rounded-lg border bg-white",
                  "text-brand-900 text-sm",
                  "focus:outline-none focus:ring-2 focus:ring-offset-0",
                  "disabled:bg-surface-muted disabled:cursor-not-allowed",
                  districtError
                    ? "border-danger-500 focus:ring-danger-500/30"
                    : "border-surface-border focus:ring-brand-500/30 focus:border-brand-500",
                )}
              >
                <option value="">
                  {cityName ? "Seçiniz" : "Önce il seçin"}
                </option>
                {districts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
          />
        </Field>
      </div>

      <Field error={addressError}>
        <Label htmlFor="addressLine" required>
          Açık Adres
        </Label>
        <Controller
          control={control}
          name={"addressLine" as Path<T>}
          render={({ field }) => (
            <Textarea
              id="addressLine"
              rows={2}
              placeholder="Mah., Cad./Sk., No, Daire"
              autoComplete="street-address"
              hasError={!!addressError}
              value={(field.value as string) ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      </Field>

      <Field error={postalError} hint="Opsiyonel">
        <Label htmlFor="postalCode">Posta Kodu</Label>
        <Controller
          control={control}
          name={"postalCode" as Path<T>}
          render={({ field }) => (
            <Input
              id="postalCode"
              inputMode="numeric"
              maxLength={5}
              placeholder="34010"
              autoComplete="postal-code"
              hasError={!!postalError}
              value={(field.value as string) ?? ""}
              onChange={(e) => {
                const onlyDigits = e.target.value.replace(/[^0-9]/g, "");
                field.onChange(onlyDigits);
              }}
              onBlur={field.onBlur}
            />
          )}
        />
      </Field>
    </>
  );
}
