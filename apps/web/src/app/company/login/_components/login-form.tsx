"use client";

import { Button } from "@/components/catalyst/button";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { useCompanyLogin, useSetCompanyAuth } from "@/hooks/use-company-auth";
import { extractErrorMessage } from "@/lib/tenders/error";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const schema = z.object({
  email: z.string().email("Geçerli bir e-posta giriniz"),
  password: z.string().min(1, "Parola gerekli"),
});

type FormData = z.infer<typeof schema>;

export function CompanyLoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const login = useCompanyLogin();
  const setAuth = useSetCompanyAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [twoFactor, setTwoFactor] = useState(false);
  const [code, setCode] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    try {
      const res = await login.mutateAsync({
        ...data,
        code: twoFactor ? code.trim() : undefined,
      });
      if ("twoFactorRequired" in res) {
        setTwoFactor(true);
        return;
      }
      setAuth({ token: res.token, user: res.user, company: res.company });
      router.replace(nextPath);
    } catch (err) {
      setFormError(extractErrorMessage(err, "Giriş başarısız"));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field>
        <Label>E-posta</Label>
        <Input
          type="email"
          autoComplete="email"
          autoFocus
          invalid={!!errors.email}
          {...register("email")}
        />
        {errors.email ? (
          <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
        ) : null}
      </Field>

      <Field>
        <Label>Parola</Label>
        <Input
          type="password"
          autoComplete="current-password"
          invalid={!!errors.password}
          {...register("password")}
        />
        {errors.password ? (
          <p className="mt-1 text-xs text-red-600">
            {errors.password.message}
          </p>
        ) : null}
      </Field>

      {twoFactor ? (
        <Field>
          <Label>Doğrulama kodu</Label>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="Authenticator 6 haneli kod"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Hesabınızda iki adımlı doğrulama açık — uygulamanızdaki kodu girin.
          </p>
        </Field>
      ) : null}

      <div className="-mt-1 text-right">
        <Link
          href="/company/sifremi-unuttum"
          className="text-xs font-medium text-zinc-500 hover:text-zinc-900"
        >
          Şifremi unuttum?
        </Link>
      </div>

      {formError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </div>
      ) : null}

      <Button type="submit" className="w-full" disabled={login.isPending}>
        {login.isPending ? "Giriş yapılıyor…" : "Giriş Yap"}
      </Button>
    </form>
  );
}
