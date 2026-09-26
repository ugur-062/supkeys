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
  // Next 15 dinamik sayfalarda metadata AKIŞLA gelir: <title>/<meta> ilk
  // <head> parçasında değil, gövdede sonradan basılır (tarayıcı hoist eder;
  // bot UA'larına Next akışsız verir). Denetim UA'sı bot sayılmadığı için
  // head-only ayrıştırma "title yok" diye yanlış alarm veriyordu (2026-09-11)
  // → önce head, bulunamazsa tüm belge.
  const headOnly = (html.match(/<head[\s\S]*?<\/head>/i) ?? [""])[0];
  const scope = (re) => (headOnly.match(re) ? headOnly : html);
  const title = (scope(/<title[^>]*>/i).match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1]?.trim() ?? null;
  const metas = [...html.matchAll(/<meta\s+[^>]*>/gi)].map((m) => m[0]);
  const links = [...html.matchAll(/<link\s+[^>]*>/gi)].map((m) => m[0]);
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
  const lang = attr((html.match(/<html\b[^>]*>/i) ?? [""])[0], "lang");
  // Next `hrefLang` (büyük L) basar; dil seçicinin <a hrefLang> bağlantıları <link> değil → karışmaz.
  const hreflang = {};
  for (const t of links) {
    if (attr(t, "rel")?.toLowerCase() !== "alternate") continue;
    const hl = attr(t, "hreflang");
    const href = attr(t, "href");
    if (hl && href) hreflang[hl] = href;
  }
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
    lang,
    hreflang,
    ogLocale: meta("og:locale", "property"),
  };
}

/**
 * Çevrilmemiş Türkçe sezgiseli (içerik çevirisi kapısıyla aynı kural):
 * KÜÇÜK harfle başlayan Türkçe-harfli sözcük hiçbir zaman özel ad değildir
 * ("şartlandırma", "ekipmanları"). Büyük harfli (Çerkezköy, A.Ş.) serbest.
 */
export function turkishLeftovers(text) {
  return [...new Set((text ?? "").match(/(?<![\p{L}\d])\p{Ll}[\p{L}\d]*[çğışöü][\p{L}\d]*/gu) ?? [])];
}

/** Adresin dili — ön ek yoksa Türkçe (localePrefix "as-needed"). */
export function localeOfUrl(u) {
  try {
    const m = /^\/(en|ru)(?:\/|$)/.exec(new URL(u).pathname);
    return m ? m[1] : "tr";
  } catch {
    return "tr";
  }
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
  problems.push(...localeProblems(url, h, nodes, html));
  return { ok: problems.length === 0, problems, head: h };
}

/**
 * DİL KONTROLLERİ (i18n SEO 2026-09-26) — her dil sürümü kendi dilinde mi?
 * html lang · og:locale · hreflang kendini içeriyor + x-default · ana JSON-LD
 * düğümünün `inLanguage`i · EN/RU'da başlık/açıklama/h1'de çevrilmemiş Türkçe.
 * Sözleşme sayfaları bilinçli Türkçe gövdeli (h1 `lang="tr"` taşır) → h1 muaf.
 */
function localeProblems(url, h, nodes, html) {
  const locale = localeOfUrl(url);
  const out = [];
  if (h.lang !== locale) out.push(`html lang ${h.lang ?? "yok"} (${locale} bekleniyor)`);
  if (!h.ogLocale || !h.ogLocale.toLowerCase().startsWith(locale)) out.push(`og:locale ${h.ogLocale ?? "yok"}`);
  const self = h.hreflang[locale];
  if (!self) out.push(`hreflang'de kendi dili (${locale}) yok`);
  else if (normalize(self) !== normalize(url)) out.push(`hreflang ${locale} ≠ url (${self})`);
  if (!h.hreflang["x-default"]) out.push("hreflang x-default yok");
  const main = nodes.find((n) => ["Product", "Demand", "FAQPage", "ItemList", "CollectionPage", "WebPage"].includes(n["@type"]));
  if (main?.inLanguage && typeof main.inLanguage === "string" && !main.inLanguage.toLowerCase().startsWith(locale)) {
    out.push(`${main["@type"]}.inLanguage ${main.inLanguage}`);
  }
  if (locale !== "tr") {
    const h1Tr = /<h1\b[^>]*\blang=["']tr["']/i.test(html);
    const fields = { title: h.title, description: h.description, ...(h1Tr ? {} : { h1: h.h1 }) };
    for (const [k, v] of Object.entries(fields)) {
      const left = turkishLeftovers(v);
      if (left.length) out.push(`${k}: çevrilmemiş Türkçe (${left.slice(0, 3).join(", ")})`);
    }
  }
  return out;
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
