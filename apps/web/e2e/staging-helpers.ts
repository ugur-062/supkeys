import { expect, request, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Staging QA yardımcıları (2026-09-11). Hesaplar `seed-staging-roles`
 * (uguray156+qa-<slug>@gmail.com / Staging1234!). API tabanı `E2E_API_URL`
 * (`https://api.staging.supkeys.com/api`); kurulum adımları (adres, ilan,
 * banka hesabı) API'den, kullanıcıya görünen adımlar tarayıcıdan.
 */
export const API = process.env.E2E_API_URL ?? "https://api.staging.supkeys.com/api";
export const WEB = process.env.PLAYWRIGHT_BASE_URL ?? "https://staging.supkeys.com";
export const PASSWORD = process.env.E2E_PASSWORD ?? "Staging1234!";
/** Çerez adları (staging ayrı kayıtlı alan adında olduğu için canlıyla aynı adlar çakışmaz). */
export const COOKIE = { companyCsrf: "rk_csrf", adminCsrf: "rk_admin_csrf" } as const;
export const QA = {
  aliciSatisci: "uguray156+qa-alici-satisci@gmail.com",
  tedarikciGoruntuleyici: "uguray156+qa-tedarikci-goruntuleyici@gmail.com",
  tedarikci2Kurucu: "uguray156+qa-tedarikci2-kurucu@gmail.com",
  tedarikci2Satisci: "uguray156+qa-tedarikci2-satisci@gmail.com",
  aliciKurucu: "uguray156+qa-alici-kurucu@gmail.com",
  aliciYonetici: "uguray156+qa-alici-yonetici@gmail.com",
  aliciSatinalmaci: "uguray156+qa-alici-satinalmaci@gmail.com",
  aliciOnaylayici: "uguray156+qa-alici-onaylayici@gmail.com",
  aliciGoruntuleyici: "uguray156+qa-alici-goruntuleyici@gmail.com",
  tedarikciKurucu: "uguray156+qa-tedarikci-kurucu@gmail.com",
  tedarikciSatisci: "uguray156+qa-tedarikci-satisci@gmail.com",
  ucretsizKurucu: "uguray156+qa-ucretsiz-kurucu@gmail.com",
} as const;

/**
 * API oturumu: çerezli bağlam + CSRF başlığı (double-submit).
 *
 * ÖNBELLEKLİ: giriş ucu IP başına dakikada 10 istekle sınırlı
 * (`@Throttle({ auth: … })`). Tam paket 70+ testte aynı hesapla defalarca
 * giriş yapınca 429 yağıyordu ve testler ÜRÜN HATASI gibi kırılıyordu.
 * Aynı e-posta için tek oturum yeniden kullanılır; 429 gelirse beklenip
 * yinelenir.
 */
const sessionCache = new Map<string, { ctx: APIRequestContext; csrf: string }>();

export async function apiSession(email: string): Promise<{ ctx: APIRequestContext; csrf: string }> {
  const cached = sessionCache.get(email);
  if (cached) return cached;
  // baseURL'in "/api" parçası korunsun diye yollar baş eğik çizgisiz gider
  // (URL çözümlemesi "/x" ile taban yolu sıfırlar).
  const ctx = await request.newContext({
    baseURL: API.replace(/\/?$/, "/"),
    extraHTTPHeaders: { Origin: WEB, "Content-Type": "application/json" },
  });
  let res = await ctx.post("company-auth/login", { data: { email, password: PASSWORD } });
  // 429: bizim hız sınırımız. 503: Supabase Auth kotası (API bunu "giriş servisi
  // geçici olarak kullanılamıyor" diye çeviriyor). İkisi de GEÇİCİ — uzun
  // paketlerde ürün hatası gibi görünüyordu.
  for (let i = 0; i < 4 && (res.status() === 429 || res.status() === 503); i++) {
    await new Promise((r) => setTimeout(r, 20_000));
    res = await ctx.post("company-auth/login", { data: { email, password: PASSWORD } });
  }
  expect(res.status(), `login ${email}: ${(await res.text()).slice(0, 160)}`).toBe(200);
  const cookies = (await ctx.storageState()).cookies;
  const csrf = cookies.find((c) => c.name === COOKIE.companyCsrf)?.value ?? "";
  expect(csrf, `${COOKIE.companyCsrf} çerezi`).not.toBe("");
  const session = { ctx, csrf };
  sessionCache.set(email, session);
  return session;
}

export async function apiPost(s: { ctx: APIRequestContext; csrf: string }, path: string, data: unknown = {}) {
  const res = await s.ctx.post(path.replace(/^\//, ""), { data, headers: { "X-CSRF-Token": s.csrf } });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 120) };
  }
  return { status: res.status(), body: body as any };
}

export async function apiPatch(s: { ctx: APIRequestContext; csrf: string }, path: string, data: unknown = {}) {
  const res = await s.ctx.patch(path.replace(/^\//, ""), { data, headers: { "X-CSRF-Token": s.csrf } });
  const text = await res.text();
  return { status: res.status(), body: text ? JSON.parse(text) : null };
}

export async function apiGet(s: { ctx: APIRequestContext }, path: string) {
  const res = await s.ctx.get(path.replace(/^\//, ""));
  // Bazı uçlar dosya döner (şablon indirme) — JSON.parse patlamasın.
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 120) };
  }
  return { status: res.status(), body: body as any };
}

/**
 * QA TESLİMAT ADRESİ (2026-10-03): akış spec'leri her koşuda yeni bir
 * "QA … Depo <damga>" adresi açıp hiç silmiyordu; QA Alıcı firması 332 adrese
 * çıktı, firma sınırı 200 (`MAX_ADDRESSES_PER_COMPANY`) aşılınca beş akış
 * spec'i kurulumda kırıldı. Sonradan silmek de çoğu zaman olmaz: açık ilanın
 * kullandığı adres silinemez (`assertNotInActiveUse`). Bu yüzden adres
 * YENİDEN KULLANILIR:
 *   1) sabit başlıklı QA adresi varsa o,
 *   2) yoksa bir kez açılır (sonraki koşular 1'e düşer),
 *   3) açılamazsa (sınır dolu — eski koşuların kalıntısı) firmanın var olan
 *      bir TR teslimat adresi (önce "QA " başlıklılar).
 * Sonuç: firma başına en fazla BİR yeni adres, koşu sayısından bağımsız.
 */
export const QA_DELIVERY_ADDRESS_TITLE = "QA e2e Teslimat Deposu";

export async function qaDeliveryAddressId(s: { ctx: APIRequestContext; csrf: string }): Promise<string> {
  const list = await apiGet(s, "/company/addresses");
  expect(list.status, `adres listesi: ${JSON.stringify(list.body).slice(0, 160)}`).toBe(200);
  type Adres = { id: string; type: string; title: string; country: string | null };
  const fits = (list.body as Adres[]).filter((a) => a.type === "TESLIMAT" && (a.country ?? "TR") === "TR");
  const own = fits.find((a) => a.title === QA_DELIVERY_ADDRESS_TITLE);
  if (own) return own.id;
  const created = await apiPost(s, "/company/addresses", {
    type: "TESLIMAT",
    title: QA_DELIVERY_ADDRESS_TITLE,
    addressLine: "Organize Sanayi 1. Cadde No 5",
    city: "İstanbul",
    district: "Tuzla",
    country: "TR",
  });
  if (created.status < 300) return created.body.id as string;
  const reuse = fits.filter((a) => a.title.startsWith("QA ")).at(-1) ?? fits.at(-1);
  expect(
    reuse,
    `QA teslimat adresi açılamadı ve yeniden kullanılacak TR teslimat adresi yok: ${created.status} ${JSON.stringify(created.body).slice(0, 160)}`,
  ).toBeTruthy();
  return reuse!.id;
}

/** Tarayıcı girişi (giriş formu) — oturum /me ile doğrulanır, gerekirse bir kez yinelenir. */
export async function uiLogin(page: Page, email: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await gotoRetry(page, "/company/login");
    await page.waitForURL(/\/company\/login/, { timeout: 30_000 });
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    try {
      await page.waitForURL(/\/company(?!\/login)/, { timeout: 30_000 });
    } catch {
      // Giriş ucu IP başına 10/dk — 429'da sayfa yerinde kalır. Ürün hatası
      // değil; bekleyip yeniden dene (son denemede hata fırlatılır).
      if (attempt === 2) throw new Error(`uiLogin: giriş ekranı geçilemedi (${email})`);
      await page.waitForTimeout(20_000);
      continue;
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    const me = await page.request.get(`${API.replace(/\/?$/, "/")}company-auth/me`);
    if (me.ok()) return;
    await page.waitForTimeout(2000);
  }
  throw new Error(`uiLogin: oturum doğrulanamadı (${email})`);
}

/** Giriş yapılmış sayfayı aç; giriş ekranına düşerse bir kez yeniden giriş yap. */
export async function openAs(page: Page, email: string, url: string) {
  await uiLogin(page, email);
  await gotoRetry(page, url);
  if (/\/company\/login/.test(page.url())) {
    await uiLogin(page, email);
    await gotoRetry(page, url);
  }
}

/** Giriş sonrası uygulama içi yönlendirme sürerken goto ERR_ABORTED verebilir — bir kez yinele. */
export async function gotoRetry(page: Page, url: string) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  } catch (e) {
    if (!String(e).includes("ERR_ABORTED")) throw e;
    await page.waitForTimeout(1500);
    await page.goto(url, { waitUntil: "domcontentloaded" });
  }
}

export const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

// ── Admin realm (Parça 4/6) ─────────────────────────────────────────────
export const ADMIN = process.env.PLAYWRIGHT_ADMIN_URL ?? "https://admin.staging.supkeys.com";
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "uguray156@gmail.com";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
// Admin girişi yalnız e-posta + şifre (2FA 2026-10-07'de kaldırıldı).

type AdminSession = { ctx: APIRequestContext; csrf: string };

/**
 * Admin API oturumunu DENER, başarısızlığı sebebiyle döner (iddia etmez).
 * Admin adımına kadar kalıcı kayıt bırakan spec'ler (ör. satış zinciri ürünü
 * onaya gönderir; PENDING ürün admin olmadan geri alınamaz) önce bununla
 * yoklar ve admin yoksa kayıt üretmeden atlar.
 */
export async function tryAdminApiSession(): Promise<{ session: AdminSession; reason: null } | { session: null; reason: string }> {
  if (!ADMIN_PASSWORD) return { session: null, reason: "E2E_ADMIN_PASSWORD (render.staging.env INITIAL_ADMIN_PASSWORD) yok" };
  const ctx = await request.newContext({
    baseURL: API.replace(/\/?$/, "/"),
    extraHTTPHeaders: { Origin: ADMIN, "Content-Type": "application/json" },
  });
  const fail = async (reason: string) => {
    await ctx.dispose();
    return { session: null, reason } as const;
  };
  const res = await ctx.post("admin/auth/login", { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const text = await res.text();
  if (res.status() !== 200) return fail(`admin login ${res.status()}: ${text.slice(0, 200)}`);
  const cookies = (await ctx.storageState()).cookies;
  const csrf = cookies.find((c) => c.name === COOKIE.adminCsrf)?.value ?? "";
  if (!csrf) return fail(`${COOKIE.adminCsrf} çerezi yok`);
  return { session: { ctx, csrf }, reason: null };
}

/** Admin API oturumu: admin oturum + admin CSRF çerezi (aynı `X-CSRF-Token` başlığı). */
export async function adminApiSession(): Promise<AdminSession> {
  const r = await tryAdminApiSession();
  expect(r.reason, r.reason ?? "").toBeNull();
  return r.session!;
}

/** Admin tarayıcı bağlamı: admin alan adı + admin Vercel bypass anahtarı. */
export async function adminContext(browser: import("@playwright/test").Browser) {
  const bypass = process.env.PLAYWRIGHT_VERCEL_BYPASS_ADMIN;
  return browser.newContext({
    baseURL: ADMIN,
    ...(bypass
      ? { extraHTTPHeaders: { "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } }
      : {}),
  });
}

/**
 * Giriş sonrası panelde mi: yalnız YOL (pathname) üzerinden bakılır. Tam adrese
 * uygulanan `/\/admin(?!\/login)/` şemadaki `//admin.` alt alan adıyla eşleşir
 * (https://admin.rothern.com/admin/login → true) ve waitForURL giriş sayfasında
 * hemen dönerdi (giriş tamamlanmadan panelde sayılıyordu).
 */
export const adminPanelde = (u: URL) => u.pathname.startsWith("/admin") && !u.pathname.startsWith("/admin/login");

export async function adminUiLogin(page: Page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await gotoRetry(page, "/admin/login");
    await page.waitForURL(/\/admin\/login/, { timeout: 30_000 });
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    // Zaman aşımı düşürmesin: aşağıdaki me() kontrolü başarısız sayar, döngü bir kez daha dener.
    await page.waitForURL(adminPanelde, { timeout: 30_000 }).catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
    const me = await page.request.get(`${API.replace(/\/?$/, "/")}admin/auth/me`);
    if (me.ok()) return;
    await page.waitForTimeout(1500);
  }
  throw new Error("adminUiLogin: oturum doğrulanamadı");
}

/** Admin sayfasını giriş yapmış olarak aç; giriş ekranına düşerse bir kez yeniden giriş yap. */
export async function adminOpen(page: Page, url: string, creds?: { email: string; password: string }) {
  await adminUiLogin(page, creds?.email, creds?.password);
  await gotoRetry(page, url);
  await page.waitForLoadState("networkidle").catch(() => {});
  if (/\/admin\/login/.test(page.url())) {
    await adminUiLogin(page, creds?.email, creds?.password);
    await gotoRetry(page, url);
  }
}

/** 1×1 saydam PNG — görsel yükleme adımı için gerçek bir dosya gövdesi. */
export const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
