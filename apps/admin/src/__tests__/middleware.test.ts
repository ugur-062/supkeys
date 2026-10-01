import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DOC_PREVIEW_FRAME_ORIGIN, middleware } from "../middleware";

function frameSrc(): string[] {
  const csp =
    middleware(new NextRequest("http://localhost/admin/firmalar/x")).headers.get(
      "content-security-policy",
    ) ?? "";
  const d = csp
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("frame-src"));
  return d ? d.split(/\s+/).slice(1) : [];
}

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * Belge "Önizle" iframe'i R2 presigned URL açar; frame-src yokken
 * default-src 'self' çerçeveyi engelliyordu (arayüz testi O-076).
 */
describe("admin CSP frame-src", () => {
  it("R2 S3 uç noktasını çerçevede açmaya izin verir, başka kökene değil", () => {
    vi.stubEnv("R2_ENDPOINT", "");
    expect(frameSrc()).toEqual(["'self'", DOC_PREVIEW_FRAME_ORIGIN]);
    expect(DOC_PREVIEW_FRAME_ORIGIN).toBe("https://*.r2.cloudflarestorage.com");
  });

  it("özel R2_ENDPOINT kökenini ekler (yalnız https)", () => {
    vi.stubEnv("R2_ENDPOINT", "https://files.example.com/some/path");
    expect(frameSrc()).toEqual([
      "'self'",
      DOC_PREVIEW_FRAME_ORIGIN,
      "https://files.example.com",
    ]);
    vi.stubEnv("R2_ENDPOINT", "http://insecure.example.com");
    expect(frameSrc()).toEqual(["'self'", DOC_PREVIEW_FRAME_ORIGIN]);
  });

  it("frame-ancestors 'none' korunur", () => {
    const csp =
      middleware(new NextRequest("http://localhost/admin")).headers.get(
        "content-security-policy",
      ) ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
