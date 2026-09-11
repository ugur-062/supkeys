import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { QA, apiGet, apiSession, gotoRetry, uiLogin } from "./staging-helpers";

/**
 * ROL × EKRAN MATRİSİ — her rol tarayıcıda gezer, her sayfa dört durumdan
 * birine düşer:
 *   ok           → sayfa açıldı (h1 var)
 *   yetki        → PermissionGate ("Bu sayfa yetki gerektirir")
 *   portal       → PortalGuard ("… paneline erişim yetkiniz yok")
 *   paket        → PremiumGate ("Satınalma paneli (Gold)")
 * Beklenti izin modelinden türetilir; sapma = bulgu. Tablo
 * docs/qa-role-matrix.md'nin altına eklenir.
 */
type State = "ok" | "yetki" | "portal" | "paket" | "hata";

const ROUTES: Array<{ path: string; needs: string[]; portal?: "buy" | "sell"; tier?: "SILVER" | "GOLD" }> = [
  { path: "/company/satinalma", needs: ["buy:view"], portal: "buy" },
  { path: "/company/satinalma/taleplerim", needs: ["buy:view"], portal: "buy" },
  { path: "/company/satinalma/taleplerim/yeni", needs: ["buy:listing:manage"], portal: "buy" },
  { path: "/company/satinalma/siparisler", needs: ["buy:view"], portal: "buy" },
  { path: "/company/satinalma/tedarikcilerim", needs: ["connections:manage", "buy:view", "sell:view"], portal: "buy" },
  { path: "/company/satinalma/bilgi-taleplerim", needs: ["buy:view"], portal: "buy" },
  { path: "/company/satinalma/urunler", needs: ["buy:view"], portal: "buy" },
  { path: "/company/satis", needs: ["sell:view"], portal: "sell" },
  { path: "/company/satis/urunlerim", needs: ["sell:view"], portal: "sell" },
  { path: "/company/satis/bilgi-talepleri", needs: ["sell:view"], portal: "sell" },
  { path: "/company/satis/musterilerim", needs: ["connections:manage", "buy:view", "sell:view"], portal: "sell" },
  { path: "/company/satis/tekliflerim", needs: ["sell:view"], portal: "sell" },
  { path: "/company/onaylar", needs: ["approval:act", "approvals:manage"] },
  { path: "/company/mesajlar", needs: ["buy:view", "sell:view"] },
  { path: "/company/ayarlar", needs: [] },
  { path: "/company/ayarlar/firma", needs: ["company:manage"] },
  { path: "/company/ayarlar/kullanicilar", needs: ["users:manage"] },
  { path: "/company/ayarlar/adresler", needs: ["addresses:manage"] },
  { path: "/company/ayarlar/banka-hesaplari", needs: ["billing:manage"] },
  { path: "/company/ayarlar/dogrulama", needs: ["company:manage"] },
  // Aktivite kaydı Silver+ (CompanyPaidTierGuard varsayılanı).
  { path: "/company/ayarlar/aktivite", needs: ["users:manage", "company:manage"], tier: "SILVER" },
  { path: "/company/sirketim", needs: ["users:manage", "company:manage", "buy:view", "sell:view"] },
  { path: "/company/sirketim/ziyaretciler", needs: ["insights:view"] },
];

const USERS = [
  { slug: "alıcı · kurucu", email: QA.aliciKurucu },
  { slug: "alıcı · yönetici", email: QA.aliciYonetici },
  { slug: "alıcı · satın almacı", email: QA.aliciSatinalmaci },
  { slug: "alıcı · satışçı", email: QA.aliciSatisci },
  { slug: "alıcı · onaylayıcı", email: QA.aliciOnaylayici },
  { slug: "alıcı · görüntüleyici", email: QA.aliciGoruntuleyici },
  { slug: "tedarikçi · satışçı", email: QA.tedarikciSatisci },
  { slug: "ücretsiz · kurucu", email: QA.ucretsizKurucu },
];

const rows: Array<{ user: string; states: Record<string, State> }> = [];

async function classify(page: Page): Promise<State> {
  await page.waitForLoadState("networkidle").catch(() => {});
  const body = await page.locator("body").innerText().catch(() => "");
  if (/Satınalma paneli \(Gold\)|Raporlar ve şablonlar \(Gold\)/.test(body)) return "paket";
  if (/paneline erişim yetkiniz yok/.test(body)) return "portal";
  // PermissionGate başlığı sayfaya göre değişebiliyor ("Banka Hesapları yalnız
  // Kurucuya açık") → metne değil, kapının role="status" kabuğuna bak.
  if ((await page.locator('div[role="status"] h2').count()) > 0) return "yetki";
  if ((await page.getByRole("heading", { level: 1 }).count()) > 0) return "ok";
  return "hata";
}

for (const u of USERS) {
  test(`ekran matrisi — ${u.slug}`, async ({ page }) => {
    test.setTimeout(300_000);
    const s = await apiSession(u.email);
    const me = await apiGet(s, "/company-auth/me");
    const perms: string[] = me.body.user.permissions ?? [];
    const isOwner: boolean = !!me.body.user.isOwner;
    const tier: string = me.body.company.tier;
    const has = (k: string) => perms.includes(k) || (isOwner && ["billing:manage", "company:delete", "ownership:transfer"].includes(k));

    await uiLogin(page, u.email);
    const states: Record<string, State> = {};
    const problems: string[] = [];
    for (const r of ROUTES) {
      await gotoRetry(page, r.path);
      const state = await classify(page);
      states[r.path] = state;

      // PortalGuard sırası: paket kapısı YALNIZ izni olup kademesi yetmeyene
      // çıkar; izni olmayan her durumda portal kapısı görür.
      const portalOk = !r.portal || (r.portal === "buy" ? has("buy:view") : has("sell:view"));
      const premiumLocked = r.portal === "buy" && has("buy:view") && tier !== "GOLD";
      const routeTierOk = !r.tier || (r.tier === "SILVER" ? tier !== "STANDART" : tier === "GOLD");
      const permOk = r.needs.length === 0 || r.needs.some(has);
      const expected: State = premiumLocked
        ? "paket"
        : !portalOk
          ? "portal"
          : !permOk
            ? "yetki"
            : routeTierOk
              ? "ok"
              : "paket";
      if (state !== expected) problems.push(`${r.path}: beklenen "${expected}", gelen "${state}"`);
    }
    rows.push({ user: u.slug, states });
    expect.soft(problems, `${u.slug}\n${problems.join("\n")}`).toEqual([]);
  });
}

test.afterAll(() => {
  const out = path.resolve(__dirname, "../../../docs/qa-role-screens.md");
  mkdirSync(path.dirname(out), { recursive: true });
  const head = `| Sayfa | ${rows.map((r) => r.user).join(" | ")} |`;
  const sep = `|---|${rows.map(() => "---").join("|")}|`;
  const icon = (s?: State) => (s === "ok" ? "✅" : s === "yetki" ? "🔒 yetki" : s === "portal" ? "⛔ portal" : s === "paket" ? "💳 paket" : "?");
  const body = ROUTES.map((r) => `| \`${r.path}\` | ${rows.map((x) => icon(x.states[r.path])).join(" | ")} |`).join("\n");
  writeFileSync(
    out,
    `# Rol × ekran matrisi (staging, otomatik)\n\n` +
      `\`pnpm --filter @rothern/web e2e:staging e2e/staging-role-screens.spec.ts\`\n\n` +
      `✅ sayfa açıldı · 🔒 yetki uyarısı (PermissionGate) · ⛔ portal kapısı · 💳 paket kapısı (Gold).\n\n` +
      `${head}\n${sep}\n${body}\n`,
  );
  console.log(`ekran matrisi yazıldı: ${out}`);
});
