/**
 * DRIFT NÖBETÇİSİ — "izinsiz company ucu KALAMAZ" (yetki tablosu, 2026-09-05).
 *
 * `company*` (ve `notifications`) prefix'li her controller handler'ı ya statik
 * bir `@RequireCompanyPermission` taşır (handler ya da sınıf düzeyinde) ya da
 * gerekçesiyle aşağıdaki allowlist'tedir. Ayrıca dekoratörü taşıyan sınıfta
 * `CompanyPermissionsGuard` mount edilmiş olmalı — yoksa dekoratör sessiz
 * no-op'tur (denetim bulgusu: mesajlar controller'ında olduğu gibi).
 *
 * Bu test, denetimde (2026-09-05) bulunan "yalnız giriş isteyen 45 uç"
 * sınıfının geri gelmesini yapısal olarak engeller: yeni bir handler eklenip
 * izin unutulursa test kırılır.
 */
import "reflect-metadata";
import * as fs from "node:fs";
import * as path from "node:path";
import { ALL_KNOWN_PERMISSIONS } from "@rothern/shared";
import { COMPANY_PERMISSION_KEY } from "../../src/modules/company-auth/decorators/require-company-permission.decorator";
import { CompanyPermissionsGuard } from "../../src/modules/company-auth/guards/company-permissions.guard";

/** Nest metadata anahtarları (@nestjs/common/constants). */
const PATH_METADATA = "path";
const METHOD_METADATA = "method";
const GUARDS_METADATA = "__guards__";

/** Sınıf adı → gerekçe. Buraya eklemek BİLİNÇLİ bir karardır; gerekçesiz satır yok. */
const ALLOWLIST: Record<string, string> = {
  CompanyAuthController:
    "kimlik/oturum uçları — kişinin KENDİ hesabı (me, onboarding, parola, 2FA, bildirim tercihi); yetki tablosu kapsamı dışı",
  NotificationController:
    "kişinin KENDİ bildirim satırları (companyUserId ile sınırlı); içerik süzgeci Faz 2",
  CompanyInvitationsController:
    "davet önizleme/kabul — token ile ANONİM (oturum yok, guard yok)",
};

const MODULES_DIR = path.join(__dirname, "../../src/modules");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".controller.ts")) out.push(full);
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctor = { new (...args: any[]): unknown; prototype: any; name: string };

interface Handler {
  controller: string;
  method: string;
  prefix: string;
  permission: unknown;
  guardsOk: boolean;
}

function collect(): Handler[] {
  const handlers: Handler[] = [];
  for (const file of walk(MODULES_DIR)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file) as Record<string, unknown>;
    for (const exported of Object.values(mod)) {
      if (typeof exported !== "function") continue;
      const cls = exported as Ctor;
      const prefixRaw = Reflect.getMetadata(PATH_METADATA, cls) as
        | string
        | string[]
        | undefined;
      if (prefixRaw === undefined) continue;
      const prefixes = Array.isArray(prefixRaw) ? prefixRaw : [prefixRaw];
      const prefix = prefixes[0] ?? "";
      const inScope = prefixes.some(
        (p) => p.startsWith("company") || p === "notifications",
      );
      if (!inScope) continue;
      const classPerm = Reflect.getMetadata(COMPANY_PERMISSION_KEY, cls);
      const classGuards = (Reflect.getMetadata(GUARDS_METADATA, cls) ??
        []) as unknown[];
      for (const name of Object.getOwnPropertyNames(cls.prototype)) {
        if (name === "constructor") continue;
        const fn = cls.prototype[name];
        if (typeof fn !== "function") continue;
        if (Reflect.getMetadata(METHOD_METADATA, fn) === undefined) continue;
        const perm = Reflect.getMetadata(COMPANY_PERMISSION_KEY, fn) ?? classPerm;
        const methodGuards = (Reflect.getMetadata(GUARDS_METADATA, fn) ??
          []) as unknown[];
        const guardsOk = [...classGuards, ...methodGuards].includes(
          CompanyPermissionsGuard,
        );
        handlers.push({ controller: cls.name, method: name, prefix, permission: perm, guardsOk });
      }
    }
  }
  return handlers;
}

describe("company izin DRIFT NÖBETÇİSİ — izinsiz uç kalamaz", () => {
  const handlers = collect();

  it("company controller'ları bulundu (tarama boş değil)", () => {
    expect(handlers.length).toBeGreaterThan(150);
  });

  it("allowlist yalnız var olan sınıfları adlandırır (bayat satır yok)", () => {
    const names = new Set(handlers.map((h) => h.controller));
    for (const name of Object.keys(ALLOWLIST)) {
      expect(names.has(name)).toBe(true);
    }
  });

  const gated = handlers.filter((h) => !(h.controller in ALLOWLIST));
  for (const h of gated) {
    it(`${h.controller}.${h.method} (/${h.prefix}) statik izin bildirir ve guard mount edilmiş`, () => {
      expect(h.permission).toBeDefined();
      const keys = Array.isArray(h.permission)
        ? (h.permission as string[])
        : [h.permission as string];
      expect(keys.length).toBeGreaterThan(0);
      for (const k of keys) {
        expect(ALL_KNOWN_PERMISSIONS).toContain(k);
      }
      expect(h.guardsOk).toBe(true);
    });
  }

  it("allowlist'teki sınıflar izin bildirmez (kapsam dışı olduğu belgelenmiş)", () => {
    for (const h of handlers.filter((x) => x.controller in ALLOWLIST)) {
      expect(h.permission).toBeUndefined();
    }
  });
});
