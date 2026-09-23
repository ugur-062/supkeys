"use client";

import { Checkbox } from "@/components/catalyst/checkbox";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export interface Consents {
  terms: boolean;
  mediation: boolean;
  kvkk: boolean;
  marketing: boolean;
  profile: boolean;
}

/**
 * Sözleşme onay satırları — kayıt ve davet kabul formlarının ORTAK parçası.
 * Metin katalogdan (`web.auth.consents`); erişilebilir adlar ayrı anahtar
 * (Headless Checkbox <input> render etmez → native <label> ilişkisi kurmaz,
 * ekran okuyucular için açık aria-label şart).
 */
export function ConsentRows({
  consents,
  onChange,
  showProviders = false,
}: {
  consents: Consents;
  onChange: (next: Consents) => void;
  /** KVKK satırında yurt dışı sağlayıcı parantezi (kayıt formunda). */
  showProviders?: boolean;
}) {
  const t = useTranslations("web.auth.consents");
  const link = (href: string) =>
    function LinkChunk(chunks: ReactNode) {
      return (
        <Link href={href} target="_blank" className="underline">
          {chunks}
        </Link>
      );
    };
  const setKey = (k: keyof Consents) => (v: boolean) => onChange({ ...consents, [k]: v });
  return (
    <div className="space-y-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
      <CheckRow checked={consents.terms} ariaLabel={t("termsAria")} onChange={setKey("terms")}>
        {t.rich("terms", { a: link("/sozlesmeler/kullanici") })}
      </CheckRow>
      <CheckRow checked={consents.mediation} ariaLabel={t("mediationAria")} onChange={setKey("mediation")}>
        {t.rich("mediation", { a: link("/sozlesmeler/aracilik") })}
      </CheckRow>
      <CheckRow checked={consents.kvkk} ariaLabel={t("kvkkAria")} onChange={setKey("kvkk")}>
        {t.rich("kvkk", { a: link("/sozlesmeler/kvkk") })}
        {showProviders ? <> {t("kvkkProviders")}</> : null}
      </CheckRow>
      <div className="border-t border-zinc-200/70 pt-2">
        <CheckRow checked={consents.profile} ariaLabel={t("profile")} onChange={setKey("profile")}>
          <span className="text-zinc-500">{t("profile")}</span>
        </CheckRow>
        <CheckRow checked={consents.marketing} ariaLabel={t("marketing")} onChange={setKey("marketing")}>
          <span className="text-zinc-500">{t("marketing")}</span>
        </CheckRow>
      </div>
    </div>
  );
}

function CheckRow({
  checked,
  onChange,
  ariaLabel,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-xs text-zinc-700">
      <Checkbox checked={checked} onChange={onChange} aria-label={ariaLabel} className="mt-0.5" />
      <span>{children}</span>
    </label>
  );
}
