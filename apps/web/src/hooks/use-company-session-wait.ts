"use client";

import { useCompanySessionProbe } from "@/hooks/use-company-auth";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { useEffect, useState } from "react";

/**
 * Oturum yoklaması (`/me`) en çok bu kadar beklenir (ms); sonra form açılır —
 * yavaş ya da uykudan uyanan API ziyaretçiyi yükleme kutusunda bekletmesin
 * (şifre sıfırlama sayfasındaki `LINK_CHECK_WAIT_MS` ile aynı süre).
 */
export const SESSION_PROBE_WAIT_MS = 4000;

/**
 * GİRİŞ VE KAYIT SAYFASI: OTURUM DURUMU BİLİNENE DEK FORM ÇİZİLMEZ.
 *
 * Girişli ziyaretçi formu GÖRMEZ (arayüz testi 2026-10 login-11): eskiden
 * sunucu HTML'i ve ilk boyama tam formdu, yönlendirme ancak hidrasyondan
 * sonraki efektte geliyordu. Oturum durumu bilinene dek (depo yükleniyor /
 * `/me` yoklanıyor) ve yönlendirme sürerken kısa bir yükleme durumu
 * (`SessionCheck`) çizilir; form yalnız "oturum yok" kesinleşince bağlanır.
 * Kural giriş sayfası için yazılmıştı; kayıt sayfası tam formu ~300 ms
 * gösterip sonra panele gidiyordu (relogin-4) → iki sayfa AYNI kancayı okur.
 *
 * "Oturumumu açık bırak" kapalıyken yeni sekmede anlık görüntü yoktur ama
 * çerez geçerlidir: `/me` bir kez yoklanır (`useCompanySessionProbe`), oturum
 * varsa depo dolar ve sayfanın kendi efekti yönlendirir (login-1).
 *
 * YOKLAMA SÜRESİZ BEKLENMEZ (kayıt denetimi 2026-10 web-auth-4): `/me`
 * yanıtsız kaldıkça (istek zaman aşımı 45 sn) sayfada form yoktu.
 * `SESSION_PROBE_WAIT_MS` dolunca "bilinmiyor" çizimde "oturum yok" sayılır ve
 * form açılır. Yoklama sürer: sonradan "oturum var" gelirse depo dolar, form
 * yerini yükleme durumuna bırakır ve sayfa yönlendirir.
 *
 * `true` = yükleme durumunu çiz (form yok).
 */
export function useCompanySessionWait(): boolean {
  const user = useCompanyAuthStore((s) => s.user);
  const isHydrated = useCompanyAuthStore((s) => s.isHydrated);
  const probe = useCompanySessionProbe();
  const probing = isHydrated && !user && probe === "pending";
  const [probeTimedOut, setProbeTimedOut] = useState(false);
  useEffect(() => {
    if (!probing) return;
    const timer = setTimeout(() => setProbeTimedOut(true), SESSION_PROBE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [probing]);
  return !isHydrated || !!user || (probing && !probeTimedOut);
}
