"use client";

import { createNavigation } from "next-intl/navigation";
import { useLocale } from "next-intl";
import { usePathname as useNextPathname } from "next/navigation";
import { useMemo } from "react";
import type { Locale } from "@rothern/i18n";
import { splitLocale, toOuterHref, type HrefInput } from "./href";
import { routing } from "./routing";

/** İstemci hook'ları — bkz. `navigation.tsx` (tek giriş noktası orası). */
const nav = createNavigation(routing);

/** İÇ yol (dil ön eki ve çevrili parçalar soyulmuş). Next dışı ortamda `null`. */
export function usePathname(): string {
  const pathname = useNextPathname();
  return useMemo(() => (pathname ? splitLocale(pathname).path : (pathname as unknown as string)), [pathname]);
}

type NavRouter = ReturnType<typeof nav.useRouter>;
type NavOpts = Parameters<NavRouter["push"]>[1];

export function useRouter(): {
  push: (href: HrefInput, opts?: NavOpts) => void;
  replace: (href: HrefInput, opts?: NavOpts) => void;
  prefetch: (href: HrefInput, opts?: Parameters<NavRouter["prefetch"]>[1]) => void;
  back: NavRouter["back"];
  forward: NavRouter["forward"];
  refresh: NavRouter["refresh"];
} {
  const router = nav.useRouter();
  const current = useLocale() as Locale;
  return useMemo(
    () => ({
      push: (href, opts) => router.push(toOuterHref(href, (opts?.locale as Locale | undefined) ?? current) as never, opts),
      replace: (href, opts) => router.replace(toOuterHref(href, (opts?.locale as Locale | undefined) ?? current) as never, opts),
      prefetch: (href, opts) => router.prefetch(toOuterHref(href, (opts?.locale as Locale | undefined) ?? current) as never, opts),
      back: () => router.back(),
      forward: () => router.forward(),
      refresh: () => router.refresh(),
    }),
    [router, current],
  );
}

