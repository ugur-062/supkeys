"use client";

import { Checkbox, CheckboxField } from "@/components/catalyst/checkbox";
import { ErrorMessage, Label } from "@/components/catalyst/fieldset";
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
 *
 * `requiredError` (arayüz testi 2026-10 signup-tr-8): gönder düğmesi sessizce
 * pasif kalmaz; basılınca işaretlenmemiş ZORUNLU her kutu `aria-invalid` olur
 * ve altında bu ileti çizilir (Headless `Description` → kutunun
 * `aria-describedby`ı). İsteğe bağlı iki kutu hiçbir zaman hata almaz.
 */
export function ConsentRows({
  consents,
  onChange,
  showProviders = false,
  requiredError,
}: {
  consents: Consents;
  onChange: (next: Consents) => void;
  /** KVKK satırında yurt dışı sağlayıcı parantezi (kayıt formunda). */
  showProviders?: boolean;
  /** Doluysa işaretlenmemiş zorunlu kutuların altında gösterilir. */
  requiredError?: string | null;
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
      <CheckRow checked={consents.terms} onChange={setKey("terms")} error={requiredError}>
        {t.rich("terms", { a: link("/sozlesmeler/kullanici") })}
      </CheckRow>
      <CheckRow checked={consents.mediation} onChange={setKey("mediation")} error={requiredError}>
        {t.rich("mediation", { a: link("/sozlesmeler/aracilik") })}
      </CheckRow>
      <CheckRow checked={consents.kvkk} onChange={setKey("kvkk")} error={requiredError}>
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
  error,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Zorunlu kutu işaretsizken gösterilecek ileti (yalnız zorunlu satırlar verir). */
  error?: string | null;
  children: ReactNode;
}) {
  const invalid = !checked && !!error;
  return (
    <CheckboxField className="gap-x-2!">
      <Checkbox checked={checked} onChange={onChange} aria-invalid={invalid ? true : undefined} />
      <Label className="cursor-pointer text-xs/5! text-zinc-700!">{children}</Label>
      {invalid ? (
        // Izgarada etiketin altına (2. sütun, 2. satır) oturur.
        <ErrorMessage className="col-start-2 row-start-2 text-xs/5! sm:text-xs/5!">{error}</ErrorMessage>
      ) : null}
    </CheckboxField>
  );
}
