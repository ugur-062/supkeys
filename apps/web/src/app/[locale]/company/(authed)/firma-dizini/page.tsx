"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useRouter } from "@/i18n/navigation";
import { memberDirectoryTarget } from "@/lib/public/member-gate";

/**
 * ÜYENİN FİRMA DİZİNİ — yönlendirme adresi (arayüz testi Y-03).
 *
 * Herkese açık `/firmalar` sayfasının "Ücretsiz üye ol / Giriş yap" dönüşü
 * eskiden sabit `/company/satinalma/firmalar`dı; satınalma Gold kapısının
 * arkasında olduğu için ücretsiz/Silver üye (ve yeni kaydolan her firma) Gold
 * duvarına düşüyordu. Dizin iki portalda da var: Gold ∧ satınalma yetkisi →
 * satınalma dizini, satış görüntüleme → satış dizini (`memberDirectoryTarget`).
 */
export default function MemberDirectoryRedirect() {
  const t = useTranslations("web.marketplace.memberGate");
  const { user, company } = useCompanyAuth();
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (!user || done.current) return;
    done.current = true;
    const qs = typeof window === "undefined" ? "" : window.location.search;
    router.replace(`${memberDirectoryTarget(user, company)}${qs}`);
  }, [user, company, router]);

  return <div className="p-8 text-sm text-zinc-500">{t("directoryRedirect")}</div>;
}
