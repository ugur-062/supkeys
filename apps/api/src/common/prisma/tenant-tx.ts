import { Prisma } from "@rothern/db";
import { getTenantStore } from "../tenant/tenant-context";
import { isRlsEnabled, RLS_GUC } from "./rls-extension";

/**
 * Tenant-farkında interactive transaction (INV-MT-5 Faz 1c-2). `this.prisma.
 * $transaction(async tx => …)` yerine kullanılır.
 *
 * - RLS KAPALI / bağlam yok / admin realm → DÜZ `$transaction` (bugünkü davranış,
 *   birebir). Yani migrasyon flag OFF iken davranışı DEĞİŞTİRMEZ.
 * - RLS AÇIK + company + companyId → tx'in İLK ifadesi `set_config(GUC,…,true)`
 *   + ALS `inTx=true` → tx İÇİNDEKİ op'lar RLS extension'a girince TEKRAR
 *   sarılmaz (nested-tx önlemi); GUC tx boyunca geçerli (aynı bağlantı).
 *
 * Neden şart: extension standalone op'u kendi tx'ine sarar; ama interactive tx
 * İÇİNDEKİ op da extension'a girer → düz `$transaction`'da (inTx yok) nested
 * `$transaction` denenirdi → hata. runTenantTx bunu tek set_config + inTx ile çözer.
 */

type TxOptions = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

interface TxCapable {
  $transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: TxOptions,
  ): Promise<T>;
}

export async function runTenantTx<T>(
  prisma: TxCapable,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: TxOptions,
  env: NodeJS.ProcessEnv = process.env,
): Promise<T> {
  const store = getTenantStore();
  if (
    !isRlsEnabled(env) ||
    !store ||
    store.realm !== "company" ||
    !store.companyId
  ) {
    return prisma.$transaction(fn, options);
  }

  const companyId = store.companyId;
  const prevInTx = store.inTx;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config(${RLS_GUC}, ${companyId}, true)`;
    store.inTx = true;
    try {
      return await fn(tx);
    } finally {
      store.inTx = prevInTx;
    }
  }, options);
}
