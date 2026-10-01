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
import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Dil değişince onay toast'ı YENİ dilde, yönlendirmeden SONRA çıkar (arayüz
 * testi D-136: eskiden yönlendirmeden önce eski çeviriyle çıkıyor ya da sayfa
 * yenilenirken kayboluyordu). Hedef dil tek seferlik bayrak olarak oturum
 * deposuna yazılır; sayfa o dilde açılınca okunup silinir.
 */
const LOCALE_SAVED_FLAG = "rothern:locale-saved";

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

  useEffect(() => {
    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem(LOCALE_SAVED_FLAG);
    } catch {
      return;
    }
    if (pending !== current) return;
    // Bir tık sonra: Toaster ağaçta bu bileşenden SONRA abone oluyor. Bayrak
    // zamanlayıcı içinde silinir (StrictMode çift efekti toast'ı yutmasın).
    const id = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(LOCALE_SAVED_FLAG);
      } catch {
        /* depo yok — toast yine çıkar */
      }
      toast.success(t("saved"));
    }, 0);
    return () => window.clearTimeout(id);
  }, [current, t]);

  const onChange = async (next: Locale) => {
    if (next === value) return;
    try {
      await updateMe.mutateAsync({ locale: next });
      let flagged = false;
      try {
        sessionStorage.setItem(LOCALE_SAVED_FLAG, next);
        flagged = true;
      } catch {
        /* oturum deposu kapalı → aşağıda eski dilde bildir */
      }
      if (!flagged) toast.success(t("saved"));
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
