"use client";

import { useAdminAuth, useAdminMe } from "@/hooks/use-admin-auth";
import { ShieldAlert } from "lucide-react";

/**
 * 2FA zorunluluğu (derin denetim MU-01) — /me tazeleyici. Admin layout'unda
 * her korumalı sayfada çalışır: kalıcı snapshot eski olabilir (kural devreye
 * girmeden açılmış oturum); taze `twoFactorSetupRequired` gelince
 * RequireAdminAuth paneli Ayarlar'a kilitler. Hiçbir şey çizmez.
 */
export function AdminMeRefresher() {
  useAdminMe();
  return null;
}

/**
 * Kurulum zorunluyken panelin neden kilitli olduğunu anlatan kart. Ayarlar
 * sayfasında, 2FA bölümünün ÜSTÜNDE normal akışta çizilir. Ekrana sabitlenmiş
 * (fixed) olmamalı: önceden altta sabit duruyordu ve sayfanın son öğesi olan
 * 2FA bölümünün 'Etkinleştir'/'Vazgeç' (mobilde '2FA Kur') düğmelerini
 * örtüyordu; kısa sayfa kaydırılamadığından 1366x768'de kurulum fareyle
 * yapılamıyordu (boşluk taraması GB1).
 */
export function TwoFactorSetupNotice() {
  const { admin } = useAdminAuth();
  if (!admin?.twoFactorSetupRequired) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">İki adımlı doğrulama (2FA) zorunlu</p>
        <p className="mt-1">
          Hesabınızın yetkisi nedeniyle panelin geri kalanı, 2FA kurulana kadar
          kapalı. Aşağıdaki &quot;İki Adımlı Doğrulama&quot; bölümünden
          authenticator uygulamanızla 2FA&apos;yı kurun; kurulum biter bitmez
          tüm sayfalar açılır.
        </p>
      </div>
    </div>
  );
}
