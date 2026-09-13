#!/usr/bin/env node
/**
 * CANLI SAĞLIK DENETİMİ — sürüm sonrası tek komut:
 *   pnpm --filter @rothern/web health:prod
 *   SITE=https://staging.rothern.com API=https://api.staging.rothern.com/api node scripts/prod-health.mjs
 *
 * NEDEN VAR: 2026-09-13'te canlıya müşteri alma hazırlığı yapılırken bu
 * kontrollerin hepsi ELLE koşuldu ve üçü gerçek sorun buldu (IndexNow anahtar
 * konumu, gönderen alan adı, silinmiş sayfaların önbellekte kalması). Elle
 * yapılan kontrol bir daha yapılmaz; betik yapılır.
 *
 * `seo:audit` içerik ve meta tarafına bakar — bu betik ALTYAPI tarafına:
 * servis sağlığı, güvenlik başlıkları, yasal yüzey, künye tutarlılığı,
 * e-posta kimlik doğrulama kayıtları.
 *
 * Sorun varsa çıkış kodu 1. Bağımlılık YOK (Node 22 fetch + DNS-over-HTTPS).
 *
 * SEÇENEKLER
 *   INDEXNOW_KEY=<anahtar>  kök anahtar dosyasını da doğrular
 *   RATE=1                  giriş hız sınırını sınar (12 hatalı deneme atar)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const SITE = (process.env.SITE ?? "https://www.rothern.com").replace(/\/$/, "");
const API = (process.env.API ?? "https://api.rothern.com/api").replace(/\/$/, "");
const UA = "RothernHealthCheck/1.0";
const HOST = new URL(SITE).host.replace(/^www\./, "");

let failures = 0;
const log = (ok, label, extra = "") => {
  failures += ok ? 0 : 1;
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
};
const bolum = (ad) => console.log(`\n${ad}`);

async function get(url, accept = "text/html") {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept }, redirect: "follow" });
    return {
      status: res.status,
      text: res.status === 200 ? await res.text() : "",
      header: (n) => res.headers.get(n) ?? "",
    };
  } catch (err) {
    return { status: 0, text: "", header: () => "", error: String(err) };
  }
}

/** DNS-over-HTTPS: TXT kaydı var mı ve isteğe bağlı desen tutuyor mu. */
async function txt(name) {
  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${name}&type=TXT`, {
      headers: { accept: "application/dns-json" },
    });
    const body = await res.json();
    return (body.Answer ?? []).map((a) => String(a.data).replace(/^"|"$/g, ""));
  } catch {
    return [];
  }
}

/**
 * Künye olguları TEK KAYNAKTAN okunur (`lib/company-info.ts`), betiğe elle
 * KOPYALANMAZ — kopyalansaydı unvan değiştiğinde betik sessizce eski değeri
 * doğrulamaya devam ederdi. Aynı yaklaşım `e2e/role-endpoints.ts`te de var.
 */
function operatorOlgulari() {
  const p = resolve(dirname(fileURLToPath(import.meta.url)), "../src/lib/company-info.ts");
  const src = readFileSync(p, "utf8");
  const al = (anahtar) => src.match(new RegExp(`${anahtar}:\\s*"([^"]+)"`))?.[1] ?? null;
  return {
    legalName: al("legalName"),
    mersisNo: al("mersisNo"),
    taxNo: al("taxNo"),
    supportEmail: al("supportEmail"),
    kvkkEmail: al("kvkkEmail"),
  };
}

async function main() {
  console.log(`Canlı sağlık denetimi\n  site: ${SITE}\n  api : ${API}`);

  /* ── 1. Servis ─────────────────────────────────────────────────── */
  bolum("Servis");
  const health = await get(`${API}/health`, "application/json");
  let saglik = null;
  try {
    saglik = JSON.parse(health.text);
  } catch { /* yok */ }
  log(health.status === 200 && saglik?.status === "ok", "API sağlık ucu", saglik?.version ?? `HTTP ${health.status}`);
  log(saglik?.checks?.database === "up", "veritabanı bağlantısı");
  log(saglik?.checks?.exchangeRates?.stale === false, "döviz kurları taze", saglik?.checks?.exchangeRates?.latestRateDate ?? "");

  /* ── 2. Güvenlik başlıkları ────────────────────────────────────── */
  bolum("Güvenlik başlıkları");
  const kok = await get(`${SITE}/`);
  const zorunlu = [
    ["strict-transport-security", /max-age=\d{7,}/],
    ["x-content-type-options", /nosniff/],
    ["x-frame-options", /DENY|SAMEORIGIN/i],
    ["referrer-policy", /origin|no-referrer/i],
    ["content-security-policy", /default-src/],
  ];
  for (const [ad, desen] of zorunlu) {
    log(desen.test(kok.header(ad)), `web ${ad}`);
  }
  // Panel sayfası DİNAMİK olmalı ki nonce alabilsin; statik prerender nonce
  // alamaz ve politika `unsafe-inline`a düşer (bkz. CLAUDE.md § CSP).
  const giris = await get(`${SITE}/company/login`);
  log(/nonce-/.test(giris.header("content-security-policy")), "giriş ekranı nonce'lu CSP");
  log(/max-age=\d{7,}/.test(health.header("strict-transport-security")), "api strict-transport-security");

  /* ── 3. Yasal yüzey ────────────────────────────────────────────── */
  bolum("Yasal yüzey");
  for (const yol of [
    "/sozlesmeler/kullanici",
    "/sozlesmeler/gizlilik",
    "/sozlesmeler/kvkk",
    "/sozlesmeler/mesafeli-satis",
    "/sozlesmeler/iade",
    "/sozlesmeler/aracilik",
    "/iletisim",
  ]) {
    const r = await get(`${SITE}${yol}`);
    log(r.status === 200, `${yol}`, r.status === 200 ? "" : `HTTP ${r.status}`);
  }

  /* ── 4. Künye tutarlılığı (canlı ↔ tek kaynak) ─────────────────── */
  bolum("Künye — canlı sayfa tek kaynakla aynı mı");
  const bek = operatorOlgulari();
  const kunye = await get(`${SITE}/iletisim`);
  for (const [ad, deger] of Object.entries(bek)) {
    if (!deger) { log(false, `tek kaynakta ${ad} okunamadı`); continue; }
    log(kunye.text.includes(deger), ad, deger);
  }

  /* ── 5. E-posta kimlik doğrulama ───────────────────────────────── */
  bolum("E-posta kimlik doğrulama (DNS)");
  const dkim = await txt(`resend._domainkey.${HOST}`);
  log(dkim.length > 0, "DKIM kaydı");
  const spf = await txt(`send.${HOST}`);
  log(spf.some((v) => v.startsWith("v=spf1")), "gönderim alt alanında SPF");
  const dmarc = await txt(`_dmarc.${HOST}`);
  const dm = dmarc.find((v) => v.startsWith("v=DMARC1"));
  log(Boolean(dm), "DMARC kaydı", dm ?? "");
  if (dm) log(/rua=mailto:/.test(dm), "DMARC rapor adresi tanımlı");

  /* ── 6. Arama motoru yüzeyi ────────────────────────────────────── */
  bolum("Arama motoru yüzeyi");
  for (const [yol, etiket] of [
    ["/robots.txt", "robots.txt"],
    ["/sitemap.xml", "sitemap indeksi"],
    ["/llms.txt", "llms.txt"],
    ["/llms-full.txt", "llms-full.txt"],
  ]) {
    const r = await get(`${SITE}${yol}`, "text/plain");
    log(r.status === 200, etiket, r.status === 200 ? "" : `HTTP ${r.status}`);
  }
  const inKey = process.env.INDEXNOW_KEY;
  if (inKey) {
    // KÖK konum ŞART: anahtar dosyasının DİZİNİ, bildirilebilecek adreslerin
    // kapsamını sınırlar. Alt dizindeyken kanal hiçbir ürün adresini
    // bildiremiyordu (2026-09-13, canlıda 422 ile ölçüldü).
    const kf = await get(`${SITE}/${inKey}.txt`, "text/plain");
    log(kf.status === 200 && kf.text.trim() === inKey, "IndexNow anahtar dosyası KÖKTE");
  } else {
    console.log("· IndexNow anahtar kontrolü atlandı (INDEXNOW_KEY verilmedi)");
  }

  /* ── 7. Hız sınırı (opsiyonel) ─────────────────────────────────── */
  if (process.env.RATE === "1") {
    bolum("Hız sınırı");
    let gorulen429 = false;
    for (let i = 0; i < 12 && !gorulen429; i++) {
      const res = await fetch(`${API}/company-auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: SITE, "user-agent": UA },
        body: JSON.stringify({ email: "yok@ornek.invalid", password: "GecersizSifre123" }),
      });
      if (res.status === 429) gorulen429 = true;
    }
    log(gorulen429, "giriş ucu hız sınırı devrede");
  } else {
    console.log("\n· Hız sınırı kontrolü atlandı (RATE=1 ile açılır)");
  }

  console.log(failures === 0 ? "\nSorun yok." : `\n${failures} sorun bulundu.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Denetim çalışamadı:", err);
  process.exit(1);
});
