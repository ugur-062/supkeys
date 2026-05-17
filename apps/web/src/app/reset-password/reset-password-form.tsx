"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Check, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const schema = z
  .object({
    newPassword: z
      .string()
      .min(8, "En az 8 karakter")
      .max(72, "En fazla 72 karakter")
      .regex(/[A-Za-z]/, "En az bir harf içermeli")
      .regex(/\d/, "En az bir rakam içermeli"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Parolalar eşleşmiyor",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

export function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [show, setShow] = useState(false);
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
      <div className="rounded-2xl border border-danger-200 bg-danger-50 p-5">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-danger-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-danger-900">Geçersiz bağlantı</p>
            <p className="mt-1 text-sm text-danger-800">
              Token bulunamadı. Bağlantıyı doğrudan e-postadaki halinden açın
              veya destek ekibinden yeni link talep edin.
            </p>
            <Link
              href="/login"
              className="mt-3 inline-block text-sm text-brand-700 hover:underline"
            >
              ← Girişe dön
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-success-200 bg-success-50 p-5">
        <div className="flex items-start gap-2">
          <Check className="h-5 w-5 text-success-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-success-900">
              Parolanız değiştirildi
            </p>
            <p className="mt-1 text-sm text-success-800">
              Yeni parolanızla giriş yapabilirsiniz.
            </p>
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Giriş Yap
            </button>
          </div>
        </div>
      </div>
    );
  }

  const onSubmit = async (values: FormValues) => {
    setPending(true);
    setError(null);
    try {
      await api.post("/auth/password-reset/confirm", {
        token,
        newPassword: values.newPassword,
      });
      toast.success("Parola değiştirildi");
      setSubmitted(true);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Bağlantı geçersiz veya süresi dolmuş";
      setError(typeof msg === "string" ? msg : "Bir hata oluştu");
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4 rounded-2xl border border-surface-border bg-white p-6 shadow-sm"
      noValidate
    >
      {error ? (
        <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800">
          {error}
        </div>
      ) : null}

      <Field error={errors.newPassword?.message}>
        <Label htmlFor="newPassword">Yeni Parola</Label>
        <div className="relative">
          <Input
            id="newPassword"
            type={show ? "text" : "password"}
            hasError={!!errors.newPassword}
            placeholder="En az 8 karakter, 1 harf 1 rakam"
            {...register("newPassword")}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
          >
            {show ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </Field>

      <Field error={errors.confirmPassword?.message}>
        <Label htmlFor="confirmPassword">Parolayı Tekrar</Label>
        <Input
          id="confirmPassword"
          type={show ? "text" : "password"}
          hasError={!!errors.confirmPassword}
          {...register("confirmPassword")}
        />
      </Field>

      <Button
        type="submit"
        variant="primary"
        loading={pending}
        disabled={pending}
        className="w-full"
      >
        Parolayı Değiştir
      </Button>
    </form>
  );
}
