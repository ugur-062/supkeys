/**
 * Push notifications (2026-10-14) - pure parts: service account env parsing,
 * FCM message builder, controller wiring and the CSRF exemption of the
 * session-less unregister call.
 */
import "reflect-metadata";
import type { ExecutionContext } from "@nestjs/common";
import { AUTH_COOKIE } from "../../src/common/auth/cookie";
import { CsrfGuard } from "../../src/common/auth/csrf.guard";
import { CompanyJwtAuthGuard } from "../../src/modules/company-auth/guards/company-jwt-auth.guard";
import { parseFirebaseServiceAccount } from "../../src/modules/push/push-config";
import {
  absolutePushUrl,
  buildPushMessage,
  truncatePushBody,
} from "../../src/modules/push/push-message";
import { PushDeviceController } from "../../src/modules/push/push.controller";

const PEM = "-----BEGIN PRIVATE KEY-----\nMIIEsecretsecret\n-----END PRIVATE KEY-----\n";
const ACCOUNT = {
  type: "service_account",
  project_id: "rothern-test",
  client_email: "push@rothern-test.iam.gserviceaccount.com",
  private_key: PEM,
};

describe("parseFirebaseServiceAccount", () => {
  it("raw JSON and base64 of the JSON both work", () => {
    const json = JSON.stringify(ACCOUNT);
    const expected = {
      status: "ok",
      account: {
        projectId: "rothern-test",
        clientEmail: ACCOUNT.client_email,
        privateKey: PEM,
      },
    };
    expect(parseFirebaseServiceAccount(json)).toEqual(expected);
    expect(parseFirebaseServiceAccount(`  ${json}\n`)).toEqual(expected);
    expect(parseFirebaseServiceAccount(Buffer.from(json).toString("base64"))).toEqual(expected);
  });

  it("a key with literal \\n (single-line paste) gets real newlines", () => {
    const flat = JSON.stringify({ ...ACCOUNT, private_key: PEM.replace(/\n/g, "\\n") });
    const res = parseFirebaseServiceAccount(flat);
    expect(res.status).toBe("ok");
    expect(res.status === "ok" && res.account.privateKey).toBe(PEM);
  });

  it("missing vs invalid; the reason never carries the value", () => {
    expect(parseFirebaseServiceAccount(undefined)).toEqual({ status: "missing" });
    expect(parseFirebaseServiceAccount("   ")).toEqual({ status: "missing" });
    const bad = [
      "not json at all!",
      "{broken",
      Buffer.from("plain text").toString("base64"),
      JSON.stringify([ACCOUNT]),
      JSON.stringify({ ...ACCOUNT, type: "authorized_user" }),
      JSON.stringify({ ...ACCOUNT, private_key: "" }),
      JSON.stringify({ ...ACCOUNT, client_email: undefined }),
      JSON.stringify({ ...ACCOUNT, private_key: "secretsecret" }),
    ];
    for (const value of bad) {
      const res = parseFirebaseServiceAccount(value);
      expect(res.status).toBe("invalid");
      expect(JSON.stringify(res)).not.toContain("secret");
    }
  });
});

describe("push message", () => {
  it("body is cut to 200 characters with an ellipsis (code point safe)", () => {
    expect(truncatePushBody("short")).toBe("short");
    expect(truncatePushBody("x".repeat(200))).toBe("x".repeat(200));
    const cut = truncatePushBody("x".repeat(201));
    expect(Array.from(cut)).toHaveLength(200);
    expect(cut.endsWith("…")).toBe(true);
    const emoji = truncatePushBody("\u{1F600}".repeat(300));
    expect(Array.from(emoji)).toHaveLength(200);
    expect(emoji).not.toContain("�");
  });

  it("ctaUrl becomes absolute; odd values are dropped", () => {
    expect(absolutePushUrl("/company/ilan/1", "https://www.rothern.com/")).toBe(
      "https://www.rothern.com/company/ilan/1",
    );
    expect(absolutePushUrl("https://www.rothern.com/en/company", "https://x")).toBe(
      "https://www.rothern.com/en/company",
    );
    expect(absolutePushUrl(null, "https://x")).toBeNull();
    expect(absolutePushUrl("", "https://x")).toBeNull();
    expect(absolutePushUrl("//evil.example/x", "https://x")).toBeNull();
    expect(absolutePushUrl("javascript:alert(1)", "https://x")).toBeNull();
  });

  it("builds the contract message", () => {
    const m = buildPushMessage(
      { companyUserId: "u", type: "bid_awarded", title: "T", body: "B", ctaUrl: "/company" },
      ["a", "b"],
      "https://www.rothern.com",
    );
    expect(m).toEqual({
      tokens: ["a", "b"],
      notification: { title: "T", body: "B" },
      data: { type: "bid_awarded", url: "https://www.rothern.com/company" },
      android: {
        priority: "high",
        notification: { channelId: "default", icon: "ic_stat_rothern", color: "#0A0A0A" },
      },
      apns: { payload: { aps: { sound: "default" } } },
    });
  });

  it("a row without a usable target still opens the notifications list", () => {
    for (const ctaUrl of [null, "", "//evil.example/x"]) {
      const m = buildPushMessage(
        { companyUserId: "u", type: "seat_selection", title: "T", body: "B", ctaUrl },
        ["a"],
        "https://www.rothern.com/",
      );
      expect(m.data).toEqual({
        type: "seat_selection",
        url: "https://www.rothern.com/company/bildirimler",
      });
    }
  });
});

describe("PushDeviceController wiring", () => {
  const PATH = "path";
  const GUARDS = "__guards__";
  const proto = PushDeviceController.prototype;

  it("company-auth/push-devices: register is guarded, unregister is not; both throttled 20/min", () => {
    expect(Reflect.getMetadata(PATH, PushDeviceController)).toBe("company-auth/push-devices");
    expect(Reflect.getMetadata(PATH, proto.register)).toBe("/");
    expect(Reflect.getMetadata(PATH, proto.unregister)).toBe("unregister");
    expect(Reflect.getMetadata(GUARDS, proto.register)).toEqual([CompanyJwtAuthGuard]);
    expect(Reflect.getMetadata(GUARDS, proto.unregister)).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS, PushDeviceController)).toBeUndefined();
    for (const handler of [proto.register, proto.unregister]) {
      expect(Reflect.getMetadata("THROTTLER:LIMITauth", handler)).toBe(20);
      expect(Reflect.getMetadata("THROTTLER:TTLauth", handler)).toBe(60_000);
      expect(Reflect.getMetadata("__httpCode__", handler)).toBe(200);
    }
  });
});

describe("CSRF: unregister works with a stale session cookie, register does not skip CSRF", () => {
  const saved = process.env.COOKIE_SAMESITE;
  beforeEach(() => {
    process.env.COOKIE_SAMESITE = "lax";
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.COOKIE_SAMESITE;
    else process.env.COOKIE_SAMESITE = saved;
  });
  const ctx = (path: string) =>
    ({
      getType: () => "http",
      switchToHttp: () => ({
        getRequest: () => ({
          method: "POST",
          path,
          // Stale auth cookie, CSRF cookie gone, no header.
          headers: { cookie: `${AUTH_COOKIE.company}=jwt.jwt.jwt` },
        }),
      }),
    }) as unknown as ExecutionContext;
  const guard = new CsrfGuard();

  it("unregister passes", () => {
    expect(guard.canActivate(ctx("/api/company-auth/push-devices/unregister"))).toBe(true);
  });
  it("register still needs the double submit", () => {
    expect(() => guard.canActivate(ctx("/api/company-auth/push-devices"))).toThrow(/CSRF/);
  });
});
