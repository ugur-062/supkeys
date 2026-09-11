import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { seatPermissionsOf } from "@rothern/shared";

/**
 * İzin beklentilerini API KAYNAĞINDAN türetir (elle liste tutmak drift üretir).
 * Her `company*` controller'ındaki parametresiz GET ucu için gereken izinler
 * (`@RequireCompanyPermission`, dizi = any-of) ve paket kademesi
 * (`@RequireTier`, sınıf ya da metot düzeyinde) çıkarılır.
 */
export type Endpoint = { path: string; permissions: string[]; tier: string | null; source: string };

const API_MODULES = path.resolve(__dirname, "../../api/src/modules");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith(".controller.ts")) out.push(p);
  }
  return out;
}

/**
 * Dekoratörde sabit ADI geçebiliyor (`@RequireCompanyPermission(ALL_SEAT_PERMISSIONS)`
 * ya da dizi içinde `...ALL_SEAT_PERMISSIONS`) — düz metin dizeleri yetmez,
 * bu sabitler shared katalogdan çözülür.
 */
const CONSTANTS: Record<string, string[]> = {
  ALL_SEAT_PERMISSIONS: [...seatPermissionsOf("buy"), ...seatPermissionsOf("sell")],
  BUY_SEAT_PERMISSIONS: [...seatPermissionsOf("buy")],
  SELL_SEAT_PERMISSIONS: [...seatPermissionsOf("sell")],
  REPORTS_PERMISSION: ["buy:reports:view"],
};

/** Yorumlar eşleşmeye karışmasın: "CompanyPaidTierGuard KULLANILMIYOR" yazan
 *  bir açıklama, guard varmış gibi okunuyordu. */
const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const permsFrom = (source: string): string[] => {
  const block = stripComments(source);
  const m = block.match(/@RequireCompanyPermission\(\s*(\[[\s\S]*?\]|"[^"]*"|[A-Z_]+)\s*\)/);
  if (!m) return [];
  const arg = m[1]!;
  const out = [...arg.matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
  for (const [name, vals] of Object.entries(CONSTANTS)) {
    if (new RegExp(`\\b${name}\\b`).test(arg)) out.push(...vals);
  }
  return [...new Set(out)];
};

const tierFrom = (source: string): string | null => {
  const block = stripComments(source);
  const m = block.match(/@RequireTier\(\s*"([A-Z]+)"/);
  if (m) return m[1]!;
  // `CompanyPaidTierGuard` @RequireTier'sız kullanılırsa VARSAYILAN SILVER.
  if (/@UseGuards\([^)]*CompanyPaidTierGuard/.test(block)) return "SILVER";
  return null;
};

export function companyGetEndpoints(): Endpoint[] {
  const out: Endpoint[] = [];
  for (const file of walk(API_MODULES)) {
    const src = readFileSync(file, "utf8");
    const ctrl = src.match(/@Controller\(\s*"([^"]+)"\s*\)/);
    if (!ctrl) continue;
    const base = ctrl[1]!;
    if (!base.startsWith("company")) continue;
    // Sınıf düzeyi: @Controller ile "export class" arasındaki dekoratörler.
    // Sınıf başlığı: dekoratörler @Controller'dan ÖNCE de yazılabiliyor →
    // "export class"tan geriye doğru dekoratör bloğunun tamamını al.
    const clsIdx = src.indexOf("export class", ctrl.index!);
    const headStart = Math.max(0, src.lastIndexOf("\n\n", ctrl.index!));
    const classHead = src.slice(headStart, clsIdx);
    const classPerms = permsFrom(classHead);
    const classTier = tierFrom(classHead);

    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const g = lines[i]!.match(/^\s*@Get\(\s*(?:"([^"]*)")?\s*\)/);
      if (!g) continue;
      const sub = g[1] ?? "";
      // Dekoratör bloğu: @Get satırından metot imzasına kadar.
      let block = "";
      for (let j = i; j < Math.min(i + 14, lines.length); j++) {
        block += lines[j] + "\n";
        if (/^\s*(?:async\s+)?[A-Za-z_$][\w$]*\s*\(/.test(lines[j]!) && !lines[j]!.trim().startsWith("@")) break;
      }
      const perms = permsFrom(block);
      const tier = tierFrom(block);
      const full = sub ? `${base}/${sub}` : base;
      if (full.includes(":")) continue; // parametreli uç — atla
      out.push({
        path: full,
        permissions: perms.length > 0 ? perms : classPerms,
        tier: tier ?? classTier ?? SERVICE_TIER_GATES[full] ?? null,
        source: path.relative(API_MODULES, file),
      });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Kademe kapısı GUARD'da değil SERVİSTE olan uçlar (dekoratörden okunamaz):
 * İş Analizi Silver+ (`company-views.service.ts` `tierAtLeast`). Kapıyı
 * servise taşımak bilinçli — sayılar herkese açık, kimlikli liste paketli.
 */
export const SERVICE_TIER_GATES: Record<string, string> = {
  "company/views/insights": "SILVER",
};

const TIER_ORDER = ["STANDART", "SILVER", "GOLD"];
export const tierOk = (have: string, need: string | null) =>
  !need || TIER_ORDER.indexOf(have) >= TIER_ORDER.indexOf(need);
