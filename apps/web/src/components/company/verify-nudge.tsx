"use client";

import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useCompanyAuth } from "@/hooks/use-company-auth";

/** Doğrulama sayfası (paket satın almanın da tek şartı). */
export const VERIFICATION_HREF = "/company/ayarlar/dogrulama";

/**
 * DOĞRULAMA TEŞVİKİ — teklif anında (2026-09-28, kullanıcı: "ücretsiz firmaları
 * doğrulamaya da teşvik etmeliyiz"). Belgesiz teklif veren firma alıcıya
 * "Doğrulanmamış firma" ibaresiyle görünür (KYC kapısı tablosu); firma bunu
 * tam teklif verirken öğrenir. Doğrulanmış ya da incelemedeki firmaya
 * çizilmez. Tek eylem: doğrulama sayfası.
 *
 * Yerleşim: metin sütunu en az `basis-56` ister; dar ekranda düğme metnin
 * yanına sıkışıp metni kelime kelime kırmak yerine alt satıra iner
 * (yeniden doğrulama webC-01).
 */
export function VerifyNudge({
  className = "",
  required = false,
}: {
  className?: string;
  /**
   * Gönderim doğrulama İSTİYOR (arayüz testi D-028: PUBLIC talebe davetsiz ∧
   * bağlantısız teklif — API `bidRequiresVerification`). Yumuşak teşvik yerine
   * engelleyici kart: incelemedeki (PENDING) firmaya da çizilir; yalnız taslak.
   */
  required?: boolean;
}) {
  const t = useTranslations("web.panel.verifyNudge");
  const { company } = useCompanyAuth();
  const status = company?.companyVerificationStatus;
  if (required) {
    const pending = status === "PENDING";
    return (
      <section
        role="alert"
        aria-label={t("requiredTitle")}
        className={`flex flex-wrap items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 ${className}`}
      >
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-red-700" />
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-sm font-semibold text-red-900">{t("requiredTitle")}</p>
          <p className="mt-0.5 text-sm text-red-900">
            {pending ? t("requiredPendingBody") : t("requiredBody")}
          </p>
        </div>
        <Link
          href={VERIFICATION_HREF}
          className="ml-8 shrink-0 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 sm:ml-0"
        >
          {pending ? t("requiredPendingCta") : t("cta")}
        </Link>
      </section>
    );
  }
  if (!company || status === "VERIFIED" || status === "PENDING") return null;
  return (
    <section
      aria-label={t("title")}
      className={`flex flex-wrap items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 ${className}`}
    >
      <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-amber-700" />
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-semibold text-amber-900">{t("title")}</p>
        <p className="mt-0.5 text-sm text-amber-900">{t("body")}</p>
      </div>
      <Link
        href={VERIFICATION_HREF}
        className="ml-8 shrink-0 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 sm:ml-0"
      >
        {t("cta")}
      </Link>
    </section>
  );
}
