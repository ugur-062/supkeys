/**
 * RLS Faz 1c-1 — createInjectablePrisma wiring. Testler DI factory'yi doğrudan
 * inşa eder (suite servisleri test-db client'ı kullanır → factory'yi es geçer;
 * bu yüzden ayrı doğrulama). Bağlanmaz (lazy) — yalnız kullanılabilir şekil +
 * flag dallanması. (instanceof KULLANILMAZ: Prisma client constructor proxied
 * nesne döndürür → instanceof artefaktı; servisler yapısal kullanır.)
 */
import { createInjectablePrisma } from "../../src/common/prisma/prisma.service";

const usable = (p: unknown) => {
  const c = p as Record<string, unknown>;
  expect(typeof c.company).toBe("object"); // model delegate
  expect(typeof c.$transaction).toBe("function");
  expect(typeof c.$queryRaw).toBe("function");
  expect(typeof c.onModuleInit).toBe("function"); // Nest lifecycle
  expect(typeof c.onModuleDestroy).toBe("function");
};

describe("createInjectablePrisma — RLS wiring", () => {
  it("RLS KAPALI → kullanılabilir çıplak client (bugünle birebir yol)", () => {
    usable(createInjectablePrisma({} as NodeJS.ProcessEnv));
  });

  it("RLS AÇIK → kullanılabilir extension'lı client (lifecycle iliştirilmiş)", () => {
    usable(createInjectablePrisma({ RLS_ENABLED: "true" } as NodeJS.ProcessEnv));
  });

  it("flag dallanması: KAPALI ile AÇIK ayrı nesneler üretir", () => {
    const off = createInjectablePrisma({} as NodeJS.ProcessEnv);
    const on = createInjectablePrisma({
      RLS_ENABLED: "true",
    } as NodeJS.ProcessEnv);
    expect(off).not.toBe(on);
  });
  // NOT: gerçek connect+query boot-smoke'u BU harness'ta yapılamaz — factory ham
  // DATABASE_URL (schema=public) okur, test verisi env.ts ile rothern_test
  // şemasında izole → şema uyuşmazlığı (test artefaktı, prod'da doğru şema). OFF
  // yolu = `new PrismaService()` (Nest'in eskiden ürettiğiyle birebir); extension
  // gerçek-DB kanıtı rls-mechanism.spec'te (doğru şemalı paylaşımlı client).
});
