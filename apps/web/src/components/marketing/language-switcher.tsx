"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { CheckIcon } from "@heroicons/react/20/solid";
import { GlobeAltIcon } from "@heroicons/react/24/outline";
import { LOCALES, LOCALE_LABELS } from "@rothern/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/**
 * DİL SEÇİCİ (i18n Faz 1) — ziyaretçinin tek geçiş yolu (otomatik dil
 * tespiti kapalı, bkz. src/i18n/routing.ts). Aynı sayfayı hedef dilin ön
 * ekiyle açar; sorgu dizesi korunur.
 *
 * Etiketler dilin KENDİ adıyla ve ÇEVRİLMEZ (`LOCALE_LABELS`): kullanıcı
 * yanlış dilde kalmışsa kendi dilini tanısın.
 *
 * `useSearchParams` KULLANILMAZ: üst çubuk statik herkese açık sayfalarda
 * çizilir ve o hook Suspense sınırı ister (CLAUDE.md "useSearchParams +
 * statik sayfa = BUILD hatası"). Sorgu, bağlandıktan sonra `window`dan
 * okunur — ilk çizimde iki tarafta da boş, hidrasyon uyuşmazlığı yok.
 */
export function LanguageSwitcher({
  variant = "menu",
  className,
}: {
  /** `menu`: küre ikonlu açılır liste (üst çubuk) · `inline`: yan yana bağlantılar (altbilgi, mobil menü). */
  variant?: "menu" | "inline";
  className?: string;
}) {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("web.marketing.nav");
  const [search, setSearch] = useState("");
  useEffect(() => {
    setSearch(window.location.search);
  }, [pathname]);
  const href = `${pathname}${search}`;

  if (variant === "inline") {
    return (
      <nav aria-label={t("language")} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)}>
        {LOCALES.map((code) => (
          <Link
            key={code}
            href={href}
            locale={code}
            hrefLang={code}
            lang={code}
            aria-current={code === locale ? "true" : undefined}
            className={cn(
              "text-sm transition",
              code === locale ? "font-semibold text-zinc-950" : "text-zinc-500 hover:text-zinc-950",
            )}
          >
            {LOCALE_LABELS[code]}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <Menu as="div" className={cn("relative", className)}>
      <MenuButton
        aria-label={t("language")}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-950 data-open:bg-zinc-100"
      >
        <GlobeAltIcon aria-hidden className="size-5" />
        <span className="uppercase">{locale}</span>
      </MenuButton>
      <MenuItems
        anchor="bottom end"
        className="z-50 mt-2 w-40 rounded-xl bg-white p-1 shadow-lg ring-1 ring-zinc-950/10 focus:outline-none"
      >
        {LOCALES.map((code) => (
          <MenuItem key={code}>
            <Link
              href={href}
              locale={code}
              hrefLang={code}
              lang={code}
              aria-current={code === locale ? "true" : undefined}
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2 text-sm data-focus:bg-zinc-100",
                code === locale ? "font-semibold text-zinc-950" : "text-zinc-700",
              )}
            >
              {LOCALE_LABELS[code]}
              {code === locale ? <CheckIcon aria-hidden className="size-4 text-zinc-500" /> : null}
            </Link>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  );
}
