"use client";

import { readLocaleCookie, writeLocaleCookie } from "@/i18n/locale-cookie";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { pickLocale } from "@rothern/i18n";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Kullanıcının kayıtlı dili (`/me` → `user.locale`) ile tarayıcı çerezini
 * hizalar. Çerez farklıysa yazar ve sunucu ağacını yeniler (`router.refresh`)
 * ki `src/i18n/request.ts` yeni dili okusun. Aynı değerde hiçbir şey yapmaz
 * → döngü yok. Kimliksiz/eski anlık görüntüde (`locale` yok) dokunmaz.
 */
export function LocaleCookieSync() {
  const userLocale = useCompanyAuthStore((s) => s.user?.locale);
  const router = useRouter();
  useEffect(() => {
    const wanted = pickLocale(userLocale);
    if (!wanted || readLocaleCookie() === wanted) return;
    writeLocaleCookie(wanted);
    router.refresh();
  }, [userLocale, router]);
  return null;
}
