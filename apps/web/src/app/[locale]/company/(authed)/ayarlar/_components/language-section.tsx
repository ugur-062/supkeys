"use client";

import { Field, Label } from "@/components/catalyst/fieldset";
import { Select } from "@/components/catalyst/select";
import { Text } from "@/components/catalyst/text";
import { useUpdateMe } from "@/hooks/use-company-account";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { usePathname, useRouter } from "@/i18n/navigation";
import { extractErrorMessage } from "@/lib/tenders/error";
import { LOCALES, LOCALE_LABELS, pickLocale, type Locale } from "@rothern/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

/**
 * Ayarlar › Hesap Bilgileri › Dil (i18n Faz 1). Seçim ANINDA kaydedilir
 * (`PATCH company-auth/me { locale }`, `VisitsVisibilityCard` kalıbı) ve aynı
 * sayfa yeni dilin ön ekiyle açılır. Panel, bildirimler ve e-postalar bu dili
 * izler (API tarafı JWT stratejisinde `applyUserLocale`).
 */
export function LanguageSection() {
  const t = useTranslations("web.settings.language");
  const { user } = useCompanyAuth();
  const current = useLocale();
  const updateMe = useUpdateMe();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = pickLocale(user?.locale) ?? current;

  const onChange = async (next: Locale) => {
    if (next === value) return;
    try {
      await updateMe.mutateAsync({ locale: next });
      toast.success(t("saved"));
      const qs = searchParams?.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { locale: next });
    } catch (err) {
      toast.error(extractErrorMessage(err, t("failed")));
    }
  };

  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
      <h3 className="text-base font-semibold text-zinc-900">{t("title")}</h3>
      <Text className="mt-0.5 text-sm text-zinc-500">{t("hint")}</Text>
      <Field className="mt-4 max-w-xs">
        <Label>{t("label")}</Label>
        <Select
          value={value}
          disabled={updateMe.isPending}
          onChange={(e) => void onChange(e.target.value as Locale)}
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
