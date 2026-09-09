/**
 * SEO DENETİM KONTROLLERİ — saf fonksiyonlar (SEO Parça 9).
 * `seo-audit.mjs` canlı sayfayı çeker, buradaki kontroller HTML'i okur.
 * Ayrı dosya: vitest ile test edilebilsin (script ağ ister, bunlar istemez).
 */

const attr = (tag, name) => {
  const m = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag);
  return m ? m[1] : null;
};

export function parseHead(html) {
  const head = (html.match(/<head[\s\S]*?<\/head>/i) ?? [html])[0];
  const title = (head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1]?.trim() ?? null;
  const metas = [...head.matchAll(/<meta\s+[^>]*>/gi)].map((m) => m[0]);
  const links = [...head.matchAll(/<link\s+[^>]*>/gi)].map((m) => m[0]);
  const meta = (key, by = "name") =>
    metas.map((t) => (attr(t, by)?.toLowerCase() === key ? attr(t, "content") : null)).find((v) => v != null) ?? null;
  const canonical = links.map((t) => (attr(t, "rel")?.toLowerCase() === "canonical" ? attr(t, "href") : null)).find((v) => v) ?? null;
  const jsonLd = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => {
    try {
      return JSON.parse(m[1]);
    } catch {
      return { __invalid: true };
    }
  });
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? [])[1]?.replace(/<[^>]+>/g, "").trim() ?? null;
  return {
    title,
    description: meta("description"),
    canonical,
    robots: meta("robots"),
    ogImage: meta("og:image", "property"),
    ogTitle: meta("og:title", "property"),
    twitterCard: meta("twitter:card"),
    jsonLd,
    h1,
  };
}

/** JSON-LD graph içindeki düğüm tiplerini düzleştirir. */
export function ldTypes(jsonLd) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n["@type"]) out.push(n);
    if (n["@graph"]) walk(n["@graph"]);
  };
  walk(jsonLd);
  return out;
}

const REQUIRED = {
  Product: ["name", "offers"],
  Organization: ["name", "url"],
  Demand: ["name", "url"],
  BreadcrumbList: ["itemListElement"],
  FAQPage: ["mainEntity"],
  ItemList: ["itemListElement"],
};

/**
 * Bir sayfanın kontrolleri → { ok, problems[] }.
 * @param {string} url
 * @param {string} html
 * @param {{ indexable: boolean, type?: "product" | "company" | "listing" }} [expect]
 */
export function checkPage(url, html, expect = { indexable: true }) {
  const h = parseHead(html);
  const problems = [];
  if (!h.title) problems.push("title yok");
  else if (h.title.length < 15 || h.title.length > 75) problems.push(`title uzunluğu ${h.title.length} (15-75 bekleniyor)`);
  if (/Rothern[^<]*Rothern/.test(h.title ?? "")) problems.push("title'da marka iki kez");
  if (!h.description) problems.push("meta description yok");
  else if (h.description.length < 50 || h.description.length > 170) problems.push(`description uzunluğu ${h.description.length} (50-170)`);
  if (!h.canonical) problems.push("canonical yok");
  else if (normalize(h.canonical) !== normalize(url)) problems.push(`canonical ≠ url (${h.canonical})`);
  if (!h.ogImage) problems.push("og:image yok");
  if (h.twitterCard !== "summary_large_image") problems.push(`twitter:card ${h.twitterCard ?? "yok"}`);
  const noindex = /noindex/i.test(h.robots ?? "");
  if (expect.indexable && noindex) problems.push("beklenmedik noindex");
  if (!expect.indexable && !noindex) problems.push("noindex bekleniyordu");
  if (!h.h1) problems.push("h1 yok");
  if (h.jsonLd.some((j) => j.__invalid)) problems.push("JSON-LD parse edilemiyor");
  const nodes = ldTypes(h.jsonLd);
  if (nodes.length === 0) problems.push("JSON-LD yok");
  for (const n of nodes) {
    const t = Array.isArray(n["@type"]) ? n["@type"][0] : n["@type"];
    for (const f of REQUIRED[t] ?? []) if (n[f] == null) problems.push(`${t}.${f} eksik`);
  }
  const want = { product: "Product", company: "Organization", listing: "Demand" }[expect.type];
  if (want && !nodes.some((n) => n["@type"] === want)) problems.push(`${want} düğümü yok`);
  // SAHİP ANONİM: Demand düğümünde seller/offeredBy olamaz.
  if (nodes.some((n) => n["@type"] === "Demand" && (n.seller || n.offeredBy))) problems.push("Demand düğümünde sahip kimliği");
  return { ok: problems.length === 0, problems, head: h };
}

function normalize(u) {
  try {
    const x = new URL(u);
    return `${x.origin}${x.pathname.replace(/\/$/, "")}`;
  } catch {
    return u;
  }
}

/** sitemap indeks/urlset → adres listesi (image vb. atlanır). */
export function sitemapLocs(xml) {
  return [...xml.matchAll(/<(?:sitemap|url)>\s*<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}
