"use client";

import { Select } from "@/components/catalyst/select";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TURKEY_LOCATIONS, getDistrictsByCity } from "@supkeys/shared";
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
  country?: string;
  city: string;
  district?: string;
  stateRegion?: string;
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
  const country = (watch("country" as Path<T>) as unknown as string) || "TR";
  const isTR = country === "TR";
  const cityName = watch("city" as Path<T>) as unknown as string;

  const districts = useMemo(() => {
    return isTR && cityName ? getDistrictsByCity(cityName) : [];
  }, [isTR, cityName]);

  // TR: şehir değişince ilçe seçimini sıfırla (eski seçim yeni şehirde olmayabilir)
  useEffect(() => {
    if (!isTR || !cityName) return;
    const currentDistrict = (watch as (n: string) => string)("district");
    if (currentDistrict && !districts.includes(currentDistrict)) {
      setValue("district" as Path<T>, "" as never, { shouldValidate: false });
    }
  }, [isTR, cityName, districts, setValue, watch]);

  const err = (name: string) =>
    (errors as Record<string, { message?: string }>)[name]?.message;
  const cityError = err("city");
  const districtError = err("district");
  const stateError = err("stateRegion");
  const addressError = err("addressLine");
  const postalError = err("postalCode");

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Şehir — TR'de il dropdown, yabancıda serbest metin */}
        <Field error={cityError}>
          <Label htmlFor="city" required>
            {isTR ? "İl" : "Şehir"}
          </Label>
          <Controller
            control={control}
            name={"city" as Path<T>}
            render={({ field }) =>
              isTR ? (
                <Select
                  id="city"
                  value={(field.value as string) ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={!!cityError}
                >
                  <option value="">Seçiniz</option>
                  {TURKEY_LOCATIONS.map((loc) => (
                    <option key={loc.il} value={loc.il}>
                      {loc.il}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id="city"
                  placeholder="Şehir"
                  hasError={!!cityError}
                  value={(field.value as string) ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )
            }
          />
        </Field>

        {/* TR: ilçe dropdown. Yabancı: eyalet/bölge serbest metin */}
        {isTR ? (
          <Field error={districtError}>
            <Label htmlFor="district" required>
              İlçe
            </Label>
            <Controller
              control={control}
              name={"district" as Path<T>}
              render={({ field }) => (
                <Select
                  id="district"
                  value={(field.value as string) ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  disabled={!cityName}
                  invalid={!!districtError}
                >
                  <option value="">
                    {cityName ? "Seçiniz" : "Önce il seçin"}
                  </option>
                  {districts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              )}
            />
          </Field>
        ) : (
          <Field error={stateError} hint="Eyalet / bölge (varsa)">
            <Label htmlFor="stateRegion">Eyalet / Bölge</Label>
            <Controller
              control={control}
              name={"stateRegion" as Path<T>}
              render={({ field }) => (
                <Input
                  id="stateRegion"
                  placeholder="State / Province"
                  hasError={!!stateError}
                  value={(field.value as string) ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
          </Field>
        )}
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
              placeholder={isTR ? "Mah., Cad./Sk., No, Daire" : "Street, No, Unit"}
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
              inputMode={isTR ? "numeric" : "text"}
              maxLength={isTR ? 5 : 12}
              placeholder={isTR ? "34010" : "Postal / ZIP"}
              autoComplete="postal-code"
              hasError={!!postalError}
              value={(field.value as string) ?? ""}
              onChange={(e) => {
                // TR: sadece rakam. Yabancı: alfanümerik (ör. UK "SW1A 1AA").
                const v = isTR
                  ? e.target.value.replace(/[^0-9]/g, "")
                  : e.target.value;
                field.onChange(v);
              }}
              onBlur={field.onBlur}
            />
          )}
        />
      </Field>
    </>
  );
}
