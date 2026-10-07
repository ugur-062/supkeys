"use client";

import { useTranslations } from "next-intl";
import { VerificationLink } from "@/components/company/verification-gate";

/**
 * MASKELİ GRUBUN BÖLÜM ETİKETİ (2026-10-03) — doğrulanmamış firmanın Açık
 * Talepler listesinde davetli/bağlantılı taleplerle alıcı adı gizli herkese
 * açık talepleri ayırır: bir etiket + tek satır not. Not doğrulama kapısının
 * dilini konuşur (ücretsiz dönem 2026-10-07): "firma doğrulaması gerekir" +
 * duruma göre bağlantı (başvur / durumu gör / yeniden başvur).
 */
export function MaskedSectionLabel() {
  const t = useTranslations("web.panel.trade.sellerTendersView");
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-4 pb-1" data-testid="masked-section">
      <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">{t("maskeliBolumEtiketi")}</h3>
      <p className="text-xs text-zinc-500">
        {t("maskeliNot")}
        <VerificationLink className="text-zinc-700 hover:text-zinc-950" />
      </p>
    </div>
  );
}
