import { Prisma } from "@rothern/db";
import { getTenantStore } from "../tenant/tenant-context";

/**
 * RLS Prisma extension (INV-MT-5 Faz 1b) — her model operasyonunu, tenant
 * bağlamı varsa, `SET LOCAL app.current_company_id` ile AYNI transaction'a
 * sarar (Prisma resmi RLS deseni). 6543 transaction pooler'da GUC ile sorgu
 * aynı backend'e düşsün diye ŞART: standalone sorgu + ayrı set_config farklı
 * backend'e düşer → bağlam kaybolur (bkz. docs/rls-plan.md).
 *
 * DEFAULT KAPALI: `RLS_ENABLED !== "true"` → tam passthrough (davranış değişmez).
 * Bağlam KURALLARI (flag açıkken):
 *  - bağlam yok (pre-context/system) VEYA realm !== "company" → passthrough (bypass).
 *  - realm "company" + companyId → set_config'li tx'e sar.
 *  - realm "company" + companyId YOK → FIRLAT (fail-closed; sessiz-boş DEĞİL —
 *    RLS NULL bağlamda hiçbir satır eşlemez, "veri kayboldu" gibi görünürdü).
 *  - inTx (runTenantTx zaten set_config yaptı, Faz 1c) → passthrough.
 */

export const RLS_GUC = "app.current_company_id";

/** `RLS_ENABLED=true` mi? (env verilmezse process.env). Saf, test edilebilir. */
export function isRlsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RLS_ENABLED === "true";
}

/** RLS tx-sarma çekirdeği — test için client mock'lanabilir. */
export async function runWithRls<T>(
  client: {
    $transaction: (ops: unknown[]) => Promise<unknown[]>;
    $executeRaw: (q: TemplateStringsArray, ...v: unknown[]) => unknown;
  },
  run: () => T,
  env: NodeJS.ProcessEnv = process.env,
): Promise<T> {
  if (!isRlsEnabled(env)) return run();

  const store = getTenantStore();
  // Bypass: bağlam yok / admin / sistem realm → RLS uygulanmaz (owner-yol).
  if (!store || store.realm !== "company") return run();

  if (!store.companyId) {
    throw new Error(
      "RLS: company-realm sorgusu tenant bağlamı (companyId) OLMADAN çalıştırılamaz — fail-closed (sessiz-boş yerine).",
    );
  }

  if (store.inTx) return run(); // set_config zaten yapıldı (runTenantTx)

  const companyId = store.companyId;
  const [, result] = await client.$transaction([
    client.$executeRaw`SELECT set_config(${RLS_GUC}, ${companyId}, true)` as unknown,
    run() as unknown,
  ]);
  return result as T;
}

/**
 * `baseClient.$extends(createRlsExtension())` ile uygulanır (Faz 1c wiring).
 * Yalnız model op'larını kapsar; raw `$queryRaw`/`$executeRaw` extension'ı
 * BAYPAS eder → onlar `runTenantTx` içine alınır (Faz 1c).
 */
export function createRlsExtension() {
  return Prisma.defineExtension((client) =>
    client.$extends({
      name: "rls-tenant-context",
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            return runWithRls(
              client as never,
              () => query(args) as never,
            );
          },
        },
      },
    }),
  );
}
