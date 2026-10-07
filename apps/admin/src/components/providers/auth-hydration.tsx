"use client";

import { useAdminAuthStore } from "@/lib/auth/store";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Geçici parolayla giren admin'in girebildiği TEK sayfa (şifre burada değişir). */
export const PASSWORD_CHANGE_PATH = "/admin/settings";

/**
 * Zustand persist localStorage hydration boundary — SSR/CSR mismatch'i önler.
 * `mounted` deseni bilinçli: server + client-ilk-paint ikisinde de null döner
 * (eşleşir), mount sonrası içeriği açar. Store'un `isHydrated`'ine bağlamak
 * mismatch'e yol açardı (senkron localStorage'da client ilk render'da true,
 * server'da false).
 */
export function AuthHydrationBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Korumalı admin sayfaları için. Token yoksa /admin/login'e yönlendirir.
 *
 * Geçici parola kilidi (arayüz testi D-025): `mustChangePassword` iken yalnız
 * Ayarlar (şifre değiştirme) açılır, diğer sayfalar oraya yönlendirilir.
 * Sunucu zaten 403 döner; bu kapı boş/kırık sayfa yerine şifre ekranını
 * gösterir. Bayrak login yanıtından ve /me'den (admin layout'undaki
 * AdminMeRefresher tazeler) gelir. Başka hiçbir hesap durumu paneli kilitlemez.
 */
export function RequireAdminAuth({
  children,
}: {
  children: React.ReactNode;
}) {
  // Oturum httpOnly cookie'de; istemci sinyali `admin` (persist snapshot).
  const { admin, isHydrated } = useAdminAuthStore();
  const pathname = usePathname();
  const passwordLocked =
    !!admin?.mustChangePassword && pathname !== PASSWORD_CHANGE_PATH;

  useEffect(() => {
    if (isHydrated && !admin) {
      window.location.href = "/admin/login";
    } else if (isHydrated && passwordLocked) {
      window.location.href = PASSWORD_CHANGE_PATH;
    }
  }, [isHydrated, admin, passwordLocked]);

  if (!isHydrated || !admin || passwordLocked) {
    return null;
  }

  return <>{children}</>;
}
