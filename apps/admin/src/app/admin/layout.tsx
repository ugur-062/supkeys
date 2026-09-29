"use client";

import { TwoFactorSetupNotice } from "@/components/layout/two-factor-setup-notice";
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import { usePathname } from "next/navigation";

/**
 * Admin alan guard'ı — /admin/login hariç TÜM /admin/* sayfalarını layout
 * seviyesinde korur. Böylece yeni bir admin sayfası eklendiğinde guard'ı
 * unutma riski yok (önceden her sayfa manuel <RequireAdminAuth> sarıyordu;
 * biri unutulursa korumasız render olurdu).
 *
 * TwoFactorSetupNotice her korumalı sayfada /me'yi tazeler: 2FA zorunlu ama
 * kurulmamış admin (MU-01) eski snapshot'la da Ayarlar'a kilitlenir.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (pathname === "/admin/login") return <>{children}</>;
  return (
    <RequireAdminAuth>
      {children}
      <TwoFactorSetupNotice />
    </RequireAdminAuth>
  );
}
