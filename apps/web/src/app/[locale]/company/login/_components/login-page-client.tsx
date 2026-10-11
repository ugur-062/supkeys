"use client";

import { SessionCheck } from "@/components/auth/session-check";
import { AuthShell } from "@/components/marketing/auth-shell";
import { SESSION_PROBE_WAIT_MS, useCompanySessionWait } from "@/hooks/use-company-session-wait";
import { safeNextPath, signupLinkFromLogin } from "@/lib/company-auth/next-path";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { CompanyLoginForm, type CompanyLoginStep } from "./login-form";

// Süre kayıt sayfasıyla ortak kancada (`useCompanySessionWait`).
export { SESSION_PROBE_WAIT_MS };

export function CompanyLoginClient() {
  const t = useTranslations("web.auth.login");
  const user = useCompanyAuthStore((s) => s.user);
  const isHydrated = useCompanyAuthStore((s) => s.isHydrated);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Yalnız NORMALLEŞTİRİLMİŞ yolu `/company` altında kalan hedef kabul edilir
  // (`/company/../urunler` panel dışına çıkarıyordu — login-12).
  const nextPath = safeNextPath(searchParams.get("next"));
  const [step, setStep] = useState<CompanyLoginStep>("login");

  useEffect(() => {
    if (isHydrated && user) {
      router.replace(nextPath);
    }
  }, [isHydrated, user, router, nextPath]);

  // Girişli ziyaretçi formu GÖRMEZ; oturum durumu bilinene dek (depo
  // yükleniyor / "hatırla" kapalıyken `/me` bir kez yoklanıyor, en çok
  // `SESSION_PROBE_WAIT_MS`) ve yönlendirme sürerken kısa yükleme durumu
  // çizilir. Oturum bulunursa depo dolar, yukarıdaki efekt `next`e götürür.
  // Kural kayıt sayfasıyla ORTAK: `useCompanySessionWait`.
  const waiting = useCompanySessionWait();

  return (
    <AuthShell
      title={t("title")}
      subtitle={t("subtitle")}
      // Kod adımlarında (e-posta doğrulama, 2FA) dil seçici yok: adım bileşen
      // durumunda, dil değişimi kullanıcıyı boş forma döndürürdü (login-8).
      hideLanguageSwitcher={!waiting && step !== "login"}
      footer={
        <>
          {t("noAccount")}{" "}
          {/* Dönüş hedefi kayda da taşınır (arayüz testi 2026-10 code-auth-8). */}
          <Link
            href={signupLinkFromLogin({
              target: searchParams.get("next"),
              ref: searchParams.get("ref"),
              intent: searchParams.get("intent"),
            })}
            className="font-semibold text-zinc-900 hover:underline"
          >
            {t("signupLink")}
          </Link>
        </>
      }
    >
      {waiting ? (
        <SessionCheck />
      ) : (
        <CompanyLoginForm nextPath={nextPath} onStepChange={setStep} />
      )}
    </AuthShell>
  );
}
