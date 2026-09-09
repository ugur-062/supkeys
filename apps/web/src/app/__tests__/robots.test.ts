import { PUBLIC_ROUTE_PREFIXES } from "@/lib/public-routes";
import { describe, expect, it, vi } from "vitest";

/**
 * robots.txt ile public rota listesi AYRIŞMASIN.
 *
 * İki liste iki farklı şeyi yönetiyor (`public-routes.ts` CSP/render tarafını,
 * `robots.ts` tarayıcı tarafını) ve elle tutuluyorlar. Ayrıştıklarında hata
 * SESSİZ: ya yeni bir public sayfa robots'ta hiç anılmaz (niyet belgesiz
 * kalır), ya da panelin bir yolu tarayıcıya açılır. Bu test ikisini
 * karşılaştırır — `robots.ts`teki yorum da bu testin varlığına dayanıyor.
 */
vi.mock("@/lib/public/marketplace-live", () => ({ MARKETPLACE_LIVE: true }));
vi.mock("@/lib/site-url", () => ({ resolveSiteUrl: () => "https://www.rothern.com" }));

const { default: robots } = await import("../robots");

describe("robots.txt", () => {
  const out = robots();
  const general = out.rules as Array<{
    userAgent: string | string[];
    allow?: string | string[];
    disallow?: string | string[];
  }>;
  const star = general.find((r) => r.userAgent === "*")!;
  const allow = [star.allow ?? []].flat();

  it("her public rota öneki robots allow listesinde anılır", () => {
    for (const prefix of PUBLIC_ROUTE_PREFIXES) {
      // `/firma` ve `/talep` robots'ta sondaki eğik çizgiyle yazılır (tekil
      // kayıt sayfaları); ikisini de kabul et.
      const named = allow.some((a) => a === prefix || a === `${prefix}/`);
      // `/talep-onayla` noindex bir doğrulama sayfası — allow'da anılmaz.
      if (prefix === "/talep-onayla") continue;
      expect(named, `robots.ts allow listesinde eksik: ${prefix}`).toBe(true);
    }
  });

  it("panel ve API hiçbir ajana açılmaz", () => {
    for (const rule of general) {
      const dis = [rule.disallow ?? []].flat();
      expect(dis).toContain("/company/");
      expect(dis).toContain("/api/");
      expect(dis).toContain("/admin/");
    }
  });

  it("yapay zekâ ajanlarına AÇIK kural yazılır (GEO kararı)", () => {
    const agents = general.map((r) => r.userAgent).flat();
    for (const a of ["GPTBot", "PerplexityBot", "ClaudeBot", "Google-Extended", "OAI-SearchBot"]) {
      expect(agents).toContain(a);
    }
  });

  it("sitemap ve host mutlak adresle bildirilir", () => {
    expect(out.sitemap).toBe("https://www.rothern.com/sitemap.xml");
    expect(out.host).toBe("https://www.rothern.com");
  });
});
