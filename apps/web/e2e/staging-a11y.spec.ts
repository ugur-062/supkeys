import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { QA, gotoRetry, uiLogin } from "./staging-helpers";

/**
 * ERİŞİLEBİLİRLİK TARAMASI (2026-09-12).
 *
 * Onaylar kapısındaki eksik `role="status"` şans eseri bulunmuştu; sistematik
 * bir tarama yoktu. Kapı **critical + serious** ihlallerde kırmızı; moderate/
 * minor raporlanır ama kırmızı yapmaz (uzun kuyruk tek turda kapanmaz).
 */
const SEVERITY = ["critical", "serious"] as const;

async function scan(page: Page, label: string) {
  await page.waitForLoadState("networkidle").catch(() => {});
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations.filter((v) => SEVERITY.includes(v.impact as (typeof SEVERITY)[number]));
  const summary = blocking
    .map((v) => {
      const örnekler = v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")} :: ${(n.failureSummary ?? "").split("\n")[1] ?? ""}`);
      return `  [${v.impact}] ${v.id} (${v.nodes.length} düğüm)\n     ${örnekler.join("\n     ")}`;
    })
    .join("\n");
  if (blocking.length > 0) console.log(`   ✗ ${label}\n${summary}`);
  const others = results.violations.filter((v) => !SEVERITY.includes(v.impact as (typeof SEVERITY)[number]));
  if (others.length > 0) console.log(`   ⓘ ${label}: ${others.length} düşük seviye ihlal (${others.map((v) => v.id).join(", ")})`);
  expect.soft(blocking, `${label}\n${summary}`).toEqual([]);
}

test("ziyaretçi sayfaları erişilebilirlik", async ({ page }) => {
  test.setTimeout(300_000);
  for (const path of ["/", "/urunler", "/firmalar", "/alim-talepleri", "/nasil-calisir", "/company/login", "/company/kayit"]) {
    await gotoRetry(page, path);
    await scan(page, path);
  }
});

test("panel sayfaları erişilebilirlik", async ({ page }) => {
  test.setTimeout(300_000);
  await uiLogin(page, QA.aliciKurucu);
  for (const path of [
    "/company/satinalma",
    "/company/satinalma/taleplerim",
    "/company/satinalma/siparisler",
    "/company/ayarlar",
    "/company/ayarlar/firma",
  ]) {
    await gotoRetry(page, path);
    await scan(page, path);
  }
});
