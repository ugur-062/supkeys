"use client";

import { useTranslations } from "next-intl";

/**
 * Oturum durumu bilinene dek giriş ve kayıt sayfasının çizdiği kısa yükleme
 * durumu (`useCompanySessionWait`). İki sayfada AYNI kutu: girişli ziyaretçi
 * hangi sayfayı açarsa açsın formu değil bunu görür, sonra yönlendirilir.
 */
export function SessionCheck() {
  const t = useTranslations("web.auth.login");
  return (
    <div role="status" aria-busy="true">
      <div className="h-64 animate-pulse rounded-2xl bg-zinc-100" aria-hidden />
      <span className="sr-only">{t("checkingSession")}</span>
    </div>
  );
}
