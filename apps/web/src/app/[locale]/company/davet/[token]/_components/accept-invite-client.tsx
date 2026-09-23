"use client";

import { Badge } from "@/components/catalyst/badge";
import { ConsentRows, type Consents } from "@/components/auth/consent-rows";
import { PasswordStrength } from "@/components/auth/password-strength";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/catalyst/button";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { AuthShell } from "@/components/marketing/auth-shell";
import {
  useAcceptInvitation,
  useInvitationPreview,
  useSetCompanyAuth,
} from "@/hooks/use-company-auth";
import { usePasswordRules } from "@/lib/company-auth/password-rules";
import { extractErrorMessage } from "@/lib/tenders/error";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

/**
 * Token'lı ekip daveti kabulü — davetli adını/parolasını KENDİSİ belirler,
 * sözleşmeleri kendisi onaylar (KVKK/consent). Başarıda oturum açılır.
 */
export function AcceptInviteClient({ token }: { token: string }) {
  const t = useTranslations("web.auth.invite");
  const tc = useTranslations("web.auth.common");
  const tp = useTranslations("web.auth.password");
  const { rules: PW_RULES, strength } = usePasswordRules();
  const router = useRouter();
  const { data: preview, isLoading, error: previewError } =
    useInvitationPreview(token);
  const accept = useAcceptInvitation(token);
  const setAuth = useSetCompanyAuth();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    password: "",
    passwordConfirm: "",
  });
  const [consents, setConsents] = useState<Consents>({
    terms: false,
    mediation: false,
    kvkk: false,
    marketing: false,
    profile: false,
  });
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const pwScore = useMemo(
    () => PW_RULES.filter((r) => r.test(form.password)).length,
    [PW_RULES, form.password],
  );
  const pwOk = pwScore === PW_RULES.length;
  const confirmOk =
    form.passwordConfirm.length > 0 && form.password === form.passwordConfirm;
  const formValid =
    form.firstName.trim().length >= 2 &&
    form.lastName.trim().length >= 2 &&
    pwOk &&
    confirmOk &&
    consents.terms &&
    consents.mediation &&
    consents.kvkk;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid) return;
    setError(null);
    try {
      const res = await accept.mutateAsync({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
        termsAccepted: consents.terms,
        mediationAccepted: consents.mediation,
        kvkkAccepted: consents.kvkk,
        marketingConsent: consents.marketing,
        profileImprovementConsent: consents.profile,
      });
      setAuth({ user: res.user, company: res.company });
      router.replace("/company");
    } catch (err) {
      setError(extractErrorMessage(err, t("failed")));
    }
  };

  /* Rol adları ürün sözlüğüdür (CLAUDE.md); bilinmeyen rol kodu olduğu gibi çizilir. */
  const roleLabel = (r: string) => (t.has(`roles.${r}` as never) ? t(`roles.${r}` as never) : r);

  if (isLoading) {
    return (
      <AuthShell title={t("title")} subtitle={t("verifying")} footer={null}>
        <p className="py-8 text-center text-sm text-zinc-500">{t("loading")}</p>
      </AuthShell>
    );
  }

  if (previewError || !preview) {
    return (
      <AuthShell
        title={t("invalidTitle")}
        subtitle={t("invalidSubtitle")}
        footer={null}
      >
        <div className="space-y-4 py-4">
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {extractErrorMessage(previewError, t("notFound"))}
          </div>
          <Link
            href="/company/login"
            className="block text-center text-sm font-medium text-zinc-600 underline hover:text-zinc-900"
          >
            {t("backToLogin")}
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("title")}
      subtitle={t("subtitle", { company: preview.companyName })}
      footer={
        <>
          {tc("haveAccount")}{" "}
          <Link href="/company/login" className="font-semibold text-zinc-900 underline">
            {t("loginLink")}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-zinc-900">
              {preview.companyName}
            </span>
            <span className="flex gap-1">
              {preview.roles.map((r) => (
                <Badge key={r} color="zinc">
                  {roleLabel(r)}
                </Badge>
              ))}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{preview.email}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <Label>{tc("firstName")}</Label>
            <Input
              autoFocus
              value={form.firstName}
              maxLength={80}
              onChange={(e) => set("firstName")(e.target.value)}
            />
          </Field>
          <Field>
            <Label>{tc("lastName")}</Label>
            <Input
              value={form.lastName}
              maxLength={80}
              onChange={(e) => set("lastName")(e.target.value)}
            />
          </Field>
        </div>

        <Field>
          <Label>{t("phoneOptional")}</Label>
          <PhoneInput value={form.phone} onChange={set("phone")} />
        </Field>

        <Field>
          <Label>{tc("password")}</Label>
          <PasswordInput
            autoComplete="new-password"
            maxLength={72}
            value={form.password}
            onChange={(e) => set("password")(e.target.value)}
          />
        </Field>
        {form.password ? (
          <PasswordStrength password={form.password} rules={PW_RULES} score={pwScore} label={strength(pwScore)} />
        ) : null}

        <Field>
          <Label>{tc("password")} ({tp("repeatShort")})</Label>
          <PasswordInput
            autoComplete="new-password"
            value={form.passwordConfirm}
            onChange={(e) => set("passwordConfirm")(e.target.value)}
          />
          {form.passwordConfirm && !confirmOk ? (
            <p className="mt-1 text-xs text-red-600">{tp("mismatch")}</p>
          ) : null}
        </Field>

        <ConsentRows consents={consents} onChange={setConsents} />

        {error ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <Button type="submit" className="w-full" disabled={!formValid || accept.isPending}>
          {accept.isPending ? t("joining") : t("submit")}
        </Button>
      </form>
    </AuthShell>
  );
}
