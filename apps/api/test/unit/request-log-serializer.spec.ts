import pino from "pino";
import {
  LOGGED_REQUEST_HEADERS,
  serializeRequestForLog,
} from "../../src/common/logging/request-log-serializer";

/**
 * Derin denetim MU-12 (X03/X16/X19/S041): pino-std-serializers copies the whole
 * `req.headers`; the old serializer spread it through, so the web SSR secret
 * (`x-rothern-ssr` = SEO_REVALIDATE_SECRET) reached every `/api/public/*`
 * access-log line in plain text. Headers are now allowlisted.
 */
const SECRET = "s".repeat(28) + "-ssr";

function fakeReq(headers: Record<string, string>, url = "/api/public/products?page=2") {
  return {
    id: "req-1",
    method: "GET",
    url,
    originalUrl: url,
    headers,
    socket: { remoteAddress: "10.0.0.1", remotePort: 1234 },
  };
}

// pino-http wraps the custom serializer with the std one (wrapSerializers: true).
const serialize = pino.stdSerializers.wrapRequestSerializer(serializeRequestForLog as never) as (
  r: unknown,
) => Record<string, unknown>;

describe("serializeRequestForLog", () => {
  it("drops secret and client IP headers, keeps allowlisted ones", () => {
    const out = serialize(
      fakeReq({
        host: "api.rothern.com",
        "user-agent": "Next.js Middleware",
        "accept-language": "en",
        "x-request-id": "abc",
        "x-rothern-ssr": SECRET,
        "x-csrf-token": "csrf-token-value",
        "svix-signature": "v1,signature",
        "x-forwarded-for": "203.0.113.7",
        "true-client-ip": "203.0.113.7",
        "cf-connecting-ip": "203.0.113.7",
        authorization: "Bearer jwt",
        cookie: "rk_company=jwt",
      }),
    );
    const json = JSON.stringify(out);
    expect(json).not.toContain(SECRET);
    expect(json).not.toContain("csrf-token-value");
    expect(json).not.toContain("v1,signature");
    expect(json).not.toContain("203.0.113.7");
    expect(json).not.toContain("jwt");
    expect(out.headers).toEqual({
      host: "api.rothern.com",
      "user-agent": "Next.js Middleware",
      "accept-language": "en",
      "x-request-id": "abc",
    });
    for (const k of Object.keys(out.headers as object)) {
      expect(LOGGED_REQUEST_HEADERS as readonly string[]).toContain(k);
    }
  });

  it("still masks tokens in url, query and referer", () => {
    const out = serialize({
      ...fakeReq(
        { referer: "https://www.rothern.com/talep-davet?ref=reftoken123&l=x" },
        "/api/public/invite-preview?ref=reftoken123&l=x",
      ),
      query: { ref: "reftoken123", l: "x" },
    });
    const json = JSON.stringify(out);
    expect(json).not.toContain("reftoken123");
    expect(out.url).toBe("/api/public/invite-preview?ref=[redacted]&l=x");
    expect(out.method).toBe("GET");
    expect(out.id).toBe("req-1");
  });
});
