"use client";

import { Badge } from "@/components/catalyst/badge";
import { ConsentRows, type Consents } from "@/components/auth/consent-rows";
import { PasswordStrength } from "@/components/auth/password-strength";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/catalyst/button";
import { ErrorMessage, Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { AuthShell } from "@/components/marketing/auth-shell";
import {
  useAcceptInvitation,
  useInvitationPreview,
  useSetCompanyAuth,
} from "@/hooks/use-company-auth";
import {
  firstUnmetPasswordRule,
  PASSWORD_ERROR_KEY,
  PASSWORD_MAX_LENGTH,
} from "@/lib/company-auth/password-rules";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { useFocusFirstInvalid } from "@/lib/company-auth/use-focus-first-invalid";
import { isValidPhoneNumber } from "@rothern/shared";
import { extractErrorMessage } from "@/lib/tenders/error";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { useSubmitLock } from "@/hooks/use-submit-lock";

/**
 * Token'lı ekip daveti kabulü — davetli adını/parolasını KENDİSİ belirler,
 * sözleşmeleri kendisi onaylar (KVKK/consent). Başarıda oturum açılır.
 *
 * Form kayıt formuyla AYNI kalıptadır (arayüz testi 2026-10 code-auth-9/12,
 * signup-enru-9): gönder düğmesi sessizce pasif kalmaz — basılınca geçersiz
 * her alan iletisini altında gösterir, `aria-invalid` olur ve odak ilk
 * geçersiz alana gider; iki şifre alanı da aynı tavanda durur; telefon kutusu
 * `<Field>`in doğrudan çocuğudur (etiket boşluğu ve etiket/hata bağı).
 */
export function AcceptInviteClient({ token }: { token: string }) {
  const t = useTranslations("web.auth.invite");
  const tc = useTranslations("web.auth.common");
  const tp = useTranslations("web.auth.password");
  // Zorunlu alan iletileri kayıt formununkilerle AYNI metin ("Adınızı girin"
  // …): iki form aynı alanı aynı cümleyle ister, ayrı anahtar açılmadı.
  const ts = useTranslations("web.auth.signup");
  const router = useRouter();
  const { data: preview, isLoading, error: previewError } =
    useInvitationPreview(token);
  const accept = useAcceptInvitation(token);
  const setAuth = useSetCompanyAuth();
  // Bu tarayıcıda açık başka bir oturum (arayüz testi D-348): kabul, oturumu
  // davetli hesaba geçirir — kullanıcı bunu önceden bilsin.
  const sessionUser = useCompanyAuthStore((s) => s.user);

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
  // Telefon hatası alandan ÇIKINCA gösterilir (yazarken her hanede uyarı çıkmasın).
  const [phoneTouched, setPhoneTouched] = useState(false);
  // Gönder düğmesine basıldı: geçersiz her alan iletisini gösterir.
  const [submitted, setSubmitted] = useState(false);

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Kurallar TEK kaynaktan (`password-rules.ts`): kayıt, sıfırlama, davet aynı
  // — 72 UTF-8 bayt üst sınırı dahil (kontrol listesi onu yalnız aşıldığında gösterir).
  const pwUnmet = firstUnmetPasswordRule(form.password);
  const confirmOk =
    form.passwordConfirm.length > 0 && form.password === form.passwordConfirm;
  // Telefon isteğe bağlı; yazıldıysa kayıt formuyla AYNI kural (ülkeye göre
  // ulusal uzunluk, tek kaynak `isValidPhoneNumber`; API DTO'su da aynı) —
  // eksik numara sessizce kaydediliyordu (arayüz testi O-121).
  // Ülkesiz yazılan numara (İngilizce arayüz) değeri BOŞ bırakır; boş
  // sayılıp sessizce düşmesin, "önce ülke kodunu seçin" desin (arayüz testi
  // son tur webA-1).
  const [phoneNeedsCountry, setPhoneNeedsCountry] = useState(false);
  const phoneValid = !phoneNeedsCountry && (!form.phone.trim() || isValidPhoneNumber(form.phone));
  const firstNameOk = form.firstName.trim().length >= 1;
  const lastNameOk = form.lastName.trim().length >= 1;
  const allConsents = consents.terms && consents.mediation && consents.kvkk;
  const formValid =
    firstNameOk && lastNameOk && phoneValid && pwUnmet === null && confirmOk && allConsents;

  /**
   * Alan hataları. Düğmeye basılana dek yalnız eskiden de canlı olan ikisi
   * görünür (telefon: alandan çıkınca; şifre tekrarı: yazarken); basıldıktan
   * sonra geçersiz HER alan iletisini taşır ve düzeltildikçe kendiliğinden
   * kalkar. İleti alanın `<Field>`i içinde `ErrorMessage`dır → Headless onu
   * girdinin `aria-describedby`ına bağlar; `invalid` → `aria-invalid`.
   */
  const fieldError = {
    firstName: submitted && !firstNameOk ? ts("firstNameRequired") : null,
    lastName: submitted && !lastNameOk ? ts("lastNameRequired") : null,
    phone:
      (submitted || phoneTouched) && !phoneValid
        ? phoneNeedsCountry
          ? tc("phoneCountryRequired")
          : t("phoneInvalid")
        : null,
    password: submitted && pwUnmet ? tp(PASSWORD_ERROR_KEY[pwUnmet]) : null,
    passwordConfirm:
      form.passwordConfirm && !confirmOk
        ? tp("mismatch")
        : submitted && !form.passwordConfirm
          ? ts("passwordRepeatRequired")
          : null,
    consents: submitted && !allConsents ? ts("consentRequired") : null,
  };

  const inviteForm = useFocusFirstInvalid();

  // Çift tık ikinci kabul isteği atıp panelde hata göstermesin (arayüz testi
  // FX-00 D-003). Başarıda panele yönlendirilir → kilit bırakılmaz.
  const lock = useSubmitLock();
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid) {
      setSubmitted(true);
      inviteForm.focusFirstInvalid();
      return;
    }
    lock.run(doAccept, { keepOnSuccess: true }).catch(() => {});
  };
  const doAccept = async () => {
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
      throw err;
    }
  };

  /* Rol adları ürün sözlüğüdür (CLAUDE.md); bilinmeyen rol kodu olduğu gibi çizilir. */
  const roleLabel = (r: string) => (t.has(`roles.${r}` as never) ? t(`roles.${r}` as never) : r);
  const b = (chunks: ReactNode) => <strong>{chunks}</strong>;

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
      {/* `noValidate`: tarayıcının kendi baloncuğu (tarayıcı dilinde) çıkmaz;
          hatalar alanın altında, sayfa dilinde. */}
      <form ref={inviteForm.ref} noValidate onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-zinc-900">
              {preview.companyName}
            </span>
            <span className="flex gap-1">
              {/* Yalnız görüntüleme izniyle davet: rol seti boş → "Görüntüleyici". */}
              {(preview.roles.length ? preview.roles : ["VIEWER"]).map((r) => (
                <Badge key={r} color="zinc">
                  {roleLabel(r)}
                </Badge>
              ))}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{preview.email}</p>
        </div>

        {sessionUser && sessionUser.email.toLowerCase() !== preview.email.toLowerCase() ? (
          <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t.rich("otherSession", { current: sessionUser.email, invited: preview.email, b })}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <Label>{tc("firstName")}</Label>
            <Input
              autoFocus
              value={form.firstName}
              maxLength={80}
              invalid={!!fieldError.firstName}
              onChange={(e) => set("firstName")(e.target.value)}
            />
            {fieldError.firstName ? <ErrorMessage>{fieldError.firstName}</ErrorMessage> : null}
          </Field>
          <Field>
            <Label>{tc("lastName")}</Label>
            <Input
              value={form.lastName}
              maxLength={80}
              invalid={!!fieldError.lastName}
              onChange={(e) => set("lastName")(e.target.value)}
            />
            {fieldError.lastName ? <ErrorMessage>{fieldError.lastName}</ErrorMessage> : null}
          </Field>
        </div>

        <Field>
          <Label>{t("phoneOptional")}</Label>
          {/* Kök `<Field>`in DOĞRUDAN çocuğu: Catalyst etiketle denetim
              arasındaki boşluğu yalnız etiketin hemen ardındaki
              `data-slot="control"` öğesine koyar (CLAUDE.md, webC-09). Eski
              sarmalayıcı div o kuralı düşürüyor, "Telefon" etiketi kutusuna
              diğer alanlardan 12 px daha yakın duruyordu. "Alandan çıkış"
              `onBlur` prop'uyla (ülke seçiciden numaraya geçiş sayılmaz). */}
          <PhoneInput
            value={form.phone}
            onChange={set("phone")}
            onCountryMissingChange={setPhoneNeedsCountry}
            onBlur={() => setPhoneTouched(true)}
            invalid={!!fieldError.phone}
          />
          {fieldError.phone ? <ErrorMessage>{fieldError.phone}</ErrorMessage> : null}
        </Field>

        <Field>
          <Label>{tc("password")}</Label>
          <PasswordInput
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            invalid={!!fieldError.password}
            value={form.password}
            onChange={(e) => set("password")(e.target.value)}
          />
          {fieldError.password ? <ErrorMessage>{fieldError.password}</ErrorMessage> : null}
        </Field>
        {form.password || submitted ? (
          <PasswordStrength password={form.password} live />
        ) : null}

        <Field>
          <Label>{tc("password")} ({tp("repeatShort")})</Label>
          {/* İki alanda AYNI tavan: tekrar alanı sınırsızken uzun şifre ilkinde
              kesiliyor, ikincisinde kesilmiyor ve "eşleşmiyor" diyordu
              (arayüz testi 2026-10 code-auth-12). */}
          <PasswordInput
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            invalid={!!fieldError.passwordConfirm}
            value={form.passwordConfirm}
            onChange={(e) => set("passwordConfirm")(e.target.value)}
          />
          {fieldError.passwordConfirm ? <ErrorMessage>{fieldError.passwordConfirm}</ErrorMessage> : null}
        </Field>

        <ConsentRows consents={consents} onChange={setConsents} requiredError={fieldError.consents} />

        {error ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {/* Geçersiz formda düğme PASİF DEĞİL: basılınca eksikler gösterilir. */}
        <Button type="submit" className="w-full" disabled={accept.isPending || lock.locked}>
          {accept.isPending || lock.locked ? t("joining") : t("submit")}
        </Button>
      </form>
    </AuthShell>
  );
}
