"use client";

import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/list/page-container";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { ReactNode } from "react";
import { useSettingsPages, type SettingsPageRef } from "@/lib/company/settings-pages";

/**
 * Alt-ayarlar sayfası kabuğu — geri linki + başlık + içerik.
 * Başlık/açıklama `SETTINGS_PAGES` kaydından gelir (hub kartıyla AYNI metin,
 * okuyucunun dilinde — `useSettingsPages`); daha uzun açıklama gereken sayfa
 * `description` ile ezer.
 */
export function SettingsShell({
  page,
  description,
  children,
}: {
  page: SettingsPageRef;
  description?: string;
  children: ReactNode;
}) {
  const t = useTranslations("web.panel.settings.settingsShell");
  const pages = useSettingsPages();
  const meta = pages[page.key];
  const title = meta.title;
  const desc = description ?? meta.description + ".";
  return (
    // B13: form-ağır Ayarlar bilinçli DAR — tek istisna, PageContainer kuralı.
    <PageContainer width="narrow" className="space-y-6">
      <Link
        href="/company/ayarlar"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("ayarlar")}
      </Link>
      <div>
        <Heading>{title}</Heading>
        <Text className="mt-1 text-sm text-zinc-500">{desc}</Text>
      </div>
      {children}
    </PageContainer>
  );
}
