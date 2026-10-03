"use client";

import { Button } from "@/components/catalyst/button";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { AuthShell } from "@/components/marketing/auth-shell";
import { companyApi } from "@/lib/company-auth/api";
import { extractErrorMessage } from "@/lib/tenders/error";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function CompanyForgotPasswordClient() {
  const t = useTranslations("web.auth.forgot");
  const tc = useTranslations("web.auth.common");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return;
    setPending(true);
    setError(null);
    try {
      await companyApi.post("/company-auth/forgot-password", {
        email: email.trim().toLowerCase(),
      });
      // Backend hesap var/yok ayrımı sızdırmaz: kayıtlı olsun olmasın 200.
      setSent(true);
    } catch (err) {
      // Hata yanıtı hesabın varlığına bağlı DEĞİL (hız sınırı 429, geçersiz
      // adres 400, ağ/sunucu hatası) → "gönderildi" demek yalan olurdu; kullanıcı
      // gelmeyen e-postayı bekliyordu (derin denetim LU-22).
      setError(extractErrorMessage(err, t("failed")));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <>
          {t("remembered")}{" "}
          <Link
            href="/company/login"
            className="font-semibold text-zinc-900 hover:underline"
          >
            {tc("login")}
          </Link>
        </>
      }
    >
      {sent ? (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center text-sm text-emerald-800"
        >
          {t("sent")}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field>
            <Label>{tc("email")}</Label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {error ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <Button
            type="submit"
            className="w-full"
            disabled={pending || !email.includes("@")}
          >
            {pending ? t("sending") : t("submit")}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
