import { AsyncLocalStorage } from "node:async_hooks";

/**
 * İstek-kapsamlı TENANT bağlamı — RLS plumbing'in temeli (INV-MT-5 Faz 1a).
 *
 * Bugün hiçbir sorgu bunu OKUMAZ (davranış değişmez); yalnız her isteğin
 * companyId'sini AsyncLocalStorage'a taşır ki sonraki fazlarda Prisma extension
 * `SET LOCAL app.current_company_id` için tek kaynaktan okuyabilsin.
 *
 * Desen (RxJS/await-güvenli): bir MIDDLEWARE her istekte MUTABLE bir store ile
 * `run()` açar (companyId başta null); guard'lardan SONRA çalışan bir
 * INTERCEPTOR `req.user.companyId`'yi store'a YAZAR (mutasyon — aynı async
 * context, referans paylaşımlı). Servis kodu `getCurrentCompanyId()` ile okur.
 * (Interceptor'ın als.run'ı yerine middleware+mutable-store: RxJS observable
 * subscription'ı als.run kapsamı dışına kaçmasın diye.)
 */

export interface TenantStore {
  /** Aktif firmanın id'si; auth'suz/pre-context isteklerde null. */
  companyId: string | null;
  /** Realm — ileride bypass kararları için (admin/company). Faz 1a'da yalnız taşınır. */
  realm: "company" | "admin" | null;
}

const als = new AsyncLocalStorage<TenantStore>();

/** Verilen store ile bir async bağlam açar (middleware kullanır). */
export function runWithTenantContext<T>(store: TenantStore, fn: () => T): T {
  return als.run(store, fn);
}

/** Aktif store (yoksa undefined — bağlam kurulmamış istek). */
export function getTenantStore(): TenantStore | undefined {
  return als.getStore();
}

/** Aktif firmanın id'si; bağlam yoksa/ayarlanmamışsa null. */
export function getCurrentCompanyId(): string | null {
  return als.getStore()?.companyId ?? null;
}

/**
 * Aktif bağlama companyId (+ realm) yazar. Bağlam yoksa SESSİZCE no-op
 * (interceptor auth'suz rotada da çalışabilir). Mutasyon: middleware'in açtığı
 * store referansını günceller.
 */
export function setTenantContext(
  companyId: string | null,
  realm: "company" | "admin" | null = "company",
): void {
  const store = als.getStore();
  if (store) {
    store.companyId = companyId;
    store.realm = realm;
  }
}
