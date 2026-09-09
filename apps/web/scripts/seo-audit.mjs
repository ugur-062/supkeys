#!/usr/bin/env node
/**
 * CANLI SEO DENETİMİ (SEO Parça 9) — deploy sonrası tek komut:
 *   pnpm --filter @rothern/web seo:audit                 # SITE=https://www.rothern.com
 *   SITE=http://localhost:3000 SAMPLE=3 node scripts/seo-audit.mjs
 *
 * Ne yapar: robots.txt + sitemap indeksi + llms.txt'yi doğrular, her sitemap
 * parçasından SAMPLE adres örnekler, her sayfada başlık/açıklama/kanonik/
 * OG görseli (HTTP 200 + image/*)/JSON-LD zorunlu alanları/h1/noindex'i
 * kontrol eder. Sorun varsa çıkış kodu 1 — CI'a bağlanabilir.
 * Bağımlılık YOK (Node 22 fetch).
 */
import { checkPage, sitemapLocs } from "./seo-audit-checks.mjs";

const SITE = (process.env.SITE ?? "https://www.rothern.com").replace(/\/$/, "");
const SAMPLE = Number(process.env.SAMPLE ?? 3);
const UA = "RothernSeoAudit/1.0 (+https://www.rothern.com)";

let failures = 0;
const log = (ok, label, extra = "") => {
  failures += ok ? 0 : 1;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
};

async function get(url, accept = "text/html") {
  const res = await fetch(url, { headers: { "user-agent": UA, accept }, redirect: "manual" });
  return { status: res.status, type: res.headers.get("content-type") ?? "", text: res.status === 200 ? await res.text() : "", location: res.headers.get("location") };
}

async function main() {
  console.log(`SEO denetimi → ${SITE}\n`);

  const robots = await get(`${SITE}/robots.txt`, "text/plain");
  log(robots.status === 200 && robots.text.includes(`${SITE}/sitemap.xml`), "robots.txt sitemap satırı");
  log(!/Disallow:\s*\/\s*$/m.test(robots.text), "robots.txt tümü kapalı DEĞİL");

  const llms = await get(`${SITE}/llms.txt`, "text/plain");
  log(llms.status === 200, "llms.txt 200");

  const idx = await get(`${SITE}/sitemap.xml`, "application/xml");
  log(idx.status === 200 && idx.text.includes("<sitemapindex"), "sitemap.xml indeks");
  const parts = sitemapLocs(idx.text);
  log(parts.length >= 3, `sitemap parça sayısı ${parts.length}`);

  const targets = [];
  for (const part of parts) {
    const p = await get(part, "application/xml");
    const locs = sitemapLocs(p.text);
    log(p.status === 200, `parça ${part.replace(SITE, "")}`, `${locs.length} adres`);
    const kind = /products/.test(part) ? "product" : /companies/.test(part) ? "company" : /listings/.test(part) ? "listing" : "hub";
    for (const u of sample(locs, SAMPLE)) targets.push({ url: u, kind });
  }

  console.log("");
  for (const t of targets) {
    const page = await get(t.url);
    if (page.status !== 200) {
      log(false, t.url, `HTTP ${page.status}${page.location ? ` → ${page.location}` : ""}`);
      continue;
    }
    const r = checkPage(t.url, page.text, { indexable: true, type: t.kind === "hub" ? undefined : t.kind });
    let ogNote = "";
    if (r.head.ogImage) {
      const img = await fetch(r.head.ogImage, { headers: { "user-agent": UA } });
      const okImg = img.status === 200 && /^image\//.test(img.headers.get("content-type") ?? "");
      if (!okImg) r.problems.push(`og:image HTTP ${img.status} ${img.headers.get("content-type") ?? ""}`);
      else ogNote = "og ✓";
    }
    log(r.problems.length === 0, t.url.replace(SITE, ""), r.problems.length ? r.problems.join("; ") : ogNote);
  }

  console.log(`\n${failures === 0 ? "Sorun yok." : `${failures} sorun.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

function sample(arr, n) {
  if (arr.length <= n) return arr;
  const step = Math.max(1, Math.floor(arr.length / n));
  return Array.from({ length: n }, (_, i) => arr[i * step]).filter(Boolean);
}

main().catch((err) => {
  console.error("Denetim çöktü:", err);
  process.exit(2);
});
