"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useSetSupplierAuth,
  useSupplierLogin,
  useSupplierVerifyOtp,
} from "@/hooks/use-supplier-auth";
import {
  isTwoFactorChallenge,
  type SupplierLoginResponse,
} from "@/lib/supplier-auth/types";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Geçerli bir e-posta giriniz"),
  password: z.string().min(1, "Şifre gerekli"),
});

type LoginValues = z.infer<typeof loginSchema>;

/**
 * Sadece /supplier/* altındaki path'leri kabul eden güvenli redirect helper.
 * Open redirect ataklarını önler (örn `?next=//evil.com`).
 */
function safeNextPath(value: string | null): string {
  if (!value) return "/supplier/dashboard";
  // Sadece "/supplier/" ile başlayan göreli yollar
  if (!value.startsWith("/supplier/") && value !== "/supplier") {
    return "/supplier/dashboard";
  }
  // "//host" başlayan absolute URL'leri reddet
  if (value.startsWith("//")) return "/supplier/dashboard";
  return value;
}

export function SupplierLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const login = useSupplierLogin();
  const verifyOtp = useSupplierVerifyOtp();
  const setAuth = useSetSupplierAuth();
  const [showPassword, setShowPassword] = useState(false);
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

  const finishLogin = (data: SupplierLoginResponse) => {
    setAuth({
      token: data.token,
      supplierUser: data.supplierUser,
      supplier: data.supplier,
    });
    toast.success(`Hoş geldin, ${data.supplierUser.firstName}!`);
    router.push(nextPath);
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

  // 2FA OTP adımı
  if (challengeId) {
    return (
      <form onSubmit={onVerifyOtp} className="space-y-5" noValidate>
        <div>
          <p className="text-sm text-zinc-600">
            Hesabınız 2 adımlı doğrulama ile korunuyor. E-postanıza gönderilen
            6 haneli kodu girin.
          </p>
        </div>
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
          className="w-full text-center text-xs text-zinc-500 hover:text-zinc-800"
        >
          ← Geri dön
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5"
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
            href="/supplier/forgot-password"
            className="text-xs text-zinc-700 hover:text-zinc-800 hover:underline"
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

      <Button type="submit" loading={login.isPending} fullWidth size="lg">
        {login.isPending ? "Giriş yapılıyor..." : "Giriş Yap"}
      </Button>
    </form>
  );
}
