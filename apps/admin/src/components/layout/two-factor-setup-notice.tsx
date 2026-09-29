"use client";

import { useAdminAuth, useAdminMe } from "@/hooks/use-admin-auth";
import { ShieldAlert } from "lucide-react";

/**
 * 2FA zorunluluğu (derin denetim MU-01). İki görev:
 *  1) /me'yi tazeler (useAdminMe → store). Kalıcı snapshot eski olabilir
 *     (kural devreye girmeden açılmış oturum); taze `twoFactorSetupRequired`
 *     gelince RequireAdminAuth paneli Ayarlar'a kilitler.
 *  2) Kurulum zorunluyken panelin neden kilitli olduğunu anlatır. Admin
 *     layout'unda (AdminShell'in DIŞINDA) render edilir; sabit üst çubuğun
 *     altında kalmasın diye ekranın altına sabitlenir.
 */
export function TwoFactorSetupNotice() {
  useAdminMe();
  const { admin } = useAdminAuth();
  if (!admin?.twoFactorSetupRequired) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-2xl items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg"
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">İki adımlı doğrulama (2FA) zorunlu</p>
        <p className="mt-1">
          Hesabınızın yetkisi nedeniyle panelin geri kalanı, 2FA kurulana kadar
          kapalı. Ayarlar sayfasındaki &quot;İki Adımlı Doğrulama&quot;
          bölümünden authenticator uygulamanızla 2FA&apos;yı kurun; kurulum
          biter bitmez tüm sayfalar açılır.
        </p>
      </div>
    </div>
  );
}
