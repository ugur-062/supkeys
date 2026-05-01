"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type FullRegistration } from "@/lib/registration/schemas";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import {
  Controller,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormWatch,
} from "react-hook-form";
import { PasswordStrength } from "./password-strength";
import { TermsCheckbox } from "./terms-checkbox";

interface StepUserInfoProps {
  control: Control<FullRegistration>;
  register: UseFormRegister<FullRegistration>;
  errors: FieldErrors<FullRegistration>;
  watch: UseFormWatch<FullRegistration>;
  emailPrefilled?: boolean;
  emailPrefillNote?: string;
}

export function StepUserInfo({
  control,
  register,
  errors,
  watch,
  emailPrefilled,
  emailPrefillNote,
}: StepUserInfoProps) {
  const [showPwd, setShowPwd] = useState(false);
  const [showPwdConfirm, setShowPwdConfirm] = useState(false);

  const password = watch("password") ?? "";

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-display font-bold text-brand-900">
          Yetkili Kullanıcı
        </h2>
        <p className="text-sm text-slate-500">
          Firmanın hesabını yönetecek kişinin bilgileri.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field error={errors.adminFirstName?.message}>
          <Label htmlFor="adminFirstName" required>
            Ad
          </Label>
          <Input
            id="adminFirstName"
            placeholder="Ali"
            autoComplete="given-name"
            hasError={!!errors.adminFirstName}
            {...register("adminFirstName")}
          />
        </Field>

        <Field error={errors.adminLastName?.message}>
          <Label htmlFor="adminLastName" required>
            Soyad
          </Label>
          <Input
            id="adminLastName"
            placeholder="Yılmaz"
            autoComplete="family-name"
            hasError={!!errors.adminLastName}
            {...register("adminLastName")}
          />
        </Field>
      </div>

      <Field
        error={errors.adminEmail?.message}
        hint={emailPrefilled ? emailPrefillNote : undefined}
      >
        <Label htmlFor="adminEmail" required>
          E-posta
        </Label>
        <Input
          id="adminEmail"
          type="email"
          placeholder="ali@firma.com"
          autoComplete="email"
          hasError={!!errors.adminEmail}
          {...register("adminEmail")}
        />
      </Field>

      <Field error={errors.adminPhone?.message} hint="Opsiyonel">
        <Label htmlFor="adminPhone">Telefon</Label>
        <div className="flex gap-2">
          <span className="inline-flex items-center px-3 py-2.5 rounded-lg border border-surface-border bg-slate-50 text-sm text-slate-600 font-medium">
            +90
          </span>
          <Controller
            control={control}
            name="adminPhone"
            render={({ field }) => (
              <Input
                id="adminPhone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="5551234567"
                autoComplete="tel-national"
                hasError={!!errors.adminPhone}
                value={field.value ?? ""}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^0-9]/g, "");
                  field.onChange(digits);
                }}
                onBlur={field.onBlur}
              />
            )}
          />
        </div>
      </Field>

      <Field error={errors.password?.message}>
        <Label htmlFor="password" required>
          Şifre
        </Label>
        <div className="relative">
          <Input
            id="password"
            type={showPwd ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="new-password"
            hasError={!!errors.password}
            className="pr-10"
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPwd((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            tabIndex={-1}
            aria-label={showPwd ? "Şifreyi gizle" : "Şifreyi göster"}
          >
            {showPwd ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
        <PasswordStrength password={password} />
      </Field>

      <Field error={errors.passwordConfirm?.message}>
        <Label htmlFor="passwordConfirm" required>
          Şifre Tekrar
        </Label>
        <div className="relative">
          <Input
            id="passwordConfirm"
            type={showPwdConfirm ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="new-password"
            hasError={!!errors.passwordConfirm}
            className="pr-10"
            {...register("passwordConfirm")}
          />
          <button
            type="button"
            onClick={() => setShowPwdConfirm((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            tabIndex={-1}
            aria-label={showPwdConfirm ? "Şifreyi gizle" : "Şifreyi göster"}
          >
            {showPwdConfirm ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
      </Field>

      <div className="pt-2">
        <TermsCheckbox control={control} errors={errors} />
      </div>
    </div>
  );
}
