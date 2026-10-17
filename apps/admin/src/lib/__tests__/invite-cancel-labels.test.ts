import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { INVITE_CANCEL_LABEL, inviteCancelLabel } from "../invite-cancel-labels";

/**
 * Davet iptal nedeni sözlüğü nöbetçisi. Büyüme sayfasının "İptal nedenleri"
 * tablosu nedeni `INVITE_CANCEL_LABEL`'dan okur; haritada olmayan neden ham
 * kodla görünür (AUTO_INVITE_OFF, ALLOWLIST ve INVITER_DOWNGRADED böyle
 * basılıyordu). Nöbetçi apps/api/src'yi tarar: API'nin bir davet satırına
 * yazabildiği her nedenin burada Türkçe etiketi olmalı.
 *
 * Neden üç biçimde yazılır:
 *  1. `cancelReason: "KOD"` — sabit dize (talep/sipariş iptal GEREKÇESİ serbest
 *     metindir ve böyle yazılmaz; yalnız BÜYÜK_HARF kodlar davet nedenidir);
 *  2. `SABİT_REASON = "KOD"` — davet politikası dosyasındaki adlandırılmış sabit
 *     (`AUTO_INVITE_OFF_REASON`);
 *  3. dağıtıcının `this.cancel(ids, "KOD")` çağrıları ve gönderim sonucunun
 *     aynen neden olarak yazıldığı dal (`sent === "SUPPRESSED" || sent === "ALLOWLIST"`).
 */
const API_SRC = join(__dirname, "..", "..", "..", "..", "api", "src");
const DISPATCHER = "modules/company-connections/services/external-invite-dispatcher.service.ts";
const POLICY = "common/company/external-invite-policy.ts";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(name) && !/\.(spec|test)\.ts$/.test(name)) out.push(p);
  }
  return out;
}

function writtenReasons(): Map<string, string> {
  const found = new Map<string, string>();
  const add = (code: string, file: string) => {
    if (!found.has(code)) found.set(code, file);
  };
  for (const file of walk(API_SRC)) {
    const rel = relative(API_SRC, file).split("\\").join("/");
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/\bcancelReason:\s*"([A-Z][A-Z_]+)"/g)) add(m[1]!, rel);
    if (rel === POLICY) {
      for (const m of src.matchAll(/\b[A-Z_]+_REASON\s*=\s*"([A-Z][A-Z_]+)"/g)) add(m[1]!, rel);
    }
    if (rel === DISPATCHER) {
      for (const m of src.matchAll(/this\.cancel\(\s*[^;]*?,\s*"([A-Z][A-Z_]+)"\s*\)/g)) add(m[1]!, rel);
      // Gönderim sonucu aynen neden olur: `this.cancel(batch…, sent)`.
      const branch = src.match(/else if \(([^)]*)\) \{[^}]*this\.cancel\([^;]*,\s*sent\)/)?.[1] ?? "";
      for (const m of branch.matchAll(/sent === "([A-Z][A-Z_]+)"/g)) add(m[1]!, rel);
    }
  }
  return found;
}

describe("invite cancel reason dictionary", () => {
  const reasons = writtenReasons();

  it("finds the reasons the API writes (scanner sanity)", () => {
    // Her biçimden en az bir örnek: tarama sessizce boş dönmesin.
    for (const code of [
      "LISTING_CLOSED", // cancelReason: "…" (dağıtıcı)
      "REFERRAL_CANCELLED", // cancelReason: "…" (bağlantı iptali)
      "INVITER_DOWNGRADED", // cancelReason: "…" (yetki düşüşü)
      "AUTO_INVITE_OFF", // adlandırılmış sabit
      "OPTED_OUT", // this.cancel(…, "…")
      "FREQUENCY",
      "ALLOWLIST", // gönderim sonucu
      "SUPPRESSED",
    ]) {
      expect(reasons.has(code), code).toBe(true);
    }
    expect(reasons.size).toBeGreaterThanOrEqual(11);
  });

  it("every reason the API can write has a Turkish label", () => {
    const missing = [...reasons].filter(([code]) => !(code in INVITE_CANCEL_LABEL)).map(([code, f]) => `${code} (${f})`);
    expect(missing).toEqual([]);
    for (const [code, label] of Object.entries(INVITE_CANCEL_LABEL)) {
      expect(label.trim(), code).not.toBe("");
      // Etiket okunur bir cümledir, ham kod değil.
      expect(label, code).not.toMatch(/^[A-Z_]+$/);
    }
  });

  it("no label is left behind for a reason the API no longer writes", () => {
    // `OTHER`: nedeni boş satırlar için rapor ucunun yazdığı anahtar.
    const stale = Object.keys(INVITE_CANCEL_LABEL).filter((code) => code !== "OTHER" && !reasons.has(code));
    expect(stale).toEqual([]);
  });

  it("labels the three reasons that used to be printed as raw codes", () => {
    expect(inviteCancelLabel("AUTO_INVITE_OFF")).toBe("Talep özele çevrildi ya da otomatik arama kapatıldı");
    expect(inviteCancelLabel("ALLOWLIST")).toBe("Bu ortamda gönderilmedi (alıcı izin listesi)");
    expect(inviteCancelLabel("INVITER_DOWNGRADED")).toBe("Davet eden firmanın davet yetkisi kalktı");
    // Bilinmeyen kod olduğu gibi döner (sayfa boş hücre çizmez).
    expect(inviteCancelLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });
});
