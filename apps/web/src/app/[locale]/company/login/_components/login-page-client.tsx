"use client";

import { AuthShell } from "@/components/marketing/auth-shell";
import { useCompanySessionProbe } from "@/hooks/use-company-auth";
import { safeNextPath, signupLinkFromLogin } from "@/lib/company-auth/next-path";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { CompanyLoginForm, type CompanyLoginStep } from "./login-form";

/**
 * Oturum yoklaması (`/me`) en çok bu kadar beklenir (ms); sonra form açılır —
 * yavaş ya da uykudan uyanan API ziyaretçiyi yükleme kutusunda bekletmesin
 * (şifre sıfırlama sayfasındaki `LINK_CHECK_WAIT_MS` ile aynı süre).
 */
export const SESSION_PROBE_WAIT_MS = 4000;

export function CompanyLoginClient() {
  const t = useTranslations("web.auth.login");
  const user = useCompanyAuthStore((s) => s.user);
  const isHydrated = useCompanyAuthStore((s) => s.isHydrated);
  // "Oturumumu açık bırak" kapalıyken yeni sekmede anlık görüntü yoktur ama
  // çerez geçerlidir: form çizilmeden önce `/me` bir kez yoklanır, oturum
  // varsa aşağıdaki efekt `next`e götürür (arayüz testi 2026-10 login-1).
  const probe = useCompanySessionProbe();
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

  /**
   * Girişli ziyaretçi formu GÖRMEZ (arayüz testi 2026-10 login-11): eskiden
   * sunucu HTML'i ve ilk boyama tam formdu (odak e-posta alanında), yönlendirme
   * ancak hidrasyondan sonraki efektte geliyordu. Oturum durumu bilinene dek
   * (depo yükleniyor / `/me` yoklanıyor) ve yönlendirme sürerken kısa bir
   * yükleme durumu çizilir; form yalnız "oturum yok" kesinleşince bağlanır.
   *
   * YOKLAMA SÜRESİZ BEKLENMEZ (kayıt denetimi 2026-10 web-auth-4): `/me`
   * yanıtsız kaldıkça (istek zaman aşımı 45 sn) sayfada e-posta ve şifre alanı
   * yoktu. `SESSION_PROBE_WAIT_MS` dolunca "bilinmiyor" çizimde "oturum yok"
   * sayılır ve form açılır. Yoklama sürer: sonradan "oturum var" gelirse depo
   * dolar, form yerini yükleme durumuna bırakır ve yukarıdaki efekt `next`e
   * götürür.
   */
  const probing = isHydrated && !user && probe === "pending";
  const [probeTimedOut, setProbeTimedOut] = useState(false);
  useEffect(() => {
    if (!probing) return;
    const timer = setTimeout(() => setProbeTimedOut(true), SESSION_PROBE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [probing]);
  const waiting = !isHydrated || !!user || (probing && !probeTimedOut);

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
        <div role="status" aria-busy="true">
          <div className="h-64 animate-pulse rounded-2xl bg-zinc-100" aria-hidden />
          <span className="sr-only">{t("checkingSession")}</span>
        </div>
      ) : (
        <CompanyLoginForm nextPath={nextPath} onStepChange={setStep} />
      )}
    </AuthShell>
  );
}
