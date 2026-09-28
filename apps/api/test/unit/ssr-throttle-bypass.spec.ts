import { SSR_KEY_HEADER, isTrustedSsrRequest } from "../../src/common/http/client-ip-throttler.guard";

/**
 * Web SSR → API hız sınırı muafiyeti (yayın denetimi 2026-09-28 Bölüm 11):
 * Vercel'in birkaç çıkış IP'si IP başına 100/dk tavanına düşmesin. Muafiyet
 * DAR: paylaşılan sır (SEO_REVALIDATE_SECRET) ∧ GET ∧ /api/public/*.
 */
const SECRET = "s".repeat(32);
const req = (over: Record<string, unknown> = {}) => ({
  method: "GET",
  originalUrl: "/api/public/products?page=2",
  headers: { [SSR_KEY_HEADER]: SECRET },
  ...over,
});

describe("isTrustedSsrRequest", () => {
  it("doğru sır + GET + /api/public/* → muaf", () => {
    expect(isTrustedSsrRequest(req(), SECRET)).toBe(true);
    expect(isTrustedSsrRequest(req({ headers: { [SSR_KEY_HEADER]: [SECRET] } }), SECRET)).toBe(true);
  });
  it("sır tanımsız/kısa → hiçbir istek muaf değil (bugünkü davranış)", () => {
    expect(isTrustedSsrRequest(req(), undefined)).toBe(false);
    expect(isTrustedSsrRequest(req({ headers: { [SSR_KEY_HEADER]: "short" } }), "short")).toBe(false);
  });
  it("yanlış/eksik başlık, yazma isteği ya da herkese açık olmayan uç → muaf değil", () => {
    expect(isTrustedSsrRequest(req({ headers: { [SSR_KEY_HEADER]: "x".repeat(32) } }), SECRET)).toBe(false);
    expect(isTrustedSsrRequest(req({ headers: {} }), SECRET)).toBe(false);
    expect(isTrustedSsrRequest(req({ method: "POST" }), SECRET)).toBe(false);
    expect(isTrustedSsrRequest(req({ originalUrl: "/api/company-auth/login" }), SECRET)).toBe(false);
    expect(isTrustedSsrRequest(req({ originalUrl: "/api/publicx/../company" }), SECRET)).toBe(false);
  });
});
