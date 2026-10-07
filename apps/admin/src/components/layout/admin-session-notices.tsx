"use client";

import { useAdminAuth, useAdminMe } from "@/hooks/use-admin-auth";
import { KeyRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * /me tazeleyici. Admin layout'unda her korumalı sayfada çalışır: kalıcı
 * snapshot eski olabilir (rol ya da geçici parola bayrağı oturum açıkken
 * değişmiş olabilir); taze `mustChangePassword` gelince RequireAdminAuth
 * paneli Ayarlar'a kilitler. Hiçbir şey çizmez.
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
 * Geçici parola kilidi (arayüz testi D-025) — personel ekle / şifre sıfırla
 * ile verilen geçici şifreyle girildiyse panel, kendi şifresi konana dek
 * kapalıdır. Ayarlar'da, normal akışta çizilir. Ekrana sabitlenmiş (fixed)
 * olmamalı: sabit katman sayfanın altındaki düğmeleri örter, kısa sayfa
 * kaydırılamadığından 1366x768'de işlem fareyle yapılamaz (boşluk taraması GB1).
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
        </p>
      </div>
    </div>
  );
}
