"use client";

import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import { usePathname } from "next/navigation";

/**
 * Admin alan guard'ı — /admin/login hariç TÜM /admin/* sayfalarını layout
 * seviyesinde korur. Böylece yeni bir admin sayfası eklendiğinde guard'ı
 * unutma riski yok (önceden her sayfa manuel <RequireAdminAuth> sarıyordu;
 * biri unutulursa korumasız render olurdu).
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (pathname === "/admin/login") return <>{children}</>;
  return <RequireAdminAuth>{children}</RequireAdminAuth>;
}
