"use client";

import { Field, Label } from "@/components/catalyst/fieldset";
import { Select } from "@/components/catalyst/select";
import { Text } from "@/components/catalyst/text";
import { useAccountLocale, useLocaleSavedToast } from "@/hooks/use-account-locale";
import { LOCALES, LOCALE_LABELS, type Locale } from "@rothern/i18n";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

/**
 * Ayarlar › Hesap Bilgileri › Dil (i18n Faz 1). Seçim ANINDA kaydedilir
 * (`PATCH company-auth/me { locale }`, `VisitsVisibilityCard` kalıbı) ve aynı
 * sayfa yeni dilin ön ekiyle açılır. Panel, bildirimler ve e-postalar bu dili
 * izler (API tarafı JWT stratejisinde `applyUserLocale`). Kaydetme ve onay
 * toast'ı üst çubuktaki dil seçiciyle ortak (`useAccountLocale`).
 */
export function LanguageSection() {
  const t = useTranslations("web.settings.language");
  const searchParams = useSearchParams();
  const { value, switchTo, isPending } = useAccountLocale();
  useLocaleSavedToast();

  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
      <h3 className="text-base font-semibold text-zinc-900">{t("title")}</h3>
      <Text className="mt-0.5 text-sm text-zinc-500">{t("hint")}</Text>
      <Field className="mt-4 max-w-xs">
        <Label>{t("label")}</Label>
        <Select
          value={value}
          disabled={isPending}
          onChange={(e) => void switchTo(e.target.value as Locale, searchParams?.toString() ?? "")}
        >
          {LOCALES.map((code) => (
            <option key={code} value={code} lang={code}>
              {LOCALE_LABELS[code]}
            </option>
          ))}
        </Select>
      </Field>
    </section>
  );
}
