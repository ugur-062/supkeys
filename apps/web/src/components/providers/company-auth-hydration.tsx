"use client";

import { localizePath, stripLocale } from "@/i18n/href";
import { runtimeLocale } from "@/i18n/runtime";
import { loginHref } from "@/lib/public/visibility";

import { useCompanyMe, useCompanySessionProbe } from "@/hooks/use-company-auth";
import { isCompanyLoggingOut } from "@/lib/company-auth/logout-flag";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { useEffect } from "react";

/**
 * Birleşik Company paneli için RequireAuth boundary — token yoksa
 * /company/login'e; onboarding tamamlanmadıysa /company/onboarding'e yönlendirir.
 * Onboarding sayfası (authed) DIŞINDA olduğu için bu boundary onu sarmaz → döngü yok.
 */
export function RequireCompanyAuth({
  children,
}: {
  children: React.ReactNode;
}) {
  // Oturum httpOnly cookie'de; istemci sinyali `user` (persist snapshot).
  const user = useCompanyAuthStore((s) => s.user);
  const isHydrated = useCompanyAuthStore((s) => s.isHydrated);
  // Anlık görüntü yok ≠ oturum yok: "Oturumumu açık bırak" kapalıyken yeni
  // sekmede anlık görüntü bulunmaz ama çerez geçerlidir → girişe atmadan önce
  // `/me` bir kez yoklanır (arayüz testi 2026-10 login-1).
  const probe = useCompanySessionProbe();
  const me = useCompanyMe(!!user);
  const needsOnboarding = !!me.data && !me.data.company.onboardingCompletedAt;

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") return;
    if (!user) {
      // Açık çıkış: düz giriş sayfasına çıkış kancası götürür. Burada `next`
      // eklenirse sonraki giriş yapan kişi önceki kullanıcının son sayfasına
      // düşer (arayüz testi 2026-10 login-2).
      if (isCompanyLoggingOut()) return;
      if (probe === "pending") return;
      // Geri dönüş adresi (2026-09-27): e-postadaki CTA ile panel sayfasına
      // gelen oturumsuz kullanıcı girişten sonra PANOYA düşüyordu. Bulunulan
      // İÇ yol (+ sorgu) `?next=` olarak taşınır; giriş sayfası yalnız
      // `/company/...` göreli yolları kabul eder (açık yönlendirme yok).
      const here = `${stripLocale(window.location.pathname || "/")}${window.location.search ?? ""}`;
      window.location.href = localizePath(loginHref(here), runtimeLocale());
      return;
    }
    if (needsOnboarding) {
      window.location.href = localizePath("/company/onboarding", runtimeLocale());
    }
  }, [isHydrated, user, needsOnboarding, probe]);

  if (!isHydrated || !user) return null;
  // Onboarding gerekiyorsa panel içeriğini gösterme (yönlendiriliyor).
  if (needsOnboarding) return null;

  return <>{children}</>;
}
