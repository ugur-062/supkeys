"use client";

import { AuthBackdrop } from "@/components/marketing/auth-backdrop";
import { AuthHeader } from "@/components/marketing/auth-header";
import { Button } from "@/components/catalyst/button";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import {
  useCompanySignup,
  useSetCompanyAuth,
} from "@/hooks/use-company-auth";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { extractErrorMessage } from "@/lib/tenders/error";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const schema = z
  .object({
    companyName: z.string().min(2, "Firma adı en az 2 karakter"),
    firstName: z.string().min(2, "Ad en az 2 karakter"),
    lastName: z.string().min(2, "Soyad en az 2 karakter"),
    email: z.string().email("Geçerli bir e-posta giriniz"),
    password: z
      .string()
      .min(8, "Parola en az 8 karakter")
      .regex(/[a-zA-Z]/, "En az bir harf")
      .regex(/[0-9]/, "En az bir rakam"),
    passwordConfirm: z.string().min(1, "Parolayı tekrar girin"),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    message: "Parolalar eşleşmiyor",
    path: ["passwordConfirm"],
  });

type FormData = z.infer<typeof schema>;

export function CompanySignupClient() {
  const token = useCompanyAuthStore((s) => s.token);
  const isHydrated = useCompanyAuthStore((s) => s.isHydrated);
  const router = useRouter();
  const signup = useCompanySignup();
  const setAuth = useSetCompanyAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (isHydrated && token) router.replace("/company");
  }, [isHydrated, token, router]);

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    try {
      const { passwordConfirm: _ignored, ...payload } = data;
      const res = await signup.mutateAsync(payload);
      setAuth({ token: res.token, user: res.user, company: res.company });
      router.replace("/company");
    } catch (err) {
      setFormError(extractErrorMessage(err, "Kayıt başarısız"));
    }
  });

  return (
    <main className="flex min-h-screen flex-col bg-zinc-50">
      <AuthHeader />

      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-12 sm:py-16">
        <AuthBackdrop />
        <div className="relative w-full max-w-md">
          <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-950/5">
          <div className="mb-6 text-center space-y-1">
            <h1 className="text-2xl font-semibold text-zinc-900">Kaydol</h1>
            <p className="text-sm text-slate-500">
              Firma hesabı oluştur — hem al, hem sat
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <Field>
              <Label>Firma adı</Label>
              <Input invalid={!!errors.companyName} {...register("companyName")} />
              {errors.companyName ? (
                <p className="mt-1 text-xs text-red-600">
                  {errors.companyName.message}
                </p>
              ) : null}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <Label>Ad</Label>
                <Input invalid={!!errors.firstName} {...register("firstName")} />
              </Field>
              <Field>
                <Label>Soyad</Label>
                <Input invalid={!!errors.lastName} {...register("lastName")} />
              </Field>
            </div>

            <Field>
              <Label>E-posta</Label>
              <Input
                type="email"
                autoComplete="email"
                invalid={!!errors.email}
                {...register("email")}
              />
              {errors.email ? (
                <p className="mt-1 text-xs text-red-600">
                  {errors.email.message}
                </p>
              ) : null}
            </Field>

            <Field>
              <Label>Parola</Label>
              <Input
                type="password"
                autoComplete="new-password"
                invalid={!!errors.password}
                {...register("password")}
              />
              {errors.password ? (
                <p className="mt-1 text-xs text-red-600">
                  {errors.password.message}
                </p>
              ) : null}
            </Field>

            <Field>
              <Label>Parola (tekrar)</Label>
              <Input
                type="password"
                autoComplete="new-password"
                invalid={!!errors.passwordConfirm}
                {...register("passwordConfirm")}
              />
              {errors.passwordConfirm ? (
                <p className="mt-1 text-xs text-red-600">
                  {errors.passwordConfirm.message}
                </p>
              ) : null}
            </Field>

            {formError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            ) : null}

            <Button
              type="submit"
              className="w-full"
              disabled={signup.isPending}
            >
              {signup.isPending ? "Oluşturuluyor…" : "Hesap Oluştur"}
            </Button>
          </form>
        </div>

          <div className="mt-6 text-center text-sm text-slate-600">
            Zaten hesabın var mı?{" "}
            <Link
              href="/company/login"
              className="font-semibold text-zinc-900 hover:underline"
            >
              Giriş yap
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
