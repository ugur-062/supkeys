/**
 * PER-CALL AI TIMEOUT (round 5, D1).
 *
 * Every AI call was cut at the global `AI_TIMEOUT_MS` (60 s). The grounded
 * supplier research needs 45-75 s, so 15 % of them timed out. A caller can now
 * give ONE call its own timeout and an absolute deadline; every other call
 * keeps the global value.
 *
 *  - `timeoutMs` replaces the global timeout for that call only;
 *  - `deadlineAt` reaches the provider (its own retries end there);
 *  - a timed-out call is still booked (estimate kept) and answers 503.
 */
import { ALL_SEAT_PERMISSIONS } from "@rothern/shared";
import { loadAiConfig } from "../../src/modules/ai/ai.config";
import { ServiceUnavailableException } from "@nestjs/common";
import { AiService, AiTimeoutException } from "../../src/modules/ai/ai.service";
import {
  AiProviderTimeoutError,
  BaseAiProvider,
  type AiCompletionRequest,
  type AiCompletionResult,
} from "../../src/modules/ai/providers/ai-provider.interface";

class RecordingProvider extends BaseAiProvider {
  readonly name = "fake";
  calls: AiCompletionRequest[] = [];
  failWith: Error | null = null;

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    this.calls.push(req);
    if (this.failWith) throw this.failWith;
    return { text: "ok", usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 } };
  }
}

const user = {
  userId: "u1",
  companyId: "c1",
  email: "u1@firma.com",
  roles: [],
  permissions: [...ALL_SEAT_PERMISSIONS],
  tier: "GOLD",
  companyVerificationStatus: "VERIFIED",
} as never;

function rig(env: Record<string, string> = {}) {
  const config = loadAiConfig({ get: (k: string) => ({ GEMINI_API_KEY: "test-key-fixture", ...env })[k] });
  const provider = new RecordingProvider();
  const budget = {
    reserve: jest.fn().mockResolvedValue({ id: "r1", model: config.models.default, downgraded: false }),
    settle: jest.fn().mockResolvedValue({ warned: false, percentUsed: 1 }),
    fail: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AiService(config, provider, budget as never, {} as never, undefined);
  return { service, provider, budget, config };
}

describe("AiService — per-call timeout", () => {
  it("callAi: without the option the global timeout is used and no deadline is sent", async () => {
    const { service, provider, config } = rig();
    await service.callAi(user, { feature: "test", prompt: "p" });
    expect(config.timeoutMs).toBe(60_000);
    expect(provider.calls[0]!.timeoutMs).toBe(60_000);
    expect(provider.calls[0]!.deadlineAt).toBeUndefined();
  });

  it("callAi: `timeoutMs` and `deadlineAt` of the call reach the provider; the next call is back on the global value", async () => {
    const { service, provider } = rig();
    const deadlineAt = Date.now() + 82_000;
    await service.callAi(user, { feature: "supplier_discovery", prompt: "p", webSearch: true, timeoutMs: 82_000, deadlineAt });
    await service.callAi(user, { feature: "supplier_discovery", prompt: "p" });
    expect([provider.calls[0]!.timeoutMs, provider.calls[0]!.deadlineAt]).toEqual([82_000, deadlineAt]);
    expect([provider.calls[1]!.timeoutMs, provider.calls[1]!.deadlineAt]).toEqual([60_000, undefined]);
  });

  it("callAi: the per-call value wins over AI_TIMEOUT_MS in both directions (the caller owns its wall-clock budget)", async () => {
    const { service, provider } = rig({ AI_TIMEOUT_MS: "120000" });
    await service.callAi(user, { feature: "test", prompt: "p", timeoutMs: 82_000 });
    await service.callAi(user, { feature: "test", prompt: "p" });
    expect(provider.calls.map((c) => c.timeoutMs)).toEqual([82_000, 120_000]);
  });

  it("callAi: a timed-out call is booked as before (estimate kept) and answers 503", async () => {
    const { service, provider, budget } = rig();
    provider.failWith = new AiProviderTimeoutError("timed out (82000ms)");
    await expect(
      service.callAi(user, { feature: "supplier_discovery", prompt: "p", webSearch: true, timeoutMs: 82_000 }),
    ).rejects.toMatchObject({ status: 503 });
    expect(budget.fail).toHaveBeenCalledWith("r1", { errorCode: "timeout", keepEstimate: true });
    expect(budget.settle).not.toHaveBeenCalled();
  });

  it("callAi: the timeout has a class of its own (still a 503) - an incomplete supplier search reports TIMEOUT from it (R5-03)", async () => {
    const { service, provider } = rig();
    provider.failWith = new AiProviderTimeoutError("timed out (82000ms)");
    const err = await service.callAi(user, { feature: "supplier_discovery", prompt: "p" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiTimeoutException);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect((err as AiTimeoutException).getStatus()).toBe(503);
    // Any other failure of the call is not a timeout.
    provider.failWith = new Error("unexpected");
    const other = await service.callAi(user, { feature: "supplier_discovery", prompt: "p" }).catch((e: unknown) => e);
    expect(other).not.toBeInstanceOf(AiTimeoutException);
  });

  it("callAiSystem (platform budget): same two options; default is the global timeout", async () => {
    const { service, provider } = rig();
    const deadlineAt = Date.now() + 120_000;
    await service.callAiSystem({ prompt: "p", webSearch: true, timeoutMs: 120_000, deadlineAt });
    await service.callAiSystem({ prompt: "p" });
    expect([provider.calls[0]!.timeoutMs, provider.calls[0]!.deadlineAt]).toEqual([120_000, deadlineAt]);
    expect([provider.calls[1]!.timeoutMs, provider.calls[1]!.deadlineAt]).toEqual([60_000, undefined]);
  });
});
