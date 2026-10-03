"use client";

import { Checkbox, CheckboxField } from "@/components/catalyst/checkbox";
import { Label } from "@/components/catalyst/fieldset";
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
 * Metin katalogdan (`web.auth.consents`). Erişilebilir ad görünen metnin
 * kendisidir (Field/Label ilişkisi); eski ayrı kısa aria-label görünen
 * metni tam içermiyordu (WCAG "label in name").
 *
 * Satır Catalyst `CheckboxField` + `Label` (arayüz testi O-120): Headless
 * Checkbox gerçek <input> çizmediği için eski native <label> sarmalayıcısı
 * metne tıklamayı kutuya iletmiyordu — yalnız 16 px'lik kutu çalışıyordu.
 * Headless `Label` tıklamayı kutuya iletir; metindeki bağlantıya tıklama
 * etkileşimli öğe olduğu için iletilmez (sözleşme açılır, kutu değişmez).
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
        <Link href={href} target="_blank" rel="noopener noreferrer" className="underline">
          {chunks}
        </Link>
      );
    };
  const setKey = (k: keyof Consents) => (v: boolean) => onChange({ ...consents, [k]: v });
  return (
    <div className="space-y-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
      <CheckRow checked={consents.terms} onChange={setKey("terms")}>
        {t.rich("terms", { a: link("/sozlesmeler/kullanici") })}
      </CheckRow>
      <CheckRow checked={consents.mediation} onChange={setKey("mediation")}>
        {t.rich("mediation", { a: link("/sozlesmeler/aracilik") })}
      </CheckRow>
      <CheckRow checked={consents.kvkk} onChange={setKey("kvkk")}>
        {t.rich("kvkk", { a: link("/sozlesmeler/kvkk") })}
        {showProviders ? <> {t("kvkkProviders")}</> : null}
      </CheckRow>
      <div className="space-y-2 border-t border-zinc-200/70 pt-2">
        <CheckRow checked={consents.profile} onChange={setKey("profile")}>
          <span className="text-zinc-500">{t("profile")}</span>
        </CheckRow>
        <CheckRow checked={consents.marketing} onChange={setKey("marketing")}>
          <span className="text-zinc-500">{t("marketing")}</span>
        </CheckRow>
      </div>
    </div>
  );
}

function CheckRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <CheckboxField className="gap-x-2!">
      <Checkbox checked={checked} onChange={onChange} />
      <Label className="cursor-pointer text-xs/5! text-zinc-700!">{children}</Label>
    </CheckboxField>
  );
}
