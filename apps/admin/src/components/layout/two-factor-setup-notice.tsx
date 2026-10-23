"use client";

import { useAdminAuth, useAdminMe } from "@/hooks/use-admin-auth";
import { KeyRound, ShieldAlert } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * 2FA zorunluluğu (derin denetim MU-01) — /me tazeleyici. Admin layout'unda
 * her korumalı sayfada çalışır: kalıcı snapshot eski olabilir (kural devreye
 * girmeden açılmış oturum); taze `twoFactorSetupRequired` gelince
 * RequireAdminAuth paneli Ayarlar'a kilitler. Hiçbir şey çizmez.
 */
export function AdminMeRefresher() {
  const me = useAdminMe();
  // Sayfa geçişinde snapshot bayatsa (staleTime aşıldı) /me yeniden çekilir:
  // rolü oturum açıkken düşürülen personel menüyü yenilemeden güncel rolle
  // görür (arayüz testi D-224; 403 sonrası anında tazeleme lib/api.ts'te).
  const pathname = usePathname();
  const { isStale, isFetching, refetch } = me;
  useEffect(() => {
    if (isStale && !isFetching) void refetch?.();
    // Yalnız rota değişiminde; isStale değişimi kendi başına tetiklemesin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
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

/**
 * Geçici parola kilidi (arayüz testi D-025) — personel ekle / şifre sıfırla
 * ile verilen geçici şifreyle girildiyse panel, kendi şifresi konana dek
 * kapalıdır. Ayarlar'da, akış içinde (sabitlenmeden, bkz. GB1) çizilir. 2FA da
 * zorunluysa sıra söylenir: API şifre değişimini 2FA kurulana dek açmaz.
 */
export function PasswordChangeRequiredNotice() {
  const { admin } = useAdminAuth();
  if (!admin?.mustChangePassword) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">Kendi şifrenizi belirleyin</p>
        <p className="mt-1">
          Geçici şifreyle giriş yaptınız. Panelin geri kalanı, aşağıdaki
          &quot;Şifre Değiştir&quot; bölümünden kendi şifrenizi koyana kadar
          kapalı. Mevcut şifre alanına size iletilen geçici şifreyi yazın.
          {admin.twoFactorSetupRequired
            ? " Önce iki adımlı doğrulamayı (2FA) kurun; şifre değişimi 2FA kurulunca açılır."
            : ""}
        </p>
      </div>
    </div>
  );
}
