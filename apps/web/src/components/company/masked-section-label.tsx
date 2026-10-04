"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PRICING_HREF, VERIFY_HREF, useVerifyFirst } from "@/components/company/silver-lock-card";

/**
 * MASKELİ GRUBUN BÖLÜM ETİKETİ (2026-10-03) — ücretsiz üyenin Açık
 * Talepler listesinde davetli/bağlantılı taleplerle alıcı adı gizli herkese
 * açık talepleri ayırır. Eski büyük kilit kartının (`LockedRequestsCard`)
 * yerine yalnız bu: bir etiket + tek satır not. Not DOĞRULAMA ÖNCE kuralını
 * izler (doğrulanmamış/reddedilmiş → doğrulama, değilse Paketler).
 */
export function MaskedSectionLabel() {
  const t = useTranslations("web.panel.trade.sellerTendersView");
  const verifyFirst = useVerifyFirst();
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-4 pb-1" data-testid="masked-section">
      <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">{t("maskeliBolumEtiketi")}</h3>
      <p className="text-xs text-zinc-500">
        {t("maskeliNot")}{" "}
        <Link
          href={verifyFirst ? VERIFY_HREF : PRICING_HREF}
          className="font-semibold text-zinc-700 underline underline-offset-2 hover:text-zinc-950"
        >
          {verifyFirst ? t("maskeliNotDogrulan") : t("maskeliNotPaketler")}
        </Link>
      </p>
    </div>
  );
}
