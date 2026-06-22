"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin, useSetAuth, useVerifyOtp } from "@/hooks/use-auth";
import {
  isTwoFactorChallenge,
  type AuthResponse,
} from "@/lib/auth/types";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Geçerli bir e-posta giriniz"),
  password: z.string().min(1, "Şifre gerekli"),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const login = useLogin();
  const verifyOtp = useVerifyOtp();
  const setAuth = useSetAuth();
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  });

  const onAxiosError = (err: unknown, fallback: string) => {
    if (axios.isAxiosError(err)) {
      toast.error(
        (err.response?.data as { message?: string } | undefined)?.message ??
          fallback,
      );
    } else {
      toast.error("Bir sorun oluştu");
    }
  };

  const finishLogin = (data: AuthResponse) => {
    setAuth(data.token, data.user);
    toast.success(`Hoş geldin, ${data.user.firstName}!`);
    router.push("/dashboard");
  };

  const onSubmit = (values: LoginValues) => {
    login.mutate(values, {
      onSuccess: (data) => {
        if (isTwoFactorChallenge(data)) {
          setChallengeId(data.challengeId);
          toast.info("E-postanıza gönderilen 6 haneli kodu girin");
        } else {
          finishLogin(data);
        }
      },
      onError: (err) => onAxiosError(err, "Giriş başarısız"),
    });
  };

  const onVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeId || code.trim().length !== 6) return;
    verifyOtp.mutate(
      { challengeId, code: code.trim() },
      {
        onSuccess: finishLogin,
        onError: (err) => onAxiosError(err, "Kod doğrulanamadı"),
      },
    );
  };

  if (challengeId) {
    return (
      <form onSubmit={onVerifyOtp} className="card space-y-5 p-6 md:p-8" noValidate>
        <p className="text-sm text-slate-600">
          Hesabınız 2 adımlı doğrulama ile korunuyor. E-postanıza gönderilen 6
          haneli kodu girin.
        </p>
        <Field>
          <Label htmlFor="otp" required>
            Doğrulama Kodu
          </Label>
          <Input
            id="otp"
            inputMode="numeric"
            maxLength={6}
            autoFocus
            placeholder="000000"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))
            }
          />
        </Field>
        <Button
          type="submit"
          loading={verifyOtp.isPending}
          disabled={verifyOtp.isPending || code.length !== 6}
          fullWidth
          size="lg"
        >
          Doğrula ve Giriş Yap
        </Button>
        <button
          type="button"
          onClick={() => {
            setChallengeId(null);
            setCode("");
          }}
          className="w-full text-center text-xs text-slate-500 hover:text-slate-800"
        >
          ← Geri dön
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="card p-6 md:p-8 space-y-5"
      noValidate
    >
      <Field error={errors.email?.message}>
        <Label htmlFor="email" required>
          E-posta
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="ornek@firma.com"
          autoComplete="email"
          autoFocus
          hasError={!!errors.email}
          {...register("email")}
        />
      </Field>

      <Field error={errors.password?.message}>
        <div className="flex items-center justify-between mb-1.5">
          <Label htmlFor="password" required className="mb-0">
            Şifre
          </Label>
          <Link
            href="/forgot-password"
            className="text-xs text-brand-700 hover:text-brand-800 hover:underline"
          >
            Şifremi unuttum
          </Link>
        </div>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="current-password"
            hasError={!!errors.password}
            className="pr-10"
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            tabIndex={-1}
            aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
      </Field>

      <div className="pt-1">
        <Button type="submit" loading={login.isPending} fullWidth size="lg">
          {login.isPending ? "Giriş yapılıyor..." : "Giriş Yap"}
        </Button>
      </div>

      <div className="text-center text-sm text-slate-600 pt-2 border-t border-surface-border space-y-1">
        <div>
          Tedarikçi misiniz?{" "}
          <Link
            href="/supplier/login"
            className="text-brand-700 hover:text-brand-800 font-medium hover:underline"
          >
            Tedarikçi girişi →
          </Link>
        </div>
        <div className="text-xs text-slate-500">
          Yeni tedarikçi hesabı için{" "}
          <Link
            href="/register/supplier"
            className="text-brand-600 hover:underline"
          >
            kayıt ol
          </Link>
        </div>
      </div>
    </form>
  );
}
