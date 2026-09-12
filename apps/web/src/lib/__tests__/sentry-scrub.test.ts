import { describe, expect, it } from "vitest";
import { scrubEvent, scrubUrl } from "../sentry-scrub";

describe("Sentry temizleyici", () => {
  it("sorgudaki jetonu gizler", () => {
    expect(scrubUrl("https://www.rothern.com/reset-password?token=abc123&x=1")).toContain("token=%5Bgizlendi%5D");
    expect(scrubUrl("https://www.rothern.com/reset-password?token=abc123")).not.toContain("abc123");
  });

  it("yoldaki davet jetonunu gizler", () => {
    const out = scrubUrl("https://www.rothern.com/company/davet/eyJhbGciOi.JIUzI1NiJ9");
    expect(out).toContain("/davet/[gizlendi]");
    expect(out).not.toContain("eyJhbGciOi");
  });

  it("olaydan çerez, başlık, gövde ve kullanıcıyı siler", () => {
    const event = scrubEvent({
      request: {
        url: "https://www.rothern.com/company/davet/tok123?code=999",
        cookies: { rk_company: "jwt" },
        headers: { authorization: "Bearer x" },
        data: { password: "s3cret" },
      },
      user: { email: "a@b.com" },
      breadcrumbs: [{ data: { from: "/company/davet/tok123", to: "/reset-password?token=zzz" } }],
    });
    const raw = JSON.stringify(event);
    expect(raw).not.toContain("jwt");
    expect(raw).not.toContain("s3cret");
    expect(raw).not.toContain("a@b.com");
    expect(raw).not.toContain("tok123");
    expect(raw).not.toContain("zzz");
  });
});
