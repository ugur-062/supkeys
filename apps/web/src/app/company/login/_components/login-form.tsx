"use client";

import { Button } from "@/components/catalyst/button";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import {
  useCompanyLogin,
  useResendEmailCode,
  useSetCompanyAuth,
  useVerifyEmail,
} from "@/hooks/use-company-auth";
import { extractErrorMessage } from "@/lib/tenders/error";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { Lock, ShieldCheck } from "lucide-react";
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
  const verify = useVerifyEmail();
  const resend = useResendEmailCode();
  const setAuth = useSetCompanyAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [twoFactor, setTwoFactor] = useState(false);
  const [code, setCode] = useState("");
  // E-posta doğrulanmamışsa: login yerine doğrulama modu.
  const [needsVerify, setNeedsVerify] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyCode, setVerifyCode] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    // 2FA açıkken kod 6 hane olmalı — boş round-trip yapma.
    if (twoFactor && code.trim().length !== 6) {
      setFormError("6 haneli doğrulama kodunu girin");
      return;
    }
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
      // E-posta doğrulanmamışsa doğrulama moduna geç + kod gönder.
      if (
        axios.isAxiosError(err) &&
        err.response?.status === 403 &&
        /doğrula/i.test(String((err.response.data as { message?: string })?.message))
      ) {
        setVerifyEmail(data.email.trim());
        setNeedsVerify(true);
        setFormError(null);
        await resend.mutateAsync(data.email.trim()).catch(() => undefined);
        return;
      }
      setFormError(extractErrorMessage(err, "Giriş başarısız"));
    }
  });

  const submitVerify = async () => {
    setFormError(null);
    try {
      const res = await verify.mutateAsync({ email: verifyEmail, code: verifyCode });
      setAuth({ token: res.token, user: res.user, company: res.company });
      router.replace(nextPath);
    } catch (err) {
      setFormError(extractErrorMessage(err, "Kod doğrulanamadı"));
    }
  };

  if (needsVerify) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-600">
          <strong>{verifyEmail}</strong> adresine gönderilen 6 haneli kodu girin.
        </p>
        <Field>
          <Label>Doğrulama kodu</Label>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
        {formError ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </div>
        ) : null}
        <Button
          className="w-full"
          disabled={verifyCode.length !== 6 || verify.isPending}
          onClick={submitVerify}
        >
          {verify.isPending ? "Doğrulanıyor…" : "Doğrula ve Giriş Yap"}
        </Button>
        <button
          type="button"
          disabled={resend.isPending}
          onClick={() => resend.mutateAsync(verifyEmail).catch(() => undefined)}
          className="w-full text-center text-sm text-zinc-500 hover:text-zinc-800 disabled:opacity-50"
        >
          Kodu yeniden gönder
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field>
        <Label>E-posta</Label>
        <Input type="email" autoComplete="email" autoFocus invalid={!!errors.email} {...register("email")} />
        {errors.email ? (
          <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
        ) : null}
      </Field>

      <Field>
        <Label>Parola</Label>
        <Input type="password" autoComplete="current-password" invalid={!!errors.password} {...register("password")} />
        {errors.password ? (
          <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
        ) : null}
      </Field>

      {twoFactor ? (
        <Field>
          <Label>Doğrulama kodu</Label>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            placeholder="Authenticator 6 haneli kod"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Hesabınızda iki adımlı doğrulama açık — uygulamanızdaki kodu girin.
          </p>
        </Field>
      ) : null}

      <div className="-mt-1 text-right">
        <Link href="/company/sifremi-unuttum" className="text-xs font-medium text-zinc-500 hover:text-zinc-900">
          Şifremi unuttum?
        </Link>
      </div>

      {formError ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </div>
      ) : null}

      <Button type="submit" className="w-full" disabled={login.isPending}>
        {login.isPending ? "Giriş yapılıyor…" : "Giriş Yap"}
      </Button>

      <div className="flex items-center justify-center gap-3 pt-1 text-[11px] text-zinc-400">
        <span className="inline-flex items-center gap-1">
          <Lock className="h-3 w-3" aria-hidden="true" /> SSL korumalı
        </span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" aria-hidden="true" /> 2FA destekli
        </span>
      </div>
    </form>
  );
}
