import { describe, expect, it } from "vitest";
import { scrubEvent, scrubQueryString, scrubUrl } from "../sentry-scrub";

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
  it("scrubs contexts.nextjs.request_path, query_string, http.query and transaction (derin denetim MU-12)", () => {
    const event = scrubEvent({
      request: { url: "https://x.test/p", query_string: "token=qs-secret&page=2" },
      contexts: {
        nextjs: { request_path: "/tr/company/davet/ctx-secret-token?code=ctxcode", router_kind: "App Router" },
      },
      transaction: "GET /tr/company/davet/tx-secret-token",
      breadcrumbs: [{ data: { url: "https://api.test/x", "http.query": "?token=bc-secret&a=1" } }],
    });
    const raw = JSON.stringify(event);
    for (const secret of ["qs-secret", "ctx-secret-token", "ctxcode", "tx-secret-token", "bc-secret"]) {
      expect(raw).not.toContain(secret);
    }
    expect(event.contexts?.nextjs?.request_path).toBe("/tr/company/davet/[gizlendi]?code=%5Bgizlendi%5D");
    expect(event.contexts?.nextjs?.router_kind).toBe("App Router");
    expect(event.request?.query_string).toBe("token=%5Bgizlendi%5D&page=2");
    expect(event.transaction).toBe("GET /tr/company/davet/[gizlendi]");
    expect(event.breadcrumbs?.[0]?.data?.["http.query"]).toBe("?token=%5Bgizlendi%5D&a=1");
  });

  it("drops non-string query_string; token-free query stays as is", () => {
    const event = scrubEvent({ request: { query_string: [["token", "arr-secret"]] } });
    expect(event.request && "query_string" in event.request).toBe(false);
    expect(scrubQueryString("page=2&q=boru")).toBe("page=2&q=boru");
    expect(scrubQueryString("")).toBe("");
  });
});
