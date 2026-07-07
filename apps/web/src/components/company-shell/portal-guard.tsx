"use client";

import { PremiumGate } from "@/components/company-shell/premium-gate";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { usePortalStore } from "@/lib/company/portal-store";
import { accessiblePortals, type PortalKey } from "@/lib/company/portals";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Portal erişim kapısı — kullanıcının rolü bu portala izin vermiyorsa
 * erişebildiği ilk portala (yoksa Ayarlar'a) yönlendirir + son portalı kaydeder.
 */
export function PortalGuard({
  portal,
  children,
}: {
  portal: PortalKey;
  children: React.ReactNode;
}) {
  const { user, company } = useCompanyAuth();
  const router = useRouter();
  const setLastPortal = usePortalStore((s) => s.setLastPortal);

  const available = user ? accessiblePortals(user.roles, company?.tier) : [];
  const allowed = available.includes(portal);
  // Satınalma'ya rolü uygun (YÖNETİCİ/Satın Almacı) ama STANDARD → premium
  // doğrulama kapısı göster (yönlendirme yerine). Rolü yoksa yönlendir.
  const hasPurchasingRole =
    !!user &&
    (user.roles.includes("SAHIP") ||
      user.roles.includes("YONETICI") ||
      user.roles.includes("SATIN_ALMACI"));
  const premiumLocked =
    portal === "satinalma" &&
    !allowed &&
    hasPurchasingRole &&
    company?.tier !== "PAKET";

  useEffect(() => {
    if (!user) return;
    if (allowed) {
      setLastPortal(portal);
    } else if (!premiumLocked) {
      router.replace(available[0] ? `/company/${available[0]}` : "/company/ayarlar");
    }
  }, [user, allowed, premiumLocked, available, portal, router, setLastPortal]);

  if (user && premiumLocked) return <PremiumGate />;
  if (user && !allowed) {
    return <div className="p-8 text-sm text-zinc-400">Yönlendiriliyor…</div>;
  }
  return <>{children}</>;
}
