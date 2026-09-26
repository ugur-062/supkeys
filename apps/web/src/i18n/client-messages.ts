import type { AbstractIntlMessages } from "next-intl";

/**
 * İSTEMCİYE GİTMEYEN ad alanları (i18n Faz 1): yalnız sunucu bileşenleri ve
 * metadata üreticileri okur — SSS cevapları, Hakkımızda/İletişim gövdeleri,
 * sözleşme kabuğu. (`web.seo` LİSTEDE DEĞİL: ürün/talep detayı ve panel
 * formlarının parçacık önizlemesi istemcide `useSeoT` ile okur.) `NextIntlClientProvider` bunları HTML/RSC
 * yüküne yazmasın diye kök düzende `clientMessages()` ile ayıklanır.
 *
 * Bir istemci bileşeni bu ad alanlarından okursa çalışma zamanında anahtar
 * yolu görünür → `__tests__/client-messages.test.ts` "use client" dosyalarını
 * tarayıp bunu derlemede yakalar. Listeye ekleme yaparken o testi koş.
 */
export const SERVER_ONLY_NAMESPACES = [
  "web.marketing.about",
  "web.marketing.contact",
  "web.marketing.faq",
  "web.marketing.legal",
  "web.marketing.inquiryVerify",
] as const;

export function omitPaths(messages: AbstractIntlMessages, paths: readonly string[]): AbstractIntlMessages {
  const out = JSON.parse(JSON.stringify(messages)) as AbstractIntlMessages;
  for (const path of paths) {
    const parts = path.split(".");
    let node: Record<string, unknown> | null = out;
    for (let i = 0; i < parts.length - 1 && node; i++) {
      const next: unknown = node[parts[i]!];
      node = next && typeof next === "object" ? (next as Record<string, unknown>) : null;
    }
    if (node) delete node[parts[parts.length - 1]!];
  }
  return out;
}

/**
 * PANEL AD ALANI (i18n Faz 2): `web.panel.*` yalnız giriş yapılmış panelde
 * okunur — binlerce metin herkese açık sayfaların RSC/HTML yüküne girmesin
 * diye kök sağlayıcı bunu da ayıklar; `company/(authed)/layout.tsx` (sunucu)
 * paneli `panelMessages()` ile İÇ İÇE ikinci bir sağlayıcıya sarar. Herkese
 * açık yüzeyle paylaşılan bileşen (`components/marketplace`, `components/
 * marketing`, herkese açık sayfalar) `web.panel` OKUYAMAZ —
 * `client-messages.test` dosya sisteminden zorunlu tutar.
 */
export const PANEL_NAMESPACES = ["web.panel"] as const;

export function clientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  return omitPaths(messages, [...SERVER_ONLY_NAMESPACES, ...PANEL_NAMESPACES]);
}

/** Panel sağlayıcısının mesajları: kök istemci mesajları + `web.panel`. */
export function panelMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  const base = clientMessages(messages) as Record<string, unknown>;
  const web = (messages.web ?? {}) as Record<string, unknown>;
  return { ...base, web: { ...(base.web as Record<string, unknown>), panel: web.panel ?? {} } } as unknown as AbstractIntlMessages;
}
