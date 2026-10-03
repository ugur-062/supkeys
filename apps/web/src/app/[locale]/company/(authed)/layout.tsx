import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { panelMessages } from "@/i18n/client-messages";
import { CompanyAuthedLayoutClient } from "./authed-layout-client";

/**
 * Panel düzeni SUNUCUDA başlar: kök sağlayıcı `web.panel` mesajlarını
 * taşımaz (herkese açık sayfaların yükü); burada `panelMessages()` ile
 * panel metinleri de dahil ikinci sağlayıcı kurulur. Kabuk ve kapılar
 * `authed-layout-client.tsx` içinde (istemci).
 */
export default async function CompanyAuthedLayout({ children }: { children: React.ReactNode }) {
  const messages = panelMessages(await getMessages());
  return (
    <NextIntlClientProvider messages={messages}>
      <CompanyAuthedLayoutClient>{children}</CompanyAuthedLayoutClient>
    </NextIntlClientProvider>
  );
}
