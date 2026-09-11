import { expect, request, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Staging QA yardımcıları (2026-09-11). Hesaplar `seed-staging-roles`
 * (uguray156+qa-<slug>@gmail.com / Staging1234!). API tabanı `E2E_API_URL`
 * (`https://api.staging.rothern.com/api`); kurulum adımları (adres, ilan,
 * banka hesabı) API'den, kullanıcıya görünen adımlar tarayıcıdan.
 */
export const API = process.env.E2E_API_URL ?? "https://api.staging.rothern.com/api";
export const WEB = process.env.PLAYWRIGHT_BASE_URL ?? "https://staging.rothern.com";
export const PASSWORD = process.env.E2E_PASSWORD ?? "Staging1234!";
export const QA = {
  aliciKurucu: "uguray156+qa-alici-kurucu@gmail.com",
  aliciYonetici: "uguray156+qa-alici-yonetici@gmail.com",
  aliciSatinalmaci: "uguray156+qa-alici-satinalmaci@gmail.com",
  aliciOnaylayici: "uguray156+qa-alici-onaylayici@gmail.com",
  aliciGoruntuleyici: "uguray156+qa-alici-goruntuleyici@gmail.com",
  tedarikciKurucu: "uguray156+qa-tedarikci-kurucu@gmail.com",
  tedarikciSatisci: "uguray156+qa-tedarikci-satisci@gmail.com",
  ucretsizKurucu: "uguray156+qa-ucretsiz-kurucu@gmail.com",
} as const;

/** API oturumu: çerezli bağlam + CSRF başlığı (double-submit). */
export async function apiSession(email: string): Promise<{ ctx: APIRequestContext; csrf: string }> {
  // baseURL'in "/api" parçası korunsun diye yollar baş eğik çizgisiz gider
  // (URL çözümlemesi "/x" ile taban yolu sıfırlar).
  const ctx = await request.newContext({
    baseURL: API.replace(/\/?$/, "/"),
    extraHTTPHeaders: { Origin: WEB, "Content-Type": "application/json" },
  });
  const res = await ctx.post("company-auth/login", { data: { email, password: PASSWORD } });
  expect(res.status(), `login ${email}`).toBe(200);
  const cookies = (await ctx.storageState()).cookies;
  const csrf = cookies.find((c) => c.name === "rk_csrf")?.value ?? "";
  expect(csrf, "rk_csrf çerezi").not.toBe("");
  return { ctx, csrf };
}

export async function apiPost(s: { ctx: APIRequestContext; csrf: string }, path: string, data: unknown = {}) {
  const res = await s.ctx.post(path.replace(/^\//, ""), { data, headers: { "X-CSRF-Token": s.csrf } });
  const text = await res.text();
  return { status: res.status(), body: text ? JSON.parse(text) : null };
}

export async function apiPatch(s: { ctx: APIRequestContext; csrf: string }, path: string, data: unknown = {}) {
  const res = await s.ctx.patch(path.replace(/^\//, ""), { data, headers: { "X-CSRF-Token": s.csrf } });
  const text = await res.text();
  return { status: res.status(), body: text ? JSON.parse(text) : null };
}

export async function apiGet(s: { ctx: APIRequestContext }, path: string) {
  const res = await s.ctx.get(path.replace(/^\//, ""));
  const text = await res.text();
  return { status: res.status(), body: text ? JSON.parse(text) : null };
}

/** Tarayıcı girişi (giriş formu) — oturum /me ile doğrulanır, gerekirse bir kez yinelenir. */
export async function uiLogin(page: Page, email: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await gotoRetry(page, "/company/login");
    await page.waitForURL(/\/company\/login/, { timeout: 30_000 });
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await page.waitForURL(/\/company(?!\/login)/, { timeout: 30_000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    const me = await page.request.get(`${API.replace(/\/?$/, "/")}company-auth/me`);
    if (me.ok()) return;
    await page.waitForTimeout(1500);
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
export const ADMIN = process.env.PLAYWRIGHT_ADMIN_URL ?? "https://admin.staging.rothern.com";
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "uguray156@gmail.com";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

/** Admin API oturumu: `rk_admin` + `rk_admin_csrf` (aynı `X-CSRF-Token` başlığı). */
export async function adminApiSession(): Promise<{ ctx: APIRequestContext; csrf: string }> {
  expect(ADMIN_PASSWORD, "E2E_ADMIN_PASSWORD (render.staging.env INITIAL_ADMIN_PASSWORD)").not.toBe("");
  const ctx = await request.newContext({
    baseURL: API.replace(/\/?$/, "/"),
    extraHTTPHeaders: { Origin: ADMIN, "Content-Type": "application/json" },
  });
  const res = await ctx.post("admin/auth/login", { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  expect(res.status(), `admin login: ${await res.text()}`).toBe(200);
  const cookies = (await ctx.storageState()).cookies;
  const csrf = cookies.find((c) => c.name === "rk_admin_csrf")?.value ?? "";
  expect(csrf, "rk_admin_csrf çerezi").not.toBe("");
  return { ctx, csrf };
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

export async function adminUiLogin(page: Page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await gotoRetry(page, "/admin/login");
    await page.waitForURL(/\/admin\/login/, { timeout: 30_000 });
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await page.waitForURL(/\/admin(?!\/login)/, { timeout: 30_000 });
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
