import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTION_LABELS } from "../audit-actions";
import { CRON_JOB_META, cronJobMeta } from "../cron-jobs";

/**
 * Zamanlanmış iş sözlüğü nöbetçisi. Sistem Sağlığı sayfası iş adını ve
 * zamanlamayı `CRON_JOB_META`'dan okur; haritada olmayan iş API'nin kendi
 * (çoğu İngilizce) metniyle görünür. Nöbetçi apps/api/src'deki
 * `cronRegistry.register("<anahtar>", …)` çağrılarını tarar: API'nin kaydettiği
 * her işin burada Türkçe adı olmalı, burada adı olan her iş de API'de kayıtlı
 * olmalı (silinen işin etiketi kalmasın).
 */
const API_SRC = join(__dirname, "..", "..", "..", "..", "api", "src");
const REGISTER = /cronRegistry\??\.register\(\s*"([A-Za-z]+\.[A-Za-z]+)"/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(name) && !/\.(spec|test)\.ts$/.test(name)) out.push(p);
  }
  return out;
}

function registeredJobs(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of walk(API_SRC)) {
    for (const m of readFileSync(file, "utf8").matchAll(REGISTER)) {
      if (!found.has(m[1]!)) found.set(m[1]!, relative(API_SRC, file));
    }
  }
  return found;
}

describe("cron job dictionary", () => {
  const jobs = registeredJobs();

  it("finds the API cron registrations (scanner sanity)", () => {
    expect(jobs.size).toBeGreaterThanOrEqual(20);
    for (const key of ["listing.closeExpired", "sessions.purgeRevoked", "signup.purgeUnverified"]) {
      expect(jobs.has(key), key).toBe(true);
    }
  });

  it("every job the API registers has a Turkish label and a schedule", () => {
    const missing = [...jobs].filter(([key]) => !(key in CRON_JOB_META)).map(([key, f]) => `${key} (${f})`);
    expect(missing).toEqual([]);
    for (const [key, meta] of Object.entries(CRON_JOB_META)) {
      expect(meta.label.trim(), key).not.toBe("");
      expect(meta.schedule.trim(), key).not.toBe("");
    }
  });

  it("no label is left behind for a job the API no longer registers", () => {
    expect(Object.keys(CRON_JOB_META).filter((key) => !jobs.has(key))).toEqual([]);
  });

  it("a job without a label falls back to the API text", () => {
    expect(cronJobMeta({ key: "x.y", label: "API label", schedule: "API schedule" })).toEqual({
      label: "API label",
      schedule: "API schedule",
    });
    expect(cronJobMeta({ key: "signup.purgeUnverified", label: "API label", schedule: "API schedule" })).toEqual(
      CRON_JOB_META["signup.purgeUnverified"],
    );
  });

  it("the unverified sign-up job and its audit label name the API's limit (one constant)", () => {
    const source = readFileSync(
      join(API_SRC, "modules", "company-auth", "services", "unverified-signup-cleanup.service.ts"),
      "utf8",
    );
    const days = /export const UNVERIFIED_SIGNUP_TTL_DAYS = (\d+);/.exec(source)?.[1];
    expect(days).toBeDefined();
    expect(CRON_JOB_META["signup.purgeUnverified"]!.label).toContain(`${days} gündür`);
    expect(ACTION_LABELS["company.signup_expired"]).toContain(`${days} gün`);
  });
});
