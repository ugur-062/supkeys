import { JwtService } from "@nestjs/jwt";
import { CompanyAuthService } from "../../src/modules/company-auth/services/company-auth.service";
import { UnverifiedSignupCleanupService } from "../../src/modules/company-auth/services/unverified-signup-cleanup.service";
import { prisma } from "./test-db";

let authSeq = 0;

/** Gerçek Prisma (test şeması) + mock Supabase/audit/email ile auth servisi.
 *  `env` ek config anahtarlarını (ör. PREMIUM_SELF_UPGRADE_ENABLED) override eder. */
export function makeAuthService(env: Record<string, string> = {}) {
  // E-posta → authId eşlemesi (gerçek Supabase yerine): createUser kaydeder,
  // verifyPassword aynı authId'yi döndürür (login authId ile kullanıcı bulur).
  const byEmail = new Map<string, string>();
  const supabaseAuth = {
    createUser: jest.fn(async (email: string) => {
      const authId = `auth-${authSeq++}`;
      byEmail.set(email.toLowerCase().trim(), authId);
      return { authId };
    }),
    deleteUser: jest.fn(async () => undefined),
    // Reports its result (removal of an expired unverified sign-up).
    deleteUserStrict: jest.fn(async (authId: string) => {
      for (const [e, id] of byEmail) if (id === authId) byEmail.delete(e);
    }),
    verifyPassword: jest.fn(async (email: string) => {
      const authId = byEmail.get(email.toLowerCase().trim());
      if (!authId) throw new Error("bad credentials");
      return { authId };
    }),
    updatePassword: jest.fn(async () => undefined),
    updateEmail: jest.fn(async (authId: string, newEmail: string) => {
      for (const [e, id] of byEmail) if (id === authId) byEmail.delete(e);
      byEmail.set(newEmail.toLowerCase().trim(), authId);
    }),
  };
  const audit = { log: jest.fn(async () => undefined) };
  const email = { send: jest.fn(async () => ({ emailLogId: "x", sent: true })) };
  const jwt = new JwtService({
    secret: "test-secret",
    signOptions: { expiresIn: "1h" },
  });
  // 2FA secret şifrelemesi JWT_SECRET'tan anahtar türetir.
  const lookup = (key: string) =>
    key === "JWT_SECRET" ? "test-secret" : env[key];
  const config = {
    get: jest.fn(lookup),
    getOrThrow: jest.fn((key: string) => {
      const v = lookup(key);
      if (v === undefined) throw new Error(`config eksik: ${key}`);
      return v;
    }),
  };

  // Real service, like in the module (the parameter is @Optional only for
  // older hand-built rigs): sign-up for an address held by an expired
  // unverified sign-up removes that sign-up first. The removal is switched on
  // here as it is on the deployed services (NODE_ENV=production); under jest
  // (NODE_ENV=test) it would be off. A spec that needs it off passes
  // `{ UNVERIFIED_SIGNUP_PURGE_ENABLED: "false" }`.
  const unverifiedSignups = new UnverifiedSignupCleanupService(
    prisma as never,
    supabaseAuth as never,
    audit as never,
    {
      get: (key: string) =>
        key === "UNVERIFIED_SIGNUP_PURGE_ENABLED" ? (env[key] ?? "true") : lookup(key),
    } as never,
  );
  const service = new CompanyAuthService(
    prisma as never,
    jwt,
    supabaseAuth as never,
    audit as never,
    email as never,
    config as never,
    prisma as never, // bypass client — testte owner test-db prisma (RLS yok)
    unverifiedSignups,
  );
  return { service, supabaseAuth, audit, email, jwt, unverifiedSignups };
}

/**
 * signup sonrası e-posta mock'undan 6 haneli kodu ayıkla. Kod 2026-10-04'ten
 * beri paragrafta değil ayrı `code` alanında (şablon kod bloğunda basar);
 * eski yük biçimi için paragraflara da bakılır.
 */
export function extractCode(email: {
  send: jest.Mock;
}): string {
  const call = email.send.mock.calls.at(-1)?.[0] as {
    templateData: { data: { paragraphs: string[]; code?: { value: string } } };
  };
  const direct = call.templateData.data.code?.value;
  if (direct && /^\d{6}$/.test(direct)) return direct;
  const joined = call.templateData.data.paragraphs.join(" ");
  const m = joined.match(/\b(\d{6})\b/);
  if (!m) throw new Error("Kod bulunamadı");
  return m[1];
}
