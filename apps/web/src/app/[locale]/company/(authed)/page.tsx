"use client";

import { useTranslations } from "next-intl";
import {
  useCompanyAuth,
  useCompanyMe,
  useHasCompanyPermission,
} from "@/hooks/use-company-auth";
import { usePortalStore } from "@/lib/company/portal-store";
import { accessiblePortals } from "@/lib/company/portals";
import { consumeSignupIntent } from "@/lib/company/signup-intent";
import { useRouter } from "@/i18n/navigation";
import { useEffect } from "react";

export default function CompanyHome() {
  const t = useTranslations("web.panel.company.page");
  const { user, company } = useCompanyAuth();
  const router = useRouter();
  const lastPortal = usePortalStore((s) => s.lastPortal);
  const canAct = useHasCompanyPermission("approval:act");
  // `/me` sorgusu `RequireCompanyAuth` ile ORTAK (önbellekli) — ek istek yok.
  const me = useCompanyMe();
  const meReady = !!me.data || me.isError;
  const needsOnboarding = !!me.data && !me.data.company.onboardingCompletedAt;

  useEffect(() => {
    if (!user) return;
    // ONBOARDING BİLİNMEDEN NİYET TÜKETİLMEZ (2026-09-27): kabuk `/me`
    // yüklenirken sayfayı çiziyordu; niyet burada harcanıp ardından
    // onboarding'e atılınca geri dönüş yolu kayboluyordu (dış talep davetinden
    // kayıt olan tedarikçi talebe değil panoya düşüyordu). Onboarding
    // gerekiyorsa kabuk yönlendirir; bittiğinde buraya dönülür ve niyet o
    // zaman okunur.
    if (!meReady || needsOnboarding) return;
    // Kayıt niyeti (Talep aç / İlan aç / Vitrin aç) — tek kullanımlık; kayıt
    // ve onboarding bittikten sonra ilk gelişte ilgili sihirbaza düşer.
    const intentHref = consumeSignupIntent();
    if (intentHref) {
      router.replace(intentHref);
      return;
    }
    const available = accessiblePortals(user, company?.tier);
    const target =
      lastPortal && available.includes(lastPortal)
        ? lastPortal
        : (available[0] ?? null);
    // Panel erişimi olmayan üye: onaylayıcı işine (Onaylar), rolsüz Ayarlar'a.
    router.replace(
      target
        ? `/company/${target}`
        : canAct
          ? "/company/onaylar"
          : "/company/ayarlar",
    );
  }, [user, company?.tier, lastPortal, canAct, router, meReady, needsOnboarding]);

  return <div className="p-8 text-sm text-zinc-400">{t("yonlendiriliyor")}</div>;
}
