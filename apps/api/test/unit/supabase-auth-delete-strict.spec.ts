/**
 * `SupabaseAuthService.deleteUserStrict` - the delete that REPORTS its result
 * (removal of an expired unverified sign-up, owner decision 2026-10-08). The
 * caller deletes the database rows in the same transaction and commits only
 * when this resolves, so every answer matters:
 *  - deleted now                                   -> resolves;
 *  - the auth service's own `user_not_found`       -> resolves (retry of a run
 *    whose commit failed);
 *  - a 404 that is NOT the auth service's answer   -> throws (review CLEAN-2:
 *    a gateway that cannot route the request also answers 404; the user is
 *    still there and the row is the only place that knows the auth id);
 *  - the delete failed on our side, one look-up
 *    then answers `user_not_found`                 -> resolves (review CLEAN-3:
 *    the provider had acted; rolling back would keep a row with a dead id);
 *  - anything else                                 -> throws (the transaction
 *    rolls back).
 * The older `deleteUser` keeps its contract: it logs and never throws.
 */
jest.mock("../../src/instrument", () => ({ reportToSentry: jest.fn() }));

import type { ConfigService } from "@nestjs/config";
import { SupabaseAuthService } from "../../src/modules/supabase-auth/supabase-auth.service";

const USER_ID = "00000000-0000-4000-8000-000000000001";

function makeService(): SupabaseAuthService {
  const env: Record<string, string> = {
    SUPABASE_URL: "https://proj.supabase.co",
    SUPABASE_ANON_KEY: "anon-jwt",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-jwt",
  };
  return new SupabaseAuthService({ get: (k: string) => env[k] } as unknown as ConfigService);
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** The auth service's reply for a missing user, in both shapes auth-js reads. */
const notFoundLegacy = () => json(404, { code: 404, error_code: "user_not_found", msg: "User not found" });
const notFoundVersioned = () =>
  json(404, { code: "user_not_found", message: "User not found" }, { "x-supabase-api-version": "2024-01-01" });
/** What a gateway answers when it cannot route the path to the auth service. */
const gateway404 = () => json(404, { message: "no Route matched with those values" });
const userFound = () => json(200, { id: USER_ID, email: "ada@firma.com", aud: "authenticated" });

type Call = { url: string; method: string };
let calls: Call[];
let respond: (call: Call) => Promise<Response> | Response;
let fetchSpy: jest.SpyInstance;
let consoleSpy: jest.SpyInstance;

beforeEach(() => {
  calls = [];
  respond = () => json(200, {});
  fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const call = { url, method: init?.method ?? "GET" };
    calls.push(call);
    return respond(call);
  });
  // auth-js prints the raw fetch error before it wraps it.
  consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  fetchSpy.mockRestore();
  consoleSpy.mockRestore();
});

/** DELETE answers with `onDelete`, the follow-up look-up (GET) with `onLookup`. */
function answer(onDelete: () => Promise<Response> | Response, onLookup: () => Promise<Response> | Response) {
  respond = (call) => (call.method === "DELETE" ? onDelete() : onLookup());
}

const USER_PATH = `/auth/v1/admin/users/${USER_ID}`;

describe("deleteUserStrict", () => {
  it("resolves when the provider deleted the user (hard delete of that id, no look-up)", async () => {
    await expect(makeService().deleteUserStrict(USER_ID)).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "DELETE" });
    expect(calls[0]!.url).toContain(USER_PATH);
  });

  it.each([
    ["error_code in the body", notFoundLegacy],
    ["versioned reply (code in the body, API version header)", notFoundVersioned],
  ])("resolves when the user is already missing: %s (no look-up)", async (_name, reply) => {
    respond = reply;
    await expect(makeService().deleteUserStrict(USER_ID)).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  describe("a 404 that is not the auth service's own answer (CLEAN-2)", () => {
    it.each([
      ["gateway JSON without an error code", gateway404],
      ["HTML page", () => new Response("<html>404 Not Found</html>", { status: 404, headers: { "content-type": "text/html" } })],
      ["empty body", () => new Response("", { status: 404 })],
    ])("throws: %s", async (_name, reply) => {
      // The gateway answers the same for every path under /auth/v1.
      respond = reply;
      await expect(makeService().deleteUserStrict(USER_ID)).rejects.toThrow(/could not be deleted \(status=/);
    });

    it("throws although the status is 404, and says so", async () => {
      respond = gateway404;
      await expect(makeService().deleteUserStrict(USER_ID)).rejects.toThrow("status=404");
    });
  });

  describe("the delete failed on our side: one look-up decides (CLEAN-3)", () => {
    const failures: Array<[string, () => Promise<Response> | Response]> = [
      ["client time-out / network error", () => Promise.reject(new TypeError("fetch failed"))],
      ["gateway time-out (504)", () => json(504, { message: "upstream request timeout" })],
      ["outage (503)", () => json(503, { code: 503, msg: "upstream unavailable" })],
      ["unreadable answer (200 with a body that is not JSON)", () => new Response("<html></html>", { status: 200 })],
    ];

    it.each(failures)("%s, the provider no longer has the user -> resolves", async (_name, onDelete) => {
      answer(onDelete, notFoundVersioned);
      await expect(makeService().deleteUserStrict(USER_ID)).resolves.toBeUndefined();
      // Exactly one look-up, of the same user.
      expect(calls.map((c) => c.method)).toEqual(["DELETE", "GET"]);
      expect(calls[1]!.url).toContain(USER_PATH);
    });

    it.each(failures)("%s, the user is still there -> throws", async (_name, onDelete) => {
      answer(onDelete, userFound);
      await expect(makeService().deleteUserStrict(USER_ID)).rejects.toThrow(/could not be deleted/);
      expect(calls.map((c) => c.method)).toEqual(["DELETE", "GET"]);
    });

    it.each([
      ["the look-up fails too", () => Promise.reject(new TypeError("fetch failed"))],
      ["the look-up gets a gateway 404", gateway404],
      ["the look-up is rejected (key)", () => json(401, { message: "Invalid API key" })],
    ])("the delete timed out and %s -> throws", async (_name, onLookup) => {
      answer(() => Promise.reject(new TypeError("fetch failed")), onLookup);
      await expect(makeService().deleteUserStrict(USER_ID)).rejects.toThrow(/could not be deleted/);
    });
  });

  it.each([
    ["outage", () => json(503, { code: 503, msg: "upstream unavailable" })],
    ["server error", () => json(500, { code: 500, error_code: "unexpected_failure", msg: "boom" })],
    ["rejected key", () => json(401, { message: "Invalid API key" })],
    ["rate limit", () => json(429, { code: 429, error_code: "over_request_rate_limit", msg: "slow down" })],
  ])("throws on %s (the look-up gets the same answer)", async (_name, response) => {
    respond = response;
    await expect(makeService().deleteUserStrict(USER_ID)).rejects.toThrow(/could not be deleted/);
  });

  it("throws when the request itself fails (network error, timeout)", async () => {
    respond = () => Promise.reject(new TypeError("fetch failed"));
    await expect(makeService().deleteUserStrict(USER_ID)).rejects.toThrow();
  });

  it("throws for an id the provider cannot have issued, without any request", async () => {
    await expect(makeService().deleteUserStrict("not-a-uuid")).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("deleteUser (unchanged)", () => {
  it("still swallows a provider failure and asks nothing else", async () => {
    respond = () => json(503, { code: 503, msg: "upstream unavailable" });
    await expect(makeService().deleteUser(USER_ID)).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
  });
});
