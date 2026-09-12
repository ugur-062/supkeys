import { describe, expect, it, vi } from "vitest";

/** Kanonik olmayan konakta (staging/preview) tarama TAMAMEN kapalı olmalı. */
describe("robots — ortam kapısı", () => {
  it("staging adresi: her şey yasak", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.rothern.com");
    vi.stubEnv("NEXT_PUBLIC_MARKETPLACE_LIVE", "true");
    const { default: robots } = await import("../robots");
    const r = robots();
    expect(JSON.stringify(r.rules)).toContain('"disallow":"/"');
    expect(JSON.stringify(r.rules)).not.toContain('"allow"');
  });

  it("canlı adres: normal kurallar", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.rothern.com");
    vi.stubEnv("NEXT_PUBLIC_MARKETPLACE_LIVE", "true");
    const { default: robots } = await import("../robots");
    expect(JSON.stringify(robots().rules)).toContain('"allow"');
  });
});
