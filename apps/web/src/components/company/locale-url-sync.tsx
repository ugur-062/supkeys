"use client";

import { usePathname, useRouter } from "@/i18n/navigation";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { pickLocale } from "@rothern/i18n";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Üyenin kayıtlı dili (`/me` → `user.locale`) adresteki dilden farklıysa aynı
 * sayfayı doğru dil ön ekiyle açar (`/company/…` → `/en/company/…`). Aynı
 * değerde hiçbir şey yapmaz → döngü yok. Kimliksiz ya da eski anlık
 * görüntüde (`locale` yok) dokunmaz. Otomatik dil tespiti kapalı olduğu için
 * (routing.ts) panelin dili YALNIZ buradan kullanıcıyı izler.
 */
export function LocaleUrlSync() {
  const userLocale = useCompanyAuthStore((s) => s.user?.locale);
  const current = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const wanted = pickLocale(userLocale);
    if (!wanted || wanted === current) return;
    const qs = searchParams?.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { locale: wanted });
  }, [userLocale, current, pathname, searchParams, router]);
  return null;
}
