"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resendSupplierCode,
  supplierSignup,
  verifySupplierEmail,
} from "@/lib/registration/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { CheckCircle2, Eye, EyeOff, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

interface Props {
  invitationToken?: string;
  connectSlug?: string;
  connectTenantName?: string;
}

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

const schema = z.object({
  firstName: z.string().min(2, "Ad zorunlu"),
  lastName: z.string().min(2, "Soyad zorunlu"),
  email: z.string().email("Geçerli bir kurumsal e-posta giriniz"),
  phone: z.string().optional(),
  password: z
    .string()
    .min(8, "Şifre en az 8 karakter olmalı")
    .regex(PASSWORD_RE, "En az 1 büyük, 1 küçük harf ve 1 rakam içermeli"),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "Devam etmek için onaylayın" }),
  }),
});

type FormValues = z.infer<typeof schema>;

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(d?.message)) return d.message.join(", ");
    return d?.message ?? fallback;
  }
  return fallback;
}

export function SupplierRegisterForm(props: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [stage, setStage] = useState<"account" | "verify" | "done">("account");
  const [challengeId, setChallengeId] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  const signup = useMutation({ mutationFn: supplierSignup });
  const verify = useMutation({
    mutationFn: (c: string) => verifySupplierEmail(challengeId, c),
  });
  const resend = useMutation({
    mutationFn: () => resendSupplierCode(challengeId),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = (v: FormValues) => {
    signup.mutate(
      {
        firstName: v.firstName,
        lastName: v.lastName,
        email: v.email,
        phone: v.phone?.trim() || undefined,
        password: v.password,
      },
      {
        onSuccess: (d) => {
          setChallengeId(d.challengeId);
          setEmail(d.email);
          setStage("verify");
          toast.success("E-postanıza 6 haneli doğrulama kodu gönderildi");
        },
        onError: (e) => toast.error(errMsg(e, "Kayıt başarısız")),
      },
    );
  };

  const onVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    verify.mutate(code, {
      onSuccess: () => setStage("done"),
      onError: (err) => toast.error(errMsg(err, "Kod doğrulanamadı")),
    });
  };

  if (stage === "done") {
    return (
      <div className="card space-y-4 p-6 text-center md:p-8">
        <CheckCircle2 className="mx-auto h-12 w-12 text-success-600" />
        <h2 className="text-lg font-bold text-zinc-900">
          Hesabınız oluşturuldu
        </h2>
        <p className="text-sm text-slate-600">
          E-postanız doğrulandı. Giriş yapıp firma bilgilerinizi tamamlayın.
        </p>
        <Button
          onClick={() => (window.location.href = "/supplier/login")}
          fullWidth
          size="lg"
        >
          Giriş Yap
        </Button>
      </div>
    );
  }

  if (stage === "verify") {
    return (
      <form onSubmit={onVerify} className="card space-y-5 p-6 md:p-8" noValidate>
        <div className="text-center">
          <Mail className="mx-auto mb-2 h-10 w-10 text-brand-600" />
          <p className="text-sm text-slate-600">
            <strong>{email}</strong> adresine gönderilen 6 haneli kodu girin.
          </p>
        </div>
        <Field>
          <Label htmlFor="code" required>
            Doğrulama Kodu
          </Label>
          <Input
            id="code"
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
          loading={verify.isPending}
          disabled={verify.isPending || code.length !== 6}
          fullWidth
          size="lg"
        >
          Doğrula
        </Button>
        <button
          type="button"
          onClick={() =>
            resend.mutate(undefined, {
              onSuccess: () => toast.success("Kod yeniden gönderildi"),
              onError: () => toast.error("Kod gönderilemedi"),
            })
          }
          disabled={resend.isPending}
          className="w-full text-center text-xs text-slate-500 hover:text-slate-800"
        >
          Kodu yeniden gönder
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="card space-y-5 p-6 md:p-8"
      noValidate
    >
      {props.connectTenantName ? (
        <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-3 text-xs text-brand-800">
          <strong>{props.connectTenantName}</strong> firmasının daveti ile kayıt
          oluyorsunuz.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field error={errors.firstName?.message}>
          <Label htmlFor="firstName" required>
            Ad
          </Label>
          <Input id="firstName" autoFocus {...register("firstName")} />
        </Field>
        <Field error={errors.lastName?.message}>
          <Label htmlFor="lastName" required>
            Soyad
          </Label>
          <Input id="lastName" {...register("lastName")} />
        </Field>
      </div>

      <Field error={errors.email?.message}>
        <Label htmlFor="email" required>
          Kurumsal E-posta
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="ad@firma.com"
          autoComplete="email"
          {...register("email")}
        />
      </Field>

      <Field error={errors.phone?.message} hint="Opsiyonel">
        <Label htmlFor="phone">Telefon</Label>
        <Input id="phone" placeholder="05xx xxx xx xx" {...register("phone")} />
      </Field>

      <Field error={errors.password?.message}>
        <Label htmlFor="password" required>
          Şifre
        </Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="new-password"
            className="pr-10"
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </Field>

      <Field error={errors.acceptTerms?.message}>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            {...register("acceptTerms")}
          />
          <span>
            KVKK Aydınlatma Metni ve kullanım şartlarını okudum, kabul ediyorum.
          </span>
        </label>
      </Field>

      <Button type="submit" loading={signup.isPending} fullWidth size="lg">
        Hesap Oluştur
      </Button>

      <p className="text-center text-sm text-slate-600">
        Zaten hesabınız var mı?{" "}
        <Link
          href="/supplier/login"
          className="font-medium text-brand-700 hover:underline"
        >
          Giriş yap
        </Link>
      </p>
    </form>
  );
}
