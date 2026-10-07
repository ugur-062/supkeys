"use client";

import { AdminMeRefresher } from "@/components/layout/admin-session-notices";
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import { usePathname } from "next/navigation";

/**
 * Admin alan guard'ı — /admin/login hariç TÜM /admin/* sayfalarını layout
 * seviyesinde korur. Böylece yeni bir admin sayfası eklendiğinde guard'ı
 * unutma riski yok (önceden her sayfa manuel <RequireAdminAuth> sarıyordu;
 * biri unutulursa korumasız render olurdu).
 *
 * AdminMeRefresher her korumalı sayfada /me'yi tazeler: geçici parolayla
 * giren admin (D-025) eski snapshot'la da Ayarlar'a kilitlenir, rol değişimi
 * menüye yansır. Kilidin nedenini anlatan uyarı kartı Ayarlar sayfasının
 * içinde (akışta) çizilir — GB1.
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
      <AdminMeRefresher />
    </RequireAdminAuth>
  );
}
