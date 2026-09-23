import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Dil farkında gezinme — `next/link` ve `next/navigation` yerine BUNLAR
 * kullanılır: `Link` ve `useRouter` bağlantıya aktif dilin ön ekini ekler,
 * `usePathname` ön eksiz yol döner (`/company/login` karşılaştırmaları
 * değişmeden çalışır). Testlerde `vitest.setup.ts` bunları Next'in kendi
 * hook'larına geçiren sahteyle değiştirir.
 *
 * `redirect`/`permanentRedirect` AÇIK tip taşır: TypeScript `never` dönen
 * fonksiyonla akış daraltmasını yalnız açık tip açıklaması olan bildirimlerde
 * yapar (destructuring'de yapmaz) — aksi hâlde `if (x.kind === "redirect")
 * permanentRedirect(...)` sonrası `x` daralmazdı.
 */
const nav = createNavigation(routing);

export const Link = nav.Link;
export const usePathname = nav.usePathname;
export const useRouter = nav.useRouter;
export const getPathname = nav.getPathname;
export const redirect: (...args: Parameters<typeof nav.redirect>) => never = nav.redirect;
export const permanentRedirect: (...args: Parameters<typeof nav.permanentRedirect>) => never =
  nav.permanentRedirect;
