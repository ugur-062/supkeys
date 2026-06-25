"use client";

import { Button } from "@/components/catalyst/button";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { AuthShell } from "@/components/marketing/auth-shell";
import { companyApi } from "@/lib/company-auth/api";
import Link from "next/link";
import { useState } from "react";

export function CompanyForgotPasswordClient() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return;
    setPending(true);
    try {
      await companyApi.post("/company-auth/forgot-password", { email });
    } catch {
      // Backend var/yok ayrımı sızdırmaz, her zaman success döner; buraya
      // yalnızca ağ hatasında düşeriz — yine de generic mesaj göster.
    } finally {
      setSent(true);
      setPending(false);
    }
  };

  return (
    <AuthShell
      title="Şifremi unuttum"
      subtitle="E-posta adresine sıfırlama bağlantısı gönderelim"
      footer={
        <>
          Hatırladın mı?{" "}
          <Link
            href="/company/login"
            className="font-semibold text-zinc-900 hover:underline"
          >
            Giriş yap
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center text-sm text-emerald-800">
          Eğer bu e-posta kayıtlıysa, parola sıfırlama bağlantısı gönderildi.
          Gelen kutunu (ve spam klasörünü) kontrol et. Bağlantı 1 saat geçerli.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field>
            <Label>E-posta</Label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Button
            type="submit"
            className="w-full"
            disabled={pending || !email.includes("@")}
          >
            {pending ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
