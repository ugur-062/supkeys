import { createNavigation } from "next-intl/navigation";
import { useLocale } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import NextLink from "next/link";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "@rothern/i18n";
import { localizePath, toOuterHref, type HrefInput } from "./href";
import { routing } from "./routing";

/**
 * Dil farkında gezinme — `next/link` ve `next/navigation` yerine BUNLAR
 * kullanılır. `Link`/`useRouter`/`redirect` İÇ (Türkçe) yolu alır, aktif dilin
 * DIŞ yolunu üretir: `<Link href="/urunler">` → `/en/products`.
 * `usePathname` her zaman İÇ yolu döner (`/company/login` karşılaştırmaları ve
 * menü aktiflik denetimleri dilden bağımsız).
 *
 * NEDEN SARMALAYICI: next-intl `pathnames` kipinde dize adresi yalnız birebir
 * anahtar olarak arar (`pathnames["/talep/rot-1"]` yok → olduğu gibi geçer) ve
 * dinamik rotalarda `{ pathname, params }` nesnesi ister; `usePathname` ise
 * dinamik rotada ŞABLONU (`/talep/[slug]`) döner. İkisi de 117 çağrı yerini
 * bozardı. Burada dize adres `translateRoutePath` ile şablona eşlenip
 * çevrilir, next-intl'e DIŞ yol dize olarak verilir (bilinmeyen yol → yalnız
 * ön ek). Testlerde `vitest.setup.ts` bu modülü Next'in hook'larıyla sahteler;
 * gerçek davranış `i18n/__tests__/navigation.test.tsx` ile sınanır.
 *
 * SUNUCU/İSTEMCİ AYRIMI: `usePathname`/`useRouter` `next/navigation` hook'u
 * ister ve bu modül sunucu bileşenlerinden de import edilir → o ikisi
 * `navigation-client.tsx` ("use client") içinde, buradan yeniden dışa
 * aktarılır (next-intl'in kendi `react-server`/`react-client` ayrımı gibi).
 *
 * `redirect`/`permanentRedirect` AÇIK tip taşır: TypeScript `never` dönen
 * fonksiyonla akış daraltmasını yalnız açık tip açıklaması olan bildirimlerde
 * yapar — aksi hâlde `if (x.kind === "redirect") permanentRedirect(...)`
 * sonrası `x` daralmazdı.
 */
const nav = createNavigation(routing);

export type LinkProps = Omit<ComponentProps<typeof nav.Link>, "href" | "locale"> & {
  href: HrefInput;
  locale?: Locale;
  children?: ReactNode;
};

export function Link({ href, locale, ...rest }: LinkProps) {
  const current = useLocale() as Locale;
  const target = locale ?? current;
  // Dil seçicinin TÜRKÇE bağlantısı: next-intl `locale="tr"` verilince `as-needed`
  // kipinde bile `/tr/…` üretir (sonra 308 ile `/…`). Varsayılan dile geçiş
  // doğrudan ön eksiz adrese gider; next-intl'in yaptığı dil çerezi yazımı
  // burada elle tekrarlanır.
  if (typeof href === "string" && locale === DEFAULT_LOCALE && locale !== current) {
    const { onClick, ...plain } = rest as LinkProps & { onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void };
    return (
      <NextLink
        {...(plain as object)}
        href={localizePath(href, locale)}
        onClick={(e) => {
          onClick?.(e);
          if (typeof document !== "undefined") {
            document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
          }
        }}
      />
    );
  }
  return <nav.Link {...rest} locale={locale} href={toOuterHref(href, target) as never} />;
}

export { usePathname, useRouter } from "./navigation-client";

type RedirectArgs = { href: HrefInput; locale: Locale };

export const redirect: (args: RedirectArgs, ...rest: unknown[]) => never = (args) =>
  nav.redirect({ ...args, href: toOuterHref(args.href, args.locale) } as never);
export const permanentRedirect: (args: RedirectArgs, ...rest: unknown[]) => never = (args) =>
  nav.permanentRedirect({ ...args, href: toOuterHref(args.href, args.locale) } as never);

/** İÇ yol + dil → ön ekli DIŞ yol (`/urunler` + ru → `/ru/tovary`). */
export function getPathname(args: RedirectArgs): string {
  return nav.getPathname({ ...args, href: toOuterHref(args.href, args.locale) } as never);
}
