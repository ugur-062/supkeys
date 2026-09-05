import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COMPANY_AREA, MODULE_LABELS, PORTALS, allPortalRoutes } from "../portals";

/**
 * MENÜDEN ULAŞILAMAYAN SAYFA OLMASIN (2026-09-03).
 *
 * Gerçek hata: `satis/urunlerim` ve `satis/bilgi-talepleri` sayfaları
 * yazılmış, `MODULE_LABELS`e adları girilmiş ama menüye HİÇ eklenmemişti —
 * kullanıcı ürününü nereden ekleyeceğini soramaz hâle geldi. Sayfa yazmakla
 * sayfayı ulaşılabilir kılmak ayrı işler; bu test ikincisini zorunlu tutar.
 *
 * Dosya sistemi üzerinden gider: yeni bir sayfa eklenip menüye bağlanmazsa
 * test kırılır. Menü DIŞI kalması bilinçli olanlar açıkça listelenir.
 */
const APP_DIR = path.join(process.cwd(), "src/app/company/(authed)");

/** Menüde OLMAMASI bilinçli olan rotalar — her biri gerekçesiyle. */
const NOT_IN_MENU: Record<string, string> = {
  "satinalma/sablonlar": "secondaryNav — Taleplerim sayfasından açılır.",
  "satinalma/mesajlar": "Üst çubuktaki mesaj kutusundan açılır.",
  "satis/mesajlar": "Üst çubuktaki mesaj kutusundan açılır.",
};

function topLevelPages(portal: string): string[] {
  const dir = path.join(APP_DIR, portal);
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("[") && !e.name.startsWith("_"))
    .filter((e) => fs.existsSync(path.join(dir, e.name, "page.tsx")))
    .map((e) => `${portal}/${e.name}`);
}

describe("modül ulaşılabilirliği", () => {
  it("her portal sayfası menüde VAR ya da gerekçesiyle listede", () => {
    const orphans: string[] = [];
    // Şirketim alanı (2026-09-05): kendi menüsü; sayfaları da aynı kurala tabi.
    const areas = [
      ...(["satinalma", "satis"] as const).map((key) => ({ key, routes: allPortalRoutes(PORTALS[key]) })),
      { key: "sirketim" as const, routes: [...COMPANY_AREA.nav, ...COMPANY_AREA.secondaryNav] },
    ];
    for (const { key, routes } of areas) {
      const hrefs = new Set(routes.map((i) => i.href.replace("/company/", "")));
      for (const page of topLevelPages(key)) {
        if (hrefs.has(page)) continue;
        if (page in NOT_IN_MENU) continue;
        orphans.push(page);
      }
    }
    expect(orphans).toEqual([]);
  });

  it("ölü istisna kalmasın — listelenen rota gerçekten var", () => {
    for (const rel of Object.keys(NOT_IN_MENU)) {
      expect(
        fs.existsSync(path.join(APP_DIR, rel, "page.tsx")),
        `${rel} artık yok — istisna listesinden çıkarılmalı`,
      ).toBe(true);
    }
  });

  it("MODULE_LABELS'teki her ad bir menü satırında kullanılır", () => {
    // Etiket sözlüğünde durup hiçbir yere bağlanmayan ad, "sayfa var ama
    // ulaşılamıyor" hatasının erken işaretiydi.
    const used = new Set(
      Object.values(PORTALS).flatMap((p) =>
        allPortalRoutes(p).map((i) => i.label),
      ),
    );
    const unused: string[] = [];
    for (const [portal, labels] of Object.entries(MODULE_LABELS)) {
      for (const [key, label] of Object.entries(labels)) {
        if (!used.has(label)) unused.push(`${portal}.${key} ("${label}")`);
      }
    }
    expect(unused).toEqual([]);
  });
});
