"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { useCompanyAuth, useCompanyPermissionsSynced } from "@/hooks/use-company-auth";
import { useRouter } from "@/i18n/navigation";
import { usePortalStore } from "@/lib/company/portal-store";
import { connectionsPagePath } from "@/lib/company/connections-entry";

/**
 * Portaldan bağımsız Bağlantılar girişi (`/company/baglantilar[?view=incoming]`).
 * Bağlantı isteği / kabulü bildirimi firmanın `connections:manage` taşıyan HER
 * üyesine gider; hangi portalı açabildiği kişiden kişiye değişir (satışçı
 * satınalmayı, Gold altındaki satın almacı satışı açamaz). Portalı sunucu
 * firma başına seçseydi bir kısmı "erişim yetkiniz yok" ekranına düşerdi; burada
 * kişinin kendi izinleriyle seçilir. Yalnız `?view=incoming` taşınır.
 */
function Redirector() {
  const t = useTranslations("web.panel.company.page");
  const { user, company } = useCompanyAuth();
  const synced = useCompanyPermissionsSynced();
  const lastPortal = usePortalStore((s) => s.lastPortal);
  const params = useSearchParams();
  const router = useRouter();
  const redirected = useRef(false);
  const incoming = params.get("view") === "incoming";

  useEffect(() => {
    // İzinler `/me` ile eşitlenmeden karar verilmez: bayat anlık görüntü kişiyi
    // açamadığı portala gönderebilirdi.
    if (!user || !synced || redirected.current) return;
    redirected.current = true;
    router.replace(connectionsPagePath(user, company?.tier, lastPortal, incoming));
  }, [user, synced, company?.tier, lastPortal, incoming, router]);

  return <div className="p-8 text-sm text-zinc-500">{t("yonlendiriliyor")}</div>;
}

export default function ConnectionsEntryPage() {
  return (
    <Suspense fallback={null}>
      <Redirector />
    </Suspense>
  );
}
