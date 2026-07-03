import { JwtService } from "@nestjs/jwt";
import { CompanyAuthService } from "../../src/modules/company-auth/services/company-auth.service";
import { prisma } from "./test-db";

let authSeq = 0;

/** Gerçek Prisma (test şeması) + mock Supabase/audit/email ile auth servisi. */
export function makeAuthService() {
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
    verifyPassword: jest.fn(async (email: string) => {
      const authId = byEmail.get(email.toLowerCase().trim());
      if (!authId) throw new Error("bad credentials");
      return { authId };
    }),
    updatePassword: jest.fn(async () => undefined),
  };
  const audit = { log: jest.fn(async () => undefined) };
  const email = { send: jest.fn(async () => ({ emailLogId: "x" })) };
  const jwt = new JwtService({
    secret: "test-secret",
    signOptions: { expiresIn: "1h" },
  });
  // 2FA secret şifrelemesi JWT_SECRET'tan anahtar türetir.
  const lookup = (key: string) =>
    key === "JWT_SECRET" ? "test-secret" : undefined;
  const config = {
    get: jest.fn(lookup),
    getOrThrow: jest.fn((key: string) => {
      const v = lookup(key);
      if (v === undefined) throw new Error(`config eksik: ${key}`);
      return v;
    }),
  };

  const service = new CompanyAuthService(
    prisma as never,
    jwt,
    supabaseAuth as never,
    audit as never,
    email as never,
    config as never,
  );
  return { service, supabaseAuth, audit, email, jwt };
}

/** signup sonrası e-posta mock'undan 6 haneli kodu ayıkla. */
export function extractCode(email: {
  send: jest.Mock;
}): string {
  const call = email.send.mock.calls.at(-1)?.[0] as {
    templateData: { data: { paragraphs: string[] } };
  };
  const joined = call.templateData.data.paragraphs.join(" ");
  const m = joined.match(/\b(\d{6})\b/);
  if (!m) throw new Error("Kod bulunamadı");
  return m[1];
}
