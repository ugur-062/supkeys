"use client";

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
  const { user } = useCompanyAuth();
  const router = useRouter();
  const setLastPortal = usePortalStore((s) => s.setLastPortal);

  const available = user ? accessiblePortals(user.roles) : [];
  const allowed = available.includes(portal);

  useEffect(() => {
    if (!user) return;
    if (!allowed) {
      router.replace(available[0] ? `/company/${available[0]}` : "/company/ayarlar");
    } else {
      setLastPortal(portal);
    }
  }, [user, allowed, available, portal, router, setLastPortal]);

  if (user && !allowed) {
    return (
      <div className="p-8 text-sm text-zinc-400">Yönlendiriliyor…</div>
    );
  }
  return <>{children}</>;
}
