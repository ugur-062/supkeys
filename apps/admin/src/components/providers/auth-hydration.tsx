"use client";

import { useAdminAuthStore } from "@/lib/auth/store";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** 2FA zorunlu ama kurulmamış admin'in girebildiği TEK sayfa (kurulum burada). */
export const TWO_FACTOR_SETUP_PATH = "/admin/settings";

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
 * 2FA zorunluluğu (derin denetim MU-01): `twoFactorSetupRequired` iken yalnız
 * Ayarlar (2FA kurulumu) açılır, diğer sayfalar oraya yönlendirilir. Sunucu
 * zaten 403 döner; bu kapı boş/kırık sayfa yerine kurulum ekranını gösterir.
 * Bayrak login yanıtından ve /me'den (admin layout'undaki
 * AdminMeRefresher tazeler) gelir. `mustChangePassword` (geçici parola, arayüz
 * testi D-025) aynı kilidi açar: kendi şifresi konana dek yalnız Ayarlar.
 */
export function RequireAdminAuth({
  children,
}: {
  children: React.ReactNode;
}) {
  // Oturum httpOnly cookie'de; istemci sinyali `admin` (persist snapshot).
  const { admin, isHydrated } = useAdminAuthStore();
  const pathname = usePathname();
  // Geçici parola (D-025) da aynı kilidi kullanır: şifre Ayarlar'da değişir.
  const setupLocked =
    (!!admin?.twoFactorSetupRequired || !!admin?.mustChangePassword) &&
    pathname !== TWO_FACTOR_SETUP_PATH;

  useEffect(() => {
    if (isHydrated && !admin) {
      window.location.href = "/admin/login";
    } else if (isHydrated && setupLocked) {
      window.location.href = TWO_FACTOR_SETUP_PATH;
    }
  }, [isHydrated, admin, setupLocked]);

  if (!isHydrated || !admin || setupLocked) {
    return null;
  }

  return <>{children}</>;
}
