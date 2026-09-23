"use client";

import { Button } from "@/components/catalyst/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { companyApi } from "@/lib/company-auth/api";
import { extractErrorMessage } from "@/lib/tenders/error";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

// Politika backend ConfirmPasswordResetDto ile BİREBİR aynı — kullanıcı
// frontend'in kabul ettiği şifreyi backend'de reddedilmiş görmesin.
const schema = z
  .object({
    newPassword: z
      .string()
      .min(8, "En az 8 karakter")
      .max(72, "En fazla 72 karakter")
      .regex(/[a-z]/, "En az bir küçük harf içermeli")
      .regex(/[A-Z]/, "En az bir büyük harf içermeli")
      .regex(/\d/, "En az bir rakam içermeli"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Şifreler eşleşmiyor",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

export function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (!token) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5" role="alert">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
          <div>
            <p className="font-semibold text-red-900">Geçersiz bağlantı</p>
            <p className="mt-1 text-sm text-red-800">
              Bağlantı geçersiz. Bağlantıyı doğrudan e-postadaki halinden açın
              veya yeni sıfırlama bağlantısı isteyin.
            </p>
            <Link
              href="/company/sifremi-unuttum"
              className="mt-3 inline-block text-sm font-semibold text-zinc-900 underline"
            >
              Yeni bağlantı iste
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-5"
        role="status"
      >
        <div className="flex items-start gap-2">
          <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold text-emerald-900">
              Şifreniz değiştirildi
            </p>
            <p className="mt-1 text-sm text-emerald-800">
              Güvenlik için tüm oturumlarınız kapatıldı — yeni şifrenizle
              giriş yapabilirsiniz.
            </p>
            <Button
              className="mt-3"
              onClick={() => router.push("/company/login")}
            >
              Giriş Yap
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const onSubmit = async (values: FormValues) => {
    setPending(true);
    setError(null);
    try {
      await companyApi.post("/auth/password-reset/confirm", {
        token,
        newPassword: values.newPassword,
      });
      toast.success("Şifre değiştirildi");
      setSubmitted(true);
    } catch (err) {
      setError(
        extractErrorMessage(err, "Bağlantı geçersiz veya süresi dolmuş"),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      <Field>
        <Label>Yeni Şifre</Label>
        <PasswordInput
          autoComplete="new-password"
          invalid={!!errors.newPassword}
          placeholder="En az 8 karakter — büyük/küçük harf + rakam"
          maxLength={72}
          {...register("newPassword")}
        />
        {errors.newPassword ? (
          <p className="mt-1 text-xs text-red-600">
            {errors.newPassword.message}
          </p>
        ) : null}
      </Field>

      <Field>
        <Label>Şifreyi Tekrar</Label>
        <PasswordInput
          autoComplete="new-password"
          invalid={!!errors.confirmPassword}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword ? (
          <p className="mt-1 text-xs text-red-600">
            {errors.confirmPassword.message}
          </p>
        ) : null}
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Değiştiriliyor…" : "Şifreyi Değiştir"}
      </Button>
    </form>
  );
}
