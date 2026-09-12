import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { QA, apiGet, apiSession } from "./staging-helpers";
import { companyGetEndpoints, tierOk } from "./role-endpoints";

/**
 * ROL MATRİSİ — her QA kullanıcısı × her `company*` GET ucu.
 *
 * Beklenti ELLE YAZILMAZ: API kaynağındaki `@RequireCompanyPermission` ve
 * `@RequireTier` okunur (`role-endpoints.ts`), `/company-auth/me` efektif
 * izinleri ve paketi verir. Kural: izni ya da paketi olmayan 403 almalı,
 * olan 403 ALMAMALI. Böylece hem AÇIK kapı (izinsiz 200) hem YANLIŞ KİLİT
 * (izinli 403) yakalanır. Sonuç tablosu docs/qa-role-matrix.md'ye yazılır.
 */
const USERS: Array<{ slug: string; email: string; not: string }> = [
  { slug: "alıcı · kurucu", email: QA.aliciKurucu, not: "SAHIP+SATIN_ALMACI+SATISCI, GOLD" },
  { slug: "alıcı · yönetici", email: QA.aliciYonetici, not: "YONETICI (yönetim, işlem izni yok)" },
  { slug: "alıcı · satın almacı", email: QA.aliciSatinalmaci, not: "SATIN_ALMACI" },
  { slug: "alıcı · satışçı", email: QA.aliciSatisci, not: "SATISCI (alıcı firmada)" },
  { slug: "alıcı · onaylayıcı", email: QA.aliciOnaylayici, not: "ONAYLAYICI (dar bağlam)" },
  { slug: "alıcı · görüntüleyici", email: QA.aliciGoruntuleyici, not: "salt okuma" },
  { slug: "tedarikçi · kurucu", email: QA.tedarikciKurucu, not: "SAHIP+…, SILVER" },
  { slug: "tedarikçi · satışçı", email: QA.tedarikciSatisci, not: "SATISCI" },
  { slug: "tedarikçi · görüntüleyici", email: QA.tedarikciGoruntuleyici, not: "salt okuma" },
  { slug: "tedarikçi2 · kurucu", email: QA.tedarikci2Kurucu, not: "ikinci tedarikçi, SILVER" },
  { slug: "ücretsiz · kurucu", email: QA.ucretsizKurucu, not: "STANDART, doğrulanmamış" },
];

const ENDPOINTS = companyGetEndpoints().filter((e) => e.path !== "company-auth/me");

/**
 * Bazı uçlarda TARAF query ile gelir: `action-center?portal=` verilmezse
 * varsayılan "buy" ve yalnız satış izni olan kullanıcı 403 alır. Web istemcisi
 * parametreyi HER ZAMAN gönderir (`use-company-dashboard.ts`), yani kullanıcıya
 * yansıyan bir kapı değil; sonda da doğru tarafı sormalı.
 */
function probeQuery(path: string, perms: string[]): string {
  if (path === "company/dashboard/action-center" && !perms.includes("buy:view") && perms.includes("sell:view"))
    return "?portal=satis";
  return "";
}
type Row = { user: string; tier: string; perms: string[]; results: Record<string, { status: number; ok: boolean }> };
const rows: Row[] = [];

// workers: 1 → testler sırayla koşar; afterAll hepsinden sonra dosyayı yazar.

for (const u of USERS) {
  test(`izin matrisi — ${u.slug}`, async () => {
    test.setTimeout(180_000);
    const s = await apiSession(u.email);
    const me = await apiGet(s, "/company-auth/me");
    expect(me.status, `${u.slug} /me`).toBe(200);
    const perms: string[] = me.body.user.permissions ?? [];
    const tier: string = me.body.company.tier;
    const isOwner: boolean = !!me.body.user.isOwner;

    const results: Row["results"] = {};
    const problems: string[] = [];
    // 6'lı kümeler: 62 uç × 11 kullanıcı tek tek gidince tur çok uzuyor.
    for (let i = 0; i < ENDPOINTS.length; i += 6) {
      const chunk = ENDPOINTS.slice(i, i + 6);
      await Promise.all(
        chunk.map(async (ep) => {
          const res = await apiGet(s, "/" + ep.path + probeQuery(ep.path, perms));
          // Sahip izinleri örtük: billing:manage vb. /me listesinde yok.
          const ownerImplicit = isOwner && ep.permissions.some((p) => p.startsWith("billing:") || p === "company:delete" || p === "ownership:transfer");
          const hasPerm = ep.permissions.length === 0 || ep.permissions.some((p) => perms.includes(p)) || ownerImplicit;
          const allowed = hasPerm && tierOk(tier, ep.tier);
          const forbidden = res.status === 403;
          results[ep.path] = { status: res.status, ok: allowed !== forbidden };
          if (allowed && forbidden) problems.push(`YANLIŞ KİLİT ${ep.path} → 403 (izin: ${ep.permissions.join("|") || "-"}, paket: ${ep.tier ?? "-"})`);
          if (!allowed && !forbidden) problems.push(`AÇIK KAPI ${ep.path} → ${res.status} (gereken izin: ${ep.permissions.join("|") || "-"}, paket: ${ep.tier ?? "-"})`);
        }),
      );
    }
    rows.push({ user: u.slug, tier, perms, results });
    // soft: bir rolde bulgu çıkınca kalan roller de taransın (matris tamamlansın).
    expect.soft(problems, `${u.slug}\n${problems.join("\n")}`).toEqual([]);
  });
}

test.afterAll(() => {
  const out = path.resolve(__dirname, "../../../docs/qa-role-matrix.md");
  mkdirSync(path.dirname(out), { recursive: true });
  const head = `| Uç (GET) | Gereken izin | Paket | ${rows.map((r) => r.user).join(" | ")} |`;
  const sep = `|---|---|---|${rows.map(() => "---").join("|")}|`;
  const body = ENDPOINTS.map((ep) => {
    const cells = rows.map((r) => {
      const v = r.results[ep.path];
      if (!v) return "?";
      return v.status === 403 ? "🔒" : v.status < 400 ? "✅" : `${v.status}`;
    });
    return `| \`${ep.path}\` | ${ep.permissions.join(" · ") || "—"} | ${ep.tier ?? "—"} | ${cells.join(" | ")} |`;
  }).join("\n");
  writeFileSync(
    out,
    `# Rol × yetki matrisi (staging, otomatik)\n\n` +
      `Üretim: \`pnpm --filter @rothern/web e2e:staging e2e/staging-role-matrix.spec.ts\`.\n` +
      `Beklentiler API kaynağından türetilir (\`@RequireCompanyPermission\`, \`@RequireTier\`);\n` +
      `bu tablo **çalışan staging'in gerçek yanıtıdır**. ✅ erişti · 🔒 403 · sayı = başka durum.\n\n` +
      rows.map((r) => `- **${r.user}** — paket ${r.tier}, izinler: ${r.perms.join(", ") || "—"}`).join("\n") +
      `\n\n${head}\n${sep}\n${body}\n`,
  );
  console.log(`rol matrisi yazıldı: ${out} (${rows.length}/${USERS.length} kullanıcı)`);
});
