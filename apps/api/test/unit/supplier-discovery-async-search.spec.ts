/**
 * ASYNCHRONOUS WEB SEARCH (live re-check 2026-10-09, N1) - contract.
 *
 * Measured on the live stack: the grounded research took 70-80 s at daytime and
 * the JSON conversion 15-18 s; the synchronous endpoint has to end below the
 * proxy's 100 s, so a Turkey-only request (ONE pass, no partial result to fall
 * back on) ended 503 twice in a row - once with the research already answered
 * and paid, its text thrown away because the conversion was cut.
 *
 *  - `POST …/external/start` answers `{ searchId }` at once, the search runs
 *    in the background; `GET …/external/searches/:searchId` reports RUNNING,
 *    DONE (+ the body of the synchronous endpoint) or FAILED (+ its error body);
 *  - what is known before the provider is called is answered directly (access,
 *    registry bounds, a budget refusal of the whole search);
 *  - generous limits (research 120 s, pass 170 s); a conversion that failed or
 *    timed out is called again with the SAME research text - the research is
 *    never paid twice; a research that failed is attempted once more;
 *  - passes stay independent (partial result), the synchronous endpoint and the
 *    background run keep their behaviour;
 *  - a FAILED search is reported to Sentry once (round 6 review, R6-5): its
 *    failure is read through a poll that answers 200, so no error filter sees it.
 * The registry itself: `external-search-registry.spec.ts`.
 */
import "reflect-metadata";
import { BadGatewayException, ForbiddenException, RequestMethod } from "@nestjs/common";
import {
  ASYNC_SEARCH_CLIENT_STOP_MS,
  ASYNC_SEARCH_LIMITS,
  ASYNC_SEARCH_TIMING,
  BACKGROUND_SEARCH_TIMING,
  INTERACTIVE_SEARCH_TIMING,
  START_REFUSAL_WAIT_MS,
  SupplierDiscoveryService,
  externalSearchError,
  externalSearchKey,
  worstSearchMs,
  type DiscoveryAiRunner,
} from "../../src/modules/ai/supplier-discovery/supplier-discovery.service";
import {
  SEARCH_STATUS_POLLS_PER_MINUTE,
  SupplierDiscoveryController,
} from "../../src/modules/ai/supplier-discovery/supplier-discovery.controller";
import { ExternalSearchRegistry } from "../../src/modules/ai/supplier-discovery/external-search-registry";
import { COMPANY_PERMISSION_KEY } from "../../src/modules/company-auth/decorators/require-company-permission.decorator";
import { AiTimeoutException } from "../../src/modules/ai/ai.service";
import { AiBudgetExceededException } from "../../src/modules/ai/ai-budget.service";
import { i18nMessage } from "../../src/common/i18n/http-i18n";
import { currentLocale, runWithLocale } from "../../src/common/i18n/locale-context";
import { getCurrentCompanyId } from "../../src/common/tenant/tenant-context";
import { reportToSentry } from "../../src/instrument";

// Sentry is off in tests (no DSN): the reporting call itself is observed.
jest.mock("../../src/instrument", () => ({ reportToSentry: jest.fn() }));
const sentry = reportToSentry as jest.MockedFunction<typeof reportToSentry>;
beforeEach(() => sentry.mockClear());

const MIN = 60_000;
const user = { userId: "u1", companyId: "c1", tier: "GOLD" } as never;
const colleague = { userId: "u2", companyId: "c1", tier: "GOLD" } as never;

type Call = { responseSchema?: object; prompt: string; timeoutMs?: number; deadlineAt?: number; webSearch?: boolean };
type Outcome = string | Error | Promise<string>;

const co = (name: string, email: string, country = "TR") => ({ name, email, country, reason: "r" });
const json = (...companies: unknown[]) => JSON.stringify({ companies });
const BORU = json(co("Boru A.Ş.", "x@boru.com"));
const TUBI = json(co("Tubi Srl", "info@tubi.it", "IT"));
const abroad = (prompt: string) => prompt.includes("DIŞINDA") || prompt.includes("ABROAD research");
const timeout = () => new AiTimeoutException(i18nMessage("api.ai.aiIstegiZamanAsiminaUgradiLutfen"));
const budget = () => new AiBudgetExceededException(i18nMessage("api.ai.budget.pool", undefined, "AI_BUDGET_EXCEEDED"));

/** A value the test hands over later (a call that is still running). */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * The real service over a mocked database and model. `research` / `parse`
 * decide every call: a text, an error to throw, or a promise the test resolves.
 * `nth` counts the calls of that stage for that pass (1 = first).
 */
function rig(opts: {
  /** The request's own countries; one country = one pass (LOCAL). Default: every country = two passes. */
  targetCountries?: string[];
  research?: (call: { abroad: boolean; nth: number }) => Outcome;
  parse?: (call: { abroad: boolean; nth: number }) => Outcome;
  /** Injected clock of the registry (retention / limit tests). */
  now?: () => number;
}) {
  const prisma = {
    listing: { findFirst: jest.fn().mockResolvedValue({ targetCountries: opts.targetCountries ?? [] }) },
    company: { findUnique: jest.fn().mockResolvedValue({ country: "TR" }), findMany: jest.fn().mockResolvedValue([]) },
    companyConnection: { findMany: jest.fn().mockResolvedValue([]) },
    category: { findMany: jest.fn().mockResolvedValue([{ nameTr: "Çelik borular", nameEn: "Steel pipes", nameRu: null }]) },
    referralOptOut: { findMany: jest.fn().mockResolvedValue([]) },
    companyUser: { findMany: jest.fn().mockResolvedValue([]) },
    externalListingInvite: { findMany: jest.fn().mockResolvedValue([]) },
    listingInvitation: { findMany: jest.fn().mockResolvedValue([]) },
    emailLog: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const seen = new Map<string, number>();
  /** Locale / company the model call ran under (the background work must keep the request's). */
  const contexts: Array<{ locale: string; companyId: string | null }> = [];
  const ai = {
    assertAiAccess: jest.fn(),
    callAi: jest.fn(async (_u: unknown, o: Call) => {
      contexts.push({ locale: currentLocale(), companyId: getCurrentCompanyId() });
      const stage = o.responseSchema ? "parse" : "research";
      const isAbroad = abroad(o.prompt);
      const key = `${stage}:${isAbroad}`;
      const nth = (seen.get(key) ?? 0) + 1;
      seen.set(key, nth);
      const decide = stage === "research" ? opts.research : opts.parse;
      const outcome = decide?.({ abroad: isAbroad, nth }) ?? (stage === "research" ? null : isAbroad ? TUBI : BORU);
      if (outcome instanceof Error) throw outcome;
      const text = outcome === null ? (isAbroad ? "ABROAD research" : "LOCAL research") : await outcome;
      return { text };
    }),
  };
  const service = new SupplierDiscoveryService(prisma as never, ai as never);
  service.mxCheck = async () => true;
  // No real waiting: every mocked refusal arrives within microtasks.
  service.startRefusalWaitMs = 15;
  if (opts.now) service.searches = new ExternalSearchRegistry(ASYNC_SEARCH_LIMITS, opts.now);
  const calls = (stage: "research" | "parse") =>
    ai.callAi.mock.calls.map((c) => c[1] as Call).filter((o) => (stage === "parse") === !!o.responseSchema);
  return { service, ai, prisma, calls, contexts };
}

const ALL = { type: "ALIM" as const, categoryIds: ["40141700"] };
/** A request open to Turkey only: ONE pass - the case that failed live. */
const TURKEY_ONLY = { ...ALL, listingId: "l1" };

/** Lets every pending promise continuation run (the mocked calls never wait on a timer). */
const flush = () => new Promise<void>((r) => setImmediate(r));

/** Polls until the search is no longer RUNNING. */
async function finished(service: SupplierDiscoveryService, searchId: string, as: never = user) {
  for (let i = 0; i < 200; i++) {
    const view = service.externalSearchStatus(as, searchId);
    if (view.status !== "RUNNING") return view;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("search still RUNNING");
}

describe("N1 — start / poll lifecycle", () => {
  it("start answers the id while the research is still running; the poll says RUNNING, then DONE with exactly the body of the synchronous endpoint", async () => {
    const gate = deferred<string>();
    const { service, ai } = rig({ research: ({ abroad: a }) => (a ? gate.promise : "LOCAL research") });
    const before = Date.now();
    const { searchId } = await service.startExternalSearch(user, ALL);
    expect(typeof searchId).toBe("string");
    const running = service.externalSearchStatus(user, searchId);
    expect(running.status).toBe("RUNNING");
    expect(running).not.toHaveProperty("result");
    expect(running).not.toHaveProperty("error");
    expect(Date.parse(running.startedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(running.startedAt)).toBeLessThanOrEqual(Date.now());

    gate.resolve("ABROAD research");
    const done = await finished(service, searchId);
    expect(done.status).toBe("DONE");
    expect(done).not.toHaveProperty("error");
    const sync = await rig({}).service.discoverExternal(user, ALL);
    expect(done.result).toEqual(sync);
    expect(done.result!.companies.map((c) => [c.name, c.scope, c.status])).toEqual([
      ["Boru A.Ş.", "LOCAL", "SUGGESTED"],
      ["Tubi Srl", "ABROAD", "SUGGESTED"],
    ]);
    expect([done.result!.incompleteScopes, done.result!.incompleteReasons, done.result!.incompleteMessages]).toEqual([[], {}, {}]);
    // One search: polling again reads the kept result, nothing is searched (or paid) twice.
    expect(service.externalSearchStatus(user, searchId).result).toEqual(sync);
    expect(ai.callAi).toHaveBeenCalledTimes(4);
  });

  it("a search with nothing to search (no category, no item) is DONE and empty without a model call", async () => {
    const { service, ai } = rig({});
    const { searchId } = await service.startExternalSearch(user, { type: "ALIM" });
    const done = await finished(service, searchId);
    expect(done.result).toMatchObject({ companies: [], incompleteScopes: [] });
    expect(ai.callAi).not.toHaveBeenCalled();
  });

  it("the calls go out with the asynchronous limits: research 120 s, a conversion call 40 s inside the 170 s pass", async () => {
    const { service, calls } = rig({ targetCountries: ["TR"] });
    const before = Date.now();
    const { searchId } = await service.startExternalSearch(user, TURKEY_ONLY);
    await finished(service, searchId);
    const after = Date.now();
    expect(calls("research")).toHaveLength(1);
    expect(calls("research")[0]).toMatchObject({ timeoutMs: 120_000, webSearch: true });
    expect(calls("research")[0]!.deadlineAt).toBeGreaterThanOrEqual(before + 120_000);
    expect(calls("research")[0]!.deadlineAt).toBeLessThanOrEqual(after + 120_000);
    expect(calls("parse")[0]!.timeoutMs).toBe(40_000);
    expect(calls("parse")[0]!.deadlineAt).toBeGreaterThanOrEqual(before + 40_000);
    expect(calls("parse")[0]!.deadlineAt).toBeLessThanOrEqual(after + 40_000);
  });

  it("the background work keeps the company and the language of the request that started it", async () => {
    const gate = deferred<string>();
    const { service, contexts } = rig({ targetCountries: ["TR"], research: () => gate.promise });
    // Started in an English request…
    const { searchId } = await runWithLocale("en", () => service.startExternalSearch(user, TURKEY_ONLY));
    // …and still running after that request is over (this code runs outside it).
    expect(currentLocale()).toBe("tr");
    gate.resolve("LOCAL research");
    await finished(service, searchId);
    expect(contexts).toEqual([
      { locale: "en", companyId: "c1" },
      { locale: "en", companyId: "c1" },
    ]);
  });
});

describe("N1 — who may read a search", () => {
  it("404 for an unknown id and for another user's search (the two are not told apart)", async () => {
    const { service } = rig({ targetCountries: ["TR"] });
    const { searchId } = await service.startExternalSearch(user, TURKEY_ONLY);
    await finished(service, searchId);
    const unknown = (() => {
      try {
        service.externalSearchStatus(user, "00000000-0000-4000-8000-000000000000");
      } catch (err) {
        return err as { getStatus(): number; getResponse(): unknown };
      }
      throw new Error("expected 404");
    })();
    const foreign = (() => {
      try {
        service.externalSearchStatus(colleague, searchId);
      } catch (err) {
        return err as { getStatus(): number; getResponse(): unknown };
      }
      throw new Error("expected 404");
    })();
    expect(unknown.getStatus()).toBe(404);
    expect(foreign.getStatus()).toBe(404);
    expect(foreign.getResponse()).toEqual(unknown.getResponse());
    expect(unknown.getResponse()).toMatchObject({
      code: "DISCOVERY_SEARCH_NOT_FOUND",
      message: "Arama bulunamadı ya da süresi doldu — yeniden arayın.",
    });
    // The owner still reads it.
    expect(service.externalSearchStatus(user, searchId).status).toBe("DONE");
  });

  it("a finished search is kept 15 minutes, then the poll gets 404", async () => {
    let now = Date.parse("2026-10-09T14:00:00Z");
    const { service } = rig({ targetCountries: ["TR"], now: () => now });
    const { searchId } = await service.startExternalSearch(user, TURKEY_ONLY);
    await finished(service, searchId);
    now += 15 * MIN - 1;
    expect(service.externalSearchStatus(user, searchId).status).toBe("DONE");
    now += 1;
    expect(() => service.externalSearchStatus(user, searchId)).toThrow(expect.objectContaining({ status: 404 }));
  });
});

describe("N1 — inside a pass: the paid research is never thrown away", () => {
  it("conversion timed out, research had answered → ONLY the conversion is called again, with the same research text; the search is DONE", async () => {
    const { service, calls } = rig({
      targetCountries: ["TR"],
      research: () => "Research text of the day: Boru A.Ş., x@boru.com",
      parse: ({ nth }) => (nth === 1 ? timeout() : BORU),
    });
    const { searchId } = await service.startExternalSearch(user, TURKEY_ONLY);
    const done = await finished(service, searchId);
    expect(done.status).toBe("DONE");
    expect(done.result!.companies.map((c) => c.name)).toEqual(["Boru A.Ş."]);
    expect(done.result!.incompleteScopes).toEqual([]);
    // The live failure: research 71 s answered, conversion cut -> 503 and the research was paid again on "search again".
    expect(calls("research")).toHaveLength(1);
    expect(calls("parse")).toHaveLength(2);
    expect(calls("parse")[1]!.prompt).toBe(calls("parse")[0]!.prompt);
    expect(calls("parse")[1]!.prompt).toContain("Research text of the day");
  });

  it("an unreadable conversion answer is retried the same way", async () => {
    const { service, calls } = rig({ targetCountries: ["TR"], parse: ({ nth }) => (nth === 1 ? "{not json" : BORU) });
    const { searchId } = await service.startExternalSearch(user, TURKEY_ONLY);
    expect((await finished(service, searchId)).result!.companies.map((c) => c.name)).toEqual(["Boru A.Ş."]);
    expect([calls("research").length, calls("parse").length]).toEqual([1, 2]);
  });

  it("the conversion fails twice → the pass has failed; the research is NOT run (and paid) a second time", async () => {
    const { service, calls } = rig({ targetCountries: ["TR"], parse: () => timeout() });
    const { searchId } = await service.startExternalSearch(user, TURKEY_ONLY);
    const failed = await finished(service, searchId);
    expect(failed.status).toBe("FAILED");
    expect([calls("research").length, calls("parse").length]).toEqual([1, 2]);
  });

  it("a conversion refused by the budget is not called again", async () => {
    const { service, calls } = rig({ parse: ({ abroad: a }) => (a ? budget() : BORU) });
    const { searchId } = await service.startExternalSearch(user, ALL);
    const done = await finished(service, searchId);
    expect(done.result!.incompleteReasons).toEqual({ ABROAD: "BUDGET" });
    expect([calls("research").length, calls("parse").length]).toEqual([2, 2]);
  });

  it("the research itself failed → the pass is attempted once more (new research + conversion)", async () => {
    const { service, calls } = rig({ targetCountries: ["TR"], research: ({ nth }) => (nth === 1 ? timeout() : "LOCAL research") });
    const { searchId } = await service.startExternalSearch(user, TURKEY_ONLY);
    const done = await finished(service, searchId);
    expect(done.status).toBe("DONE");
    expect(done.result!.companies.map((c) => c.name)).toEqual(["Boru A.Ş."]);
    expect([calls("research").length, calls("parse").length]).toEqual([2, 1]);
  });

  it("…and only once: a research that fails twice fails the pass (2 research calls, no conversion)", async () => {
    const { service, calls } = rig({ targetCountries: ["TR"], research: () => timeout() });
    const { searchId } = await service.startExternalSearch(user, TURKEY_ONLY);
    expect((await finished(service, searchId)).status).toBe("FAILED");
    expect([calls("research").length, calls("parse").length]).toEqual([2, 0]);
  });

  it("after a retried research the conversion still has its own retry", async () => {
    const { service, calls } = rig({
      targetCountries: ["TR"],
      research: ({ nth }) => (nth === 1 ? new Error("provider down") : "LOCAL research"),
      parse: ({ nth }) => (nth === 1 ? "{not json" : BORU),
    });
    const { searchId } = await service.startExternalSearch(user, TURKEY_ONLY);
    expect((await finished(service, searchId)).status).toBe("DONE");
    expect([calls("research").length, calls("parse").length]).toEqual([2, 2]);
  });

  it("searchWeb: every call is counted as paid - the failed conversion and its retry included, the research once", async () => {
    const { service } = rig({});
    const costs: string[] = [];
    let parse = 0;
    const runner: DiscoveryAiRunner = async (o) => {
      costs.push(o.stage);
      if (o.stage === "research") return { text: "research", costUsd: 0.05 };
      return { text: parse++ === 0 ? "{not json" : BORU, costUsd: 0.01 };
    };
    const out = await service.searchWeb(
      { buyerCountry: "TR", targetCountries: ["TR"], categoryIds: ["40141700"], itemNames: [], locale: "tr" },
      runner,
      ASYNC_SEARCH_TIMING,
    );
    expect(costs).toEqual(["research", "parse", "parse"]);
    expect(out.costUsd).toBeCloseTo(0.07);
    expect(out.failedPasses).toEqual([]);
  });

  it("the synchronous endpoint and the background run are unchanged: no conversion-only retry there", async () => {
    // Synchronous: one research, one conversion, then the request fails (it has no time for more).
    const sync = rig({ targetCountries: ["TR"], parse: () => "{not json" });
    await expect(sync.service.discoverExternal(user, TURKEY_ONLY)).rejects.toMatchObject({ status: 503 });
    expect([sync.calls("research").length, sync.calls("parse").length]).toEqual([1, 1]);
    expect(INTERACTIVE_SEARCH_TIMING).toEqual({ researchTimeoutMs: 82_000, passBudgetMs: 91_000, retries: 0 });
    // Background run: a failed conversion still fails the attempt and the whole pass is attempted again.
    expect(BACKGROUND_SEARCH_TIMING).toEqual({ researchTimeoutMs: 120_000, passBudgetMs: 150_000, retries: 1 });
    const stages: string[] = [];
    let parse = 0;
    const runner: DiscoveryAiRunner = async (o) => {
      stages.push(o.stage);
      if (o.stage === "research") return { text: "research" };
      return { text: parse++ === 0 ? "{not json" : BORU };
    };
    await rig({}).service.searchWeb(
      { buyerCountry: "TR", targetCountries: ["TR"], categoryIds: ["40141700"], itemNames: [], locale: "tr" },
      runner,
      BACKGROUND_SEARCH_TIMING,
    );
    expect(stages).toEqual(["research", "parse", "research", "parse"]);
  });
});

describe("N1 — partial result and failure", () => {
  it("one pass fails after its retry, the other answers → DONE with the answering pass and the missing scope (partial result, unchanged)", async () => {
    const { service, calls } = rig({ research: ({ abroad: a }) => (a ? timeout() : "LOCAL research") });
    const { searchId } = await service.startExternalSearch(user, ALL);
    const done = await finished(service, searchId);
    expect(done.status).toBe("DONE");
    expect(done.result!.companies.map((c) => [c.name, c.scope])).toEqual([["Boru A.Ş.", "LOCAL"]]);
    expect(done.result!.searchedScopes).toEqual(["LOCAL", "ABROAD"]);
    expect(done.result!.incompleteScopes).toEqual(["ABROAD"]);
    expect(done.result!.incompleteReasons).toEqual({ ABROAD: "TIMEOUT" });
    // The failed research was attempted twice, the answering pass once.
    expect([calls("research").length, calls("parse").length]).toEqual([3, 1]);
  });

  it("`scopes`: only the missing pass is searched again", async () => {
    const { service, calls } = rig({});
    const { searchId } = await service.startExternalSearch(user, { ...ALL, scopes: ["ABROAD"] });
    const done = await finished(service, searchId);
    expect(done.result!.searchedScopes).toEqual(["ABROAD"]);
    expect(done.result!.companies.map((c) => c.name)).toEqual(["Tubi Srl"]);
    expect([calls("research").length, calls("parse").length]).toEqual([1, 1]);
  });

  it("every pass fails → FAILED with the error body the synchronous endpoint would have sent (status + message), no `result`", async () => {
    const timedOut = rig({ research: () => timeout() });
    const a = await finished(timedOut.service, (await timedOut.service.startExternalSearch(user, ALL)).searchId);
    expect(a).toEqual({
      status: "FAILED",
      startedAt: expect.any(String),
      error: { statusCode: 503, message: "AI isteği zaman aşımına uğradı — lütfen tekrar deneyin." },
    });

    const provider = rig({ research: () => new BadGatewayException(i18nMessage("api.ai.saglayiciHataDondurdu")) });
    const b = await finished(provider.service, (await provider.service.startExternalSearch(user, ALL)).searchId);
    expect(b.error).toEqual({ statusCode: 502, message: "AI sağlayıcısı hata döndürdü — lütfen tekrar deneyin." });
  });

  it("an unexpected error says nothing internal: 500 with the generic text", async () => {
    const { service } = rig({ targetCountries: ["TR"], research: () => new Error("connect ECONNREFUSED 10.0.0.5:5432") });
    const failed = await finished(service, (await service.startExternalSearch(user, TURKEY_ONLY)).searchId);
    expect(failed.error).toEqual({ statusCode: 500, message: "Web araması tamamlanamadı — lütfen tekrar deneyin." });
  });

  it("the error text is in the language of the START request, whoever polls later", async () => {
    const { service } = rig({ targetCountries: ["TR"], research: () => timeout() });
    const { searchId } = await runWithLocale("en", () => service.startExternalSearch(user, TURKEY_ONLY));
    const failed = await runWithLocale("ru", () => finished(service, searchId));
    expect(failed.error).toEqual({ statusCode: 503, message: "The AI request timed out — please try again." });

    const generic = rig({ targetCountries: ["TR"], research: () => new Error("boom") });
    const g = await runWithLocale("ru", () => generic.service.startExternalSearch(user, TURKEY_ONLY));
    expect((await finished(generic.service, g.searchId)).error).toEqual({
      statusCode: 500,
      message: "Не удалось завершить поиск в интернете — пожалуйста, повторите попытку.",
    });
  });

  it("externalSearchError keeps status, machine code and text of an HTTP error", () => {
    expect(externalSearchError(budget(), "generic")).toEqual({
      statusCode: 403,
      code: "AI_BUDGET_EXCEEDED",
      message: "Firmanızın aylık AI bütçesi doldu — AI özellikleri gelecek ay yeniden açılır.",
    });
    expect(externalSearchError(new ForbiddenException(), "generic")).toEqual({ statusCode: 403, message: "Forbidden" });
    expect(externalSearchError("not an error", "generic")).toEqual({ statusCode: 500, message: "generic" });
  });

  it("a search that outlives its limit ends FAILED (never RUNNING for ever) and a late answer does not revive it", async () => {
    let now = Date.parse("2026-10-09T14:00:00Z");
    const gate = deferred<string>();
    const { service } = rig({ targetCountries: ["TR"], research: () => gate.promise, now: () => now });
    const { searchId } = await service.startExternalSearch(user, TURKEY_ONLY);
    now += ASYNC_SEARCH_LIMITS.maxRunMs - 1;
    expect(service.externalSearchStatus(user, searchId).status).toBe("RUNNING");
    now += 1;
    const failed = service.externalSearchStatus(user, searchId);
    expect(failed).toMatchObject({
      status: "FAILED",
      error: { statusCode: 503, message: "AI isteği zaman aşımına uğradı — lütfen tekrar deneyin." },
    });
    gate.resolve("LOCAL research");
    await new Promise((r) => setTimeout(r, 20));
    expect(service.externalSearchStatus(user, searchId).status).toBe("FAILED");
  });
});

describe("R6-5 — a FAILED asynchronous search reaches Sentry (the poll answers 200, no error filter sees it)", () => {
  /** Tags of every reported event, in order. */
  const reported = () => sentry.mock.calls.map(([message, level, context]) => ({ message, level, tags: context?.tags }));
  /** A request whose texts must never travel with the event. */
  const WITH_TEXT = { ...TURKEY_ONLY, itemNames: ["Paslanmaz boru 2 inc"], region: "Marmara" };

  it("timeout 503, provider 502 and an unexpected error (500): one event each, tagged for the alert rules, nothing of the request in it", async () => {
    const timedOut = rig({ targetCountries: ["TR"], research: () => timeout() });
    await finished(timedOut.service, (await timedOut.service.startExternalSearch(user, WITH_TEXT)).searchId);
    const provider = rig({ targetCountries: ["TR"], research: () => new BadGatewayException(i18nMessage("api.ai.saglayiciHataDondurdu")) });
    await finished(provider.service, (await provider.service.startExternalSearch(user, WITH_TEXT)).searchId);
    const broken = rig({ targetCountries: ["TR"], research: () => new Error("connect ECONNREFUSED 10.0.0.5:5432") });
    const brokenId = (await broken.service.startExternalSearch(user, WITH_TEXT)).searchId;
    await finished(broken.service, brokenId);

    const tags = (status: string) => ({ feature: "supplier_discovery_async", http_status: status, run_limit: "no" });
    expect(reported()).toEqual([
      { message: "supplier discovery async search failed: HTTP 503", level: "error", tags: tags("503") },
      { message: "supplier discovery async search failed: HTTP 502", level: "error", tags: tags("502") },
      { message: "supplier discovery async search failed: HTTP 500", level: "error", tags: tags("500") },
    ]);
    // The cause is there for whoever reads the event; the request is not.
    expect(sentry.mock.calls[2]![2]!.extra).toMatchObject({ companyId: "c1", name: "Error", error: "connect ECONNREFUSED 10.0.0.5:5432" });
    for (const [, , context] of sentry.mock.calls) {
      expect(Object.keys(context!.extra!).sort()).toEqual(["companyId", "error", "name", "stack"]);
    }
    const sent = JSON.stringify(sentry.mock.calls);
    expect(sent).not.toContain("Paslanmaz");
    expect(sent).not.toContain("Marmara");
    // Polling the failed search again reports nothing more.
    expect(broken.service.externalSearchStatus(user, brokenId).status).toBe("FAILED");
    expect(sentry).toHaveBeenCalledTimes(3);
  });

  it("the registry gives a search up at its run limit: reported once, also when the work fails later", async () => {
    let now = Date.parse("2026-10-09T14:00:00Z");
    let fail!: (err: Error) => void;
    const hung = new Promise<string>((_, reject) => {
      fail = reject;
    });
    const { service } = rig({ targetCountries: ["TR"], research: () => hung, now: () => now });
    const { searchId } = await service.startExternalSearch(user, TURKEY_ONLY);
    now += ASYNC_SEARCH_LIMITS.maxRunMs - 1;
    expect(service.externalSearchStatus(user, searchId).status).toBe("RUNNING");
    expect(sentry).not.toHaveBeenCalled();
    now += 1;
    expect(service.externalSearchStatus(user, searchId).status).toBe("FAILED");
    expect(service.externalSearchStatus(user, searchId).status).toBe("FAILED");
    expect(reported()).toEqual([
      {
        message: "supplier discovery async search given up at its run limit: HTTP 503",
        level: "error",
        tags: { feature: "supplier_discovery_async", http_status: "503", run_limit: "yes" },
      },
    ]);
    // The hung call ends at last - the search was already reported.
    fail(timeout());
    await new Promise((r) => setTimeout(r, 20));
    expect(service.externalSearchStatus(user, searchId).status).toBe("FAILED");
    expect(sentry).toHaveBeenCalledTimes(1);
  });

  it("not reported: a search that is DONE, one that is DONE with a missing pass, and a refusal (4xx) - early or late", async () => {
    const ok = rig({});
    await finished(ok.service, (await ok.service.startExternalSearch(user, ALL)).searchId);
    const partial = rig({ research: ({ abroad: a }) => (a ? timeout() : "LOCAL research") });
    expect((await finished(partial.service, (await partial.service.startExternalSearch(user, ALL)).searchId)).status).toBe("DONE");
    // Refused by the budget at once: answered directly by start.
    const refused = rig({ research: () => budget() });
    await expect(refused.service.startExternalSearch(user, ALL)).rejects.toMatchObject({ status: 403 });
    // Refused after the start had answered: FAILED with the 403 body.
    const gate = deferred<string>();
    const late = rig({ targetCountries: ["TR"], research: () => gate.promise, parse: () => budget() });
    const { searchId } = await late.service.startExternalSearch(user, TURKEY_ONLY);
    gate.resolve("LOCAL research");
    expect((await finished(late.service, searchId)).error).toMatchObject({ statusCode: 403, code: "AI_BUDGET_EXCEEDED" });
    expect(sentry).not.toHaveBeenCalled();
  });

  it("the synchronous endpoint reports nothing itself (its error is thrown to the error filter)", async () => {
    const sync = rig({ targetCountries: ["TR"], research: () => timeout() });
    await expect(sync.service.discoverExternal(user, TURKEY_ONLY)).rejects.toMatchObject({ status: 503 });
    expect(sentry).not.toHaveBeenCalled();
  });
});

describe("N1 — answered directly by start (known before the provider is called)", () => {
  it("no AI access (package, permission, AI not configured): the refusal is thrown, nothing is registered, nothing is called", async () => {
    const { service, ai } = rig({});
    ai.assertAiAccess.mockImplementation(() => {
      throw new ForbiddenException("no access");
    });
    await expect(service.startExternalSearch(user, ALL)).rejects.toMatchObject({ status: 403 });
    expect(service.searches.size).toBe(0);
    expect(ai.callAi).not.toHaveBeenCalled();
  });

  it("the budget refuses the WHOLE search → 403 with the budget text straight from start; the search is not registered", async () => {
    const { service, calls } = rig({ research: () => budget() });
    await expect(service.startExternalSearch(user, ALL)).rejects.toMatchObject({
      status: 403,
      response: {
        code: "AI_BUDGET_EXCEEDED",
        message: "Firmanızın aylık AI bütçesi doldu — AI özellikleri gelecek ay yeniden açılır.",
      },
    });
    expect(service.searches.size).toBe(0);
    // A refusal is not retried.
    expect(calls("research")).toHaveLength(2);
  });

  it("the budget refuses ONE pass → the search is registered and ends DONE with the other pass + BUDGET for the refused scope", async () => {
    const { service } = rig({ research: ({ abroad: a }) => (a ? budget() : "LOCAL research") });
    const { searchId } = await service.startExternalSearch(user, ALL);
    const done = await finished(service, searchId);
    expect(done.result!.companies.map((c) => c.name)).toEqual(["Boru A.Ş."]);
    expect(done.result!.incompleteReasons).toEqual({ ABROAD: "BUDGET" });
    expect(done.result!.incompleteMessages).toEqual({
      ABROAD: "Firmanızın aylık AI bütçesi doldu — AI özellikleri gelecek ay yeniden açılır.",
    });
  });

  it("a FAILURE (5xx) that comes at once is not a refusal: the search is registered and FAILED", async () => {
    const { service } = rig({ targetCountries: ["TR"], research: () => timeout() });
    const { searchId } = await service.startExternalSearch(user, TURKEY_ONLY);
    expect(service.externalSearchStatus(user, searchId).status).toBe("FAILED");
  });

  it("start does not wait for the search: it answers after the short refusal window while the research runs", async () => {
    const gate = deferred<string>();
    const { service } = rig({ targetCountries: ["TR"], research: () => gate.promise });
    const t0 = Date.now();
    const { searchId } = await service.startExternalSearch(user, TURKEY_ONLY);
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(service.externalSearchStatus(user, searchId).status).toBe("RUNNING");
    gate.resolve("LOCAL research");
    await finished(service, searchId);
  });
});

describe("N1 — one search, one bill: starting the running search again joins it", () => {
  it("the same body from the same user while the search runs → the same id; nothing is searched (or paid) a second time", async () => {
    const gate = deferred<string>();
    const { service, calls } = rig({ targetCountries: ["TR"], research: () => gate.promise });
    const first = await service.startExternalSearch(user, TURKEY_ONLY);
    // The answer of the first start was lost / the page was reloaded / a second tab asks.
    const again = await service.startExternalSearch(user, { ...TURKEY_ONLY });
    expect(again.searchId).toBe(first.searchId);
    expect(calls("research")).toHaveLength(1);
    expect(service.searches.size).toBe(1);
    gate.resolve("LOCAL research");
    expect((await finished(service, first.searchId)).status).toBe("DONE");
    expect([calls("research").length, calls("parse").length]).toEqual([1, 1]);
  });

  it("a different question, another user and a search that has FINISHED are new searches", async () => {
    const gate = deferred<string>();
    const { service, calls } = rig({ research: () => gate.promise });
    const whole = await service.startExternalSearch(user, ALL);
    // Only the missing pass (the retry of an incomplete search) is another question.
    const abroadOnly = await service.startExternalSearch(user, { ...ALL, scopes: ["ABROAD"] });
    const theirs = await service.startExternalSearch(colleague, ALL);
    expect(new Set([whole.searchId, abroadOnly.searchId, theirs.searchId]).size).toBe(3);
    expect(calls("research")).toHaveLength(2 + 1 + 2);
    gate.resolve("ABROAD research");
    await finished(service, whole.searchId);
    await finished(service, abroadOnly.searchId);
    await finished(service, theirs.searchId, colleague);
    // "Search again" after the result: a new, paid search.
    const fresh = await service.startExternalSearch(user, ALL);
    expect(fresh.searchId).not.toBe(whole.searchId);
    expect(calls("research")).toHaveLength(5 + 2);
    await finished(service, fresh.searchId);
  });

  it("a caller that joins a search refused by the budget gets the same refusal, not an id that leads nowhere", async () => {
    const { service } = rig({ research: () => budget() });
    const [a, b] = await Promise.allSettled([
      service.startExternalSearch(user, ALL),
      service.startExternalSearch(user, ALL),
    ]);
    expect([a.status, b.status]).toEqual(["rejected", "rejected"]);
    expect((a as PromiseRejectedResult).reason).toMatchObject({ status: 403 });
    expect((b as PromiseRejectedResult).reason).toBe((a as PromiseRejectedResult).reason);
    expect(service.searches.size).toBe(0);
  });

  it("the key: order and repetition of codes mean nothing, the (numbered) item names and the asked scopes do", () => {
    const key = externalSearchKey;
    const base = { type: "ALIM" as const, listingId: "l1", categoryIds: ["40141700", "27131700"], itemNames: ["Boru", "Vana"] };
    expect(key({ ...base, categoryIds: ["27131700", "40141700", "27131700"] })).toBe(key(base));
    expect(key({ ...base, itemNames: [" Boru ", "Vana"] })).toBe(key(base));
    expect(key({ ...base, scopes: [] })).toBe(key(base));
    expect(key({ ...base, targetCountries: [] })).toBe(key(base));
    expect(key({ ...base, itemNames: ["Vana", "Boru"] })).not.toBe(key(base));
    expect(key({ ...base, scopes: ["ABROAD"] })).not.toBe(key(base));
    expect(key({ ...base, scopes: ["ABROAD", "LOCAL"] })).toBe(key({ ...base, scopes: ["LOCAL", "ABROAD"] }));
    expect(key({ ...base, listingId: "l2" })).not.toBe(key(base));
    expect(key({ ...base, region: "Marmara" })).not.toBe(key(base));
    expect(key({ ...base, targetCountries: ["DE"] })).not.toBe(key(base));
  });
});

describe("N1 — registry bounds at the endpoint", () => {
  it("a user's fourth running search is refused with 429 and a clear text; nothing is searched for it; a colleague is not affected", async () => {
    const gate = deferred<string>();
    const { service, calls } = rig({ targetCountries: ["TR"], research: () => gate.promise });
    // Three DIFFERENT searches (the same body would join the running one).
    const other = (n: number) => ({ ...TURKEY_ONLY, itemNames: [`Kalem ${n}`] });
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push((await service.startExternalSearch(user, other(i))).searchId);
    expect(new Set(ids).size).toBe(3);
    expect(calls("research")).toHaveLength(3);
    await expect(service.startExternalSearch(user, other(3))).rejects.toMatchObject({
      status: 429,
      response: {
        code: "DISCOVERY_SEARCH_LIMIT",
        message: "Aynı anda en fazla 3 web araması yürütebilirsiniz — süren aramalardan birinin bitmesini bekleyin.",
      },
    });
    expect(calls("research")).toHaveLength(3);
    const theirs = await service.startExternalSearch(colleague, other(3));
    expect(calls("research")).toHaveLength(4);
    // Once a search has finished the user may start the next one.
    gate.resolve("LOCAL research");
    for (const id of ids) await finished(service, id);
    await finished(service, theirs.searchId, colleague);
    await expect(service.startExternalSearch(user, other(3))).resolves.toEqual({ searchId: expect.any(String) });
  });

  it("a registry holding only running searches refuses the next one with 503 (busy), not with a search that can never be read", async () => {
    const gate = deferred<string>();
    const { service } = rig({ targetCountries: ["TR"], research: () => gate.promise });
    service.searches = new ExternalSearchRegistry({ ...ASYNC_SEARCH_LIMITS, maxTotal: 2 });
    await service.startExternalSearch(user, TURKEY_ONLY);
    await service.startExternalSearch(colleague, TURKEY_ONLY);
    await expect(service.startExternalSearch({ userId: "u3", companyId: "c9" } as never, TURKEY_ONLY)).rejects.toMatchObject({
      status: 503,
      response: { code: "DISCOVERY_SEARCH_BUSY", message: "Web araması şu an çok yoğun — birkaç dakika sonra tekrar deneyin." },
    });
    gate.resolve("LOCAL research");
  });

  it("a search leaves no timer behind once it has ended", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    try {
      const gate = deferred<string>();
      const { service } = rig({ targetCountries: ["TR"], research: () => gate.promise });
      const starting = service.startExternalSearch(user, TURKEY_ONLY);
      // Only the refusal window of the START call is pending while the research runs…
      await flush();
      expect(jest.getTimerCount()).toBe(1);
      jest.advanceTimersByTime(service.startRefusalWaitMs);
      const { searchId } = await starting;
      // …and nothing at all afterwards: not while RUNNING, not once DONE.
      expect(jest.getTimerCount()).toBe(0);
      expect(service.externalSearchStatus(user, searchId).status).toBe("RUNNING");
      gate.resolve("LOCAL research");
      await flush();
      expect(service.externalSearchStatus(user, searchId).status).toBe("DONE");
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it("an early refusal clears its window timer too", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    try {
      const { service } = rig({ research: () => budget() });
      await expect(service.startExternalSearch(user, ALL)).rejects.toMatchObject({ status: 403 });
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("N1 — limits (one source: DiscoverySearchTiming)", () => {
  it("asynchronous search: research 120 s, pass 170 s, one retry of a failed research, one conversion retry of 40 s", () => {
    expect(ASYNC_SEARCH_TIMING).toEqual({
      researchTimeoutMs: 120_000,
      passBudgetMs: 170_000,
      retries: 1,
      conversionRetries: 1,
      conversionTimeoutMs: 40_000,
    });
    // Today's daytime research (70-80 s, cut at 82 s) and conversion (up to 26 s) fit with room.
    expect(ASYNC_SEARCH_TIMING.researchTimeoutMs).toBeGreaterThan(INTERACTIVE_SEARCH_TIMING.researchTimeoutMs);
    expect(ASYNC_SEARCH_TIMING.conversionTimeoutMs!).toBeGreaterThan(26_200);
    // A research of up to 90 s leaves both conversion calls their full window.
    expect(ASYNC_SEARCH_TIMING.passBudgetMs - 90_000).toBeGreaterThanOrEqual(2 * ASYNC_SEARCH_TIMING.conversionTimeoutMs!);
    // Even the slowest allowed research leaves room for one full conversion call.
    expect(ASYNC_SEARCH_TIMING.passBudgetMs - ASYNC_SEARCH_TIMING.researchTimeoutMs).toBeGreaterThanOrEqual(
      ASYNC_SEARCH_TIMING.conversionTimeoutMs!,
    );
    // Well below the reservation reaper (10 min, `ai.scheduler.ts`).
    expect(ASYNC_SEARCH_TIMING.researchTimeoutMs).toBeLessThan(10 * MIN);
  });

  it("registry: three per user, a finished search kept 15 min, a search given up after its worst case and BEFORE the client's own hard stop", () => {
    expect(ASYNC_SEARCH_LIMITS.maxRunningPerUser).toBe(3);
    expect(ASYNC_SEARCH_LIMITS.keepFinishedMs).toBe(15 * MIN);
    expect(ASYNC_SEARCH_LIMITS.maxTotal).toBeGreaterThanOrEqual(50);
    expect(worstSearchMs(ASYNC_SEARCH_TIMING)).toBe(340_000);
    // Room for the marking step (database reads + DNS checks) after the last pass.
    expect(ASYNC_SEARCH_LIMITS.maxRunMs).toBeGreaterThanOrEqual(worstSearchMs(ASYNC_SEARCH_TIMING) + 10_000);
    // The server says FAILED before the window stops polling (8 min) - raise them together.
    expect(ASYNC_SEARCH_CLIENT_STOP_MS).toBe(8 * MIN);
    expect(ASYNC_SEARCH_LIMITS.maxRunMs + 30_000).toBeLessThanOrEqual(ASYNC_SEARCH_CLIENT_STOP_MS);
    // The refusal window of start is short: the id reaches the client at once.
    expect(START_REFUSAL_WAIT_MS).toBeLessThanOrEqual(1_500);
  });
});

describe("N1 — routes (shared contract with the web)", () => {
  const meta = (key: string, handler: keyof SupplierDiscoveryController) =>
    Reflect.getMetadata(key, SupplierDiscoveryController.prototype[handler] as object);

  it("POST company/ai/supplier-discovery/external/start and GET …/external/searches/:searchId, both behind buy:listing:manage; the old POST external stays", () => {
    expect(Reflect.getMetadata("path", SupplierDiscoveryController)).toBe("company/ai/supplier-discovery");
    expect([meta("path", "startExternal"), meta("method", "startExternal")]).toEqual(["external/start", RequestMethod.POST]);
    expect([meta("path", "externalSearch"), meta("method", "externalSearch")]).toEqual([
      "external/searches/:searchId",
      RequestMethod.GET,
    ]);
    expect([meta("path", "discoverExternal"), meta("method", "discoverExternal")]).toEqual(["external", RequestMethod.POST]);
    for (const handler of ["startExternal", "externalSearch", "discoverExternal"] as const) {
      expect(meta(COMPANY_PERMISSION_KEY, handler)).toBe("buy:listing:manage");
    }
  });

  it("the controller hands the user and the body / id to the service", async () => {
    const service = {
      startExternalSearch: jest.fn().mockResolvedValue({ searchId: "s1" }),
      externalSearchStatus: jest.fn().mockReturnValue({ status: "RUNNING", startedAt: "2026-10-09T14:00:00.000Z" }),
    };
    const controller = new SupplierDiscoveryController(service as never);
    const dto = { type: "ALIM" as const, listingId: "l1", scopes: ["LOCAL" as const] };
    await expect(controller.startExternal(user, dto)).resolves.toEqual({ searchId: "s1" });
    expect(service.startExternalSearch).toHaveBeenCalledWith(user, dto);
    expect(controller.externalSearch(user, "s1")).toEqual({ status: "RUNNING", startedAt: "2026-10-09T14:00:00.000Z" });
    expect(service.externalSearchStatus).toHaveBeenCalledWith(user, "s1");
  });

  it("the status poll has its own rate limit: 20 polls a minute per search must not hit the default 100 per address", () => {
    const limit = (name: string) =>
      Reflect.getMetadata(`THROTTLER:${name}default`, SupplierDiscoveryController.prototype.externalSearch as object);
    expect(limit("LIMIT")).toBe(SEARCH_STATUS_POLLS_PER_MINUTE);
    expect(limit("TTL")).toBe(60_000);
    // Three running searches of ten users behind one office address.
    expect(SEARCH_STATUS_POLLS_PER_MINUTE).toBeGreaterThanOrEqual(3 * 10 * 20);
  });
});
