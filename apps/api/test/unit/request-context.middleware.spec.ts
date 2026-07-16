/**
 * RequestContextMiddleware — reqId'yi (a) Pino ALS context'ine assign eder ve
 * (b) Sentry isolation-scope'a tag basar. `sentryEnabled` mock'lanır (test
 * ortamında DSN yok); Sentry.getIsolationScope spy'lanır.
 */
jest.mock("../../src/instrument", () => ({ sentryEnabled: true }));

import * as Sentry from "@sentry/nestjs";
import { RequestContextMiddleware } from "../../src/common/logging/request-context.middleware";

function makeMiddleware() {
  const assign = jest.fn();
  const logger = { assign } as never;
  return { mw: new RequestContextMiddleware(logger), assign };
}

describe("RequestContextMiddleware", () => {
  it("reqId'yi Pino'ya assign eder + Sentry isolation-scope'a request_id tag'i basar + next() çağırır", () => {
    const { mw, assign } = makeMiddleware();
    const setTag = jest.fn();
    const scopeSpy = jest
      .spyOn(Sentry, "getIsolationScope")
      .mockReturnValue({ setTag } as never);
    const next = jest.fn();

    mw.use({ id: "req-abc" } as never, {} as never, next);

    expect(assign).toHaveBeenCalledWith({ reqId: "req-abc" });
    expect(scopeSpy).toHaveBeenCalled();
    expect(setTag).toHaveBeenCalledWith("request_id", "req-abc");
    expect(next).toHaveBeenCalledTimes(1);
    scopeSpy.mockRestore();
  });

  it("req.id yoksa hiçbir bağlama yapmaz ama next() yine çağrılır (davranış bozulmaz)", () => {
    const { mw, assign } = makeMiddleware();
    const setTag = jest.fn();
    const scopeSpy = jest
      .spyOn(Sentry, "getIsolationScope")
      .mockReturnValue({ setTag } as never);
    const next = jest.fn();

    mw.use({} as never, {} as never, next);

    expect(assign).not.toHaveBeenCalled();
    expect(setTag).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    scopeSpy.mockRestore();
  });
});
