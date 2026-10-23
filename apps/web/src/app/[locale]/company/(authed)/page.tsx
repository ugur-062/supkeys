"use client";

import { useTranslations } from "next-intl";
import {
  useCompanyAuth,
  useCompanyMe,
  useHasCompanyPermission,
} from "@/hooks/use-company-auth";
import { usePortalStore } from "@/lib/company/portal-store";
import { accessiblePortals } from "@/lib/company/portals";
import { userHasPermission } from "@/lib/company/permissions";
import { consumeSignupIntent } from "@/lib/company/signup-intent";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useRef } from "react";

export default function CompanyHome() {
  const t = useTranslations("web.panel.company.page");
  const { user, company } = useCompanyAuth();
  const router = useRouter();
  const lastPortal = usePortalStore((s) => s.lastPortal);
  // Onaylar sayfasının kapısıyla AYNI kural (ApprovalsGate): yalnız akış
  // yetkilisi (approvals:manage) de Onaylar'a düşer (arayüz testi T3).
  const canAct = useHasCompanyPermission("approval:act");
  const canOpenApprovals = canAct || userHasPermission(user, "approvals:manage");
  // PortalGuard ile aynı kural (paket kapısı orada çizilir).
  const canViewBuying = userHasPermission(user, "buy:view");
  // TEK YÖNLENDİRME (arayüz testi Y-08): `/me` gelince kullanıcı nesnesi aynı
  // turda yeniden yazılıyor ve efekt İKİNCİ kez çalışıyordu. İlk çalışma
  // niyeti okuyup silip doğru adrese gidiyor, ikincisi boş niyetle varsayılan
  // portala (`/company/satis`) gidip onu eziyordu — kayıttan sonra "Teklif
  // ver"in talebi, "Ürün ekle"nin formu kayboluyordu. Bayrak yalnız
  // onboarding kontrolleri GEÇTİKTEN sonra kalkar.
  const redirected = useRef(false);
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
    if (redirected.current) return;
    redirected.current = true;
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
    // Panel erişimi olmayan üye: onaylayıcı işine (Onaylar); satınalma yetkili
    // ama paketi Gold altında olan (Silver firmanın Satın Almacısı) satınalma
    // paneline — orada paket kapısı ne gerektiğini söyler; boş menülü Ayarlar
    // açıklamasız bir çıkmazdı (arayüz testi D-179). Rolsüz üye Ayarlar'a.
    router.replace(
      target
        ? `/company/${target}`
        : canOpenApprovals
          ? "/company/onaylar"
          : canViewBuying
            ? "/company/satinalma"
            : "/company/ayarlar",
    );
  }, [user, company?.tier, lastPortal, canOpenApprovals, canViewBuying, router, meReady, needsOnboarding]);

  return <div className="p-8 text-sm text-zinc-400">{t("yonlendiriliyor")}</div>;
}
