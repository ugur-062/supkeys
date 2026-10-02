"use client";

import { useUpdateMe } from "@/hooks/use-company-account";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { usePathname, useRouter } from "@/i18n/navigation";
import { extractErrorMessage } from "@/lib/tenders/error";
import { pickLocale, type Locale } from "@rothern/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Dil değişince onay toast'ı YENİ dilde, yönlendirmeden SONRA çıkar (arayüz
 * testi D-136). Hedef dil tek seferlik bayrak olarak oturum deposuna yazılır;
 * sayfa o dilde açılınca okunup silinir.
 */
export const LOCALE_SAVED_FLAG = "rothern:locale-saved";

function readFlag(): string | null {
  try {
    return sessionStorage.getItem(LOCALE_SAVED_FLAG);
  } catch {
    return null;
  }
}

/**
 * Bayrak bu dili gösteriyorsa onay toast'ını bir kez gösterir. Birden çok
 * yerde bağlanabilir (Ayarlar › Dil + üst çubuk hesap menüsü): bayrak
 * zamanlayıcı İÇİNDE yeniden okunur, ilk tüketen siler → çift toast yok.
 */
export function useLocaleSavedToast() {
  const t = useTranslations("web.settings.language");
  const current = useLocale();
  useEffect(() => {
    if (readFlag() !== current) return;
    // Bir tık sonra: Toaster ağaçta bu bileşenden SONRA abone oluyor. Bayrak
    // zamanlayıcı içinde silinir (StrictMode çift efekti toast'ı yutmasın).
    const id = window.setTimeout(() => {
      if (readFlag() !== current) return;
      try {
        sessionStorage.removeItem(LOCALE_SAVED_FLAG);
      } catch {
        /* depo yok — toast yine çıkar */
      }
      toast.success(t("saved"));
    }, 0);
    return () => window.clearTimeout(id);
  }, [current, t]);
}

/**
 * Hesabın kayıtlı dilini değiştirir (`PATCH company-auth/me { locale }`) ve
 * aynı sayfayı + sorguyu yeni dilin ön ekiyle açar. Panelin dili YALNIZ
 * kayıtlı dili izler (`LocaleUrlSync`); bu yüzden üst çubuktaki seçici de
 * Ayarlar › Dil ile AYNI yolu kullanır (arayüz testi son tur S-BUY).
 * Sorgu verilmezse `window.location`dan okunur (üst çubukta `useSearchParams`
 * Suspense sınırı isterdi).
 */
export function useAccountLocale() {
  const t = useTranslations("web.settings.language");
  const { user } = useCompanyAuth();
  const current = useLocale();
  const updateMe = useUpdateMe();
  const router = useRouter();
  const pathname = usePathname();
  const value = (pickLocale(user?.locale) ?? current) as Locale;

  const switchTo = async (next: Locale, search?: string) => {
    if (next === value || updateMe.isPending) return;
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
      const qs =
        search ?? (typeof window === "undefined" ? "" : window.location.search.replace(/^\?/, ""));
      router.replace(qs ? `${pathname}?${qs}` : pathname, { locale: next });
    } catch (err) {
      toast.error(extractErrorMessage(err, t("failed")));
    }
  };

  return { value, switchTo, isPending: updateMe.isPending };
}
