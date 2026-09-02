import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PUBLIC_ROUTE_PREFIXES, isPublicRoute } from "./public-routes";

const APP_DIR = path.resolve(__dirname, "../app");
const FORCE_DYNAMIC = /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/;

function readIfExists(file: string): string | null {
  try {
    return readFileSync(file, "utf-8");
  } catch {
    return null;
  }
}

/** Bir dizin ağacındaki .ts/.tsx dosyalarını toplar. */
function collectSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSources(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** app/ altındaki üst seviye rota segmentleri (dosyalar ve _özel dizinler hariç). */
function topLevelSegments(): string[] {
  return readdirSync(APP_DIR).filter((entry) => {
    const full = path.join(APP_DIR, entry);
    if (!statSync(full).isDirectory()) return false;
    return !entry.startsWith("_"); // _components gibi rota olmayan dizinler
  });
}

describe("isPublicRoute", () => {
  it("kök ve bilinen public önekleri kabul eder", () => {
    expect(isPublicRoute("/")).toBe(true);
    expect(isPublicRoute("/firma")).toBe(true);
    expect(isPublicRoute("/firma/acme-metal")).toBe(true);
    expect(isPublicRoute("/sozlesmeler/kvkk")).toBe(true);
    expect(isPublicRoute("/robots.txt")).toBe(true);
    expect(isPublicRoute("/sitemap.xml")).toBe(true);
  });

  it("panel rotalarını public SAYMAZ", () => {
    expect(isPublicRoute("/company")).toBe(false);
    expect(isPublicRoute("/company/login")).toBe(false);
    expect(isPublicRoute("/company/satinalma/taleplerim")).toBe(false);
    expect(isPublicRoute("/reset-password")).toBe(false);
    expect(isPublicRoute("/davet-kapat")).toBe(false);
  });

  it("segment sınırına saygılıdır — /firma öneki /firmalar'ı AÇMAZ", () => {
    // Aksi hâlde ileride eklenecek /firmalar dizini sessizce nonce'suz CSP
    // alır; bu test o kaymayı yakalar.
    expect(isPublicRoute("/firmalar")).toBe(false);
    expect(isPublicRoute("/firma-rehberi")).toBe(false);
  });

  it("sorgu dizesi ve hash kararı değiştirmez", () => {
    expect(isPublicRoute("/firma/acme?utm=x")).toBe(true);
    expect(isPublicRoute("/company/login?next=/a")).toBe(false);
  });
});

/**
 * DEĞİŞMEZ: public rota ⇔ statik/ISR render. Nonce'lı CSP ile statik prerender
 * bağdaşmaz (bkz. middleware.ts). İki taraf ayrışırsa ya sayfa ölür (statik +
 * nonce) ya da SEO için gereken CDN önbelleği kaçar (public + force-dynamic).
 */
describe("public rota ⇔ render modu değişmezi", () => {
  it("root layout force-dynamic İÇERMEZ", () => {
    const root = readIfExists(path.join(APP_DIR, "layout.tsx"));
    expect(root).not.toBeNull();
    expect(FORCE_DYNAMIC.test(root ?? "")).toBe(false);
  });

  it("public OLMAYAN her üst seviye segment dinamik render'a zorlanır", () => {
    const offenders: string[] = [];
    for (const segment of topLevelSegments()) {
      if (isPublicRoute(`/${segment}`)) continue;
      const dir = path.join(APP_DIR, segment);
      const forced = [
        path.join(dir, "layout.tsx"),
        path.join(dir, "page.tsx"),
      ].some((f) => FORCE_DYNAMIC.test(readIfExists(f) ?? ""));
      if (!forced) offenders.push(segment);
    }
    // Boş kalmalı: aksi hâlde o segment statik üretilip nonce'lı CSP ile
    // servis edilir ve canlıda script'leri bloke olur.
    expect(offenders).toEqual([]);
  });

  it("public segmentlerin hiçbir yerinde force-dynamic YOKTUR", () => {
    const offenders: string[] = [];
    for (const prefix of PUBLIC_ROUTE_PREFIXES) {
      const dir = path.join(APP_DIR, prefix.slice(1));
      let files: string[];
      try {
        files = collectSources(dir);
      } catch {
        continue; // henüz oluşturulmamış public rota
      }
      for (const file of files) {
        if (FORCE_DYNAMIC.test(readIfExists(file) ?? "")) {
          offenders.push(path.relative(APP_DIR, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
