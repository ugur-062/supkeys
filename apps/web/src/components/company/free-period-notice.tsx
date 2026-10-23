"use client";

import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { VERIFY_HREF } from "@/lib/public/member-gate";

/**
 * ÜCRETSİZ DÖNEM BİLGİSİ — panel anasayfasında BİR KEZ (kullanıcı kararı
 * 2026-10-07: "ücretsiz hesapta bunu belirtelim … kısa ve öz"). Doğrulanmamış
 * firmaya tek cümle + doğrulama eylemi; incelemedeki ve reddedilen firmaya
 * kendi kısa durumu. Doğrulanmış firmaya hiçbir şey çizilmez. Metinler
 * doğrulama kapısıyla AYNI katalog anahtarları (`verificationGate.*`).
 */
export function FreePeriodNotice({ className = "" }: { className?: string }) {
  const t = useTranslations("web.panel.shell.verificationGate");
  const { company } = useCompanyAuth();
  const status = company?.companyVerificationStatus;
  if (!company || status === "VERIFIED") return null;
  const key = status === "PENDING" ? "pending" : status === "REJECTED" ? "rejected" : "unverified";
  const text = key === "unverified" ? t("unverified.body") : t(`${key}.short`);
  return (
    <section
      data-testid="free-period-notice"
      className={`flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 ${className}`}
    >
      <ShieldCheck aria-hidden className="size-5 shrink-0 text-emerald-700" />
      <p className="min-w-0 flex-1 basis-56 text-sm font-medium text-emerald-950">{text}</p>
      <Link
        href={VERIFY_HREF}
        className="ml-8 shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 sm:ml-0"
      >
        {t(`${key}.cta`)}
      </Link>
    </section>
  );
}
