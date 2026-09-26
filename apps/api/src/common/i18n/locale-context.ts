import { AsyncLocalStorage } from "node:async_hooks";
import { DEFAULT_LOCALE, isLocale, negotiateLocale, type Locale } from "@rothern/i18n";

/**
 * İstek dili — TEK KAYNAK (bkz. docs/plan-i18n.md).
 *
 * Sıra: (1) `Accept-Language` başlığı — web, kullanıcının seçtiği dili her isteğe
 * koyar; (2) kimlik doğrulandıktan sonra kullanıcının DB'deki dili (başlık
 * geçersiz/yoksa); (3) varsayılan `tr`. Bildirim ve e-posta bu bağlamı DEĞİL,
 * ALICININ kendi dilini kullanır (üretim anında `CompanyUser.locale`).
 */
interface LocaleStore {
  locale: Locale;
  /** Başlık desteklenen bir dil verdiyse true — DB dili onu EZMEZ. */
  explicit: boolean;
}

const als = new AsyncLocalStorage<LocaleStore>();

export function runWithLocale<T>(acceptLanguage: string | null | undefined, fn: () => T): T {
  return als.run(
    { locale: negotiateLocale(acceptLanguage), explicit: hasSupportedTag(acceptLanguage) },
    fn,
  );
}

function hasSupportedTag(acceptLanguage: string | null | undefined): boolean {
  if (!acceptLanguage) return false;
  return acceptLanguage
    .split(",")
    .map((p) => p.trim().split(";")[0]?.trim().toLowerCase().split(/[-_]/)[0])
    .some((tag) => isLocale(tag));
}

/** Bağlam dışı çağrı (cron, test) → varsayılan dil. */
export function currentLocale(): Locale {
  return als.getStore()?.locale ?? DEFAULT_LOCALE;
}

/**
 * Kimlik doğrulandıktan sonra kullanıcının kayıtlı dilini uygular — yalnız
 * başlık desteklenen bir dil vermediyse (başlık = kullanıcının o anki seçimi).
 */
export function applyUserLocale(userLocale: string | null | undefined): void {
  const store = als.getStore();
  if (!store || store.explicit) return;
  if (isLocale(userLocale)) store.locale = userLocale;
}
