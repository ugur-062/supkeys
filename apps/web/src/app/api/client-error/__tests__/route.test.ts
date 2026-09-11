import { beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException: (...a: unknown[]) => captureException(...a) }));

const post = async (body: unknown, headers: Record<string, string> = {}) => {
  const { POST } = await import("../route");
  return POST(
    new Request("https://www.rothern.com/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json", "cf-connecting-ip": headers.ip ?? `1.2.3.${Math.random()}`, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
};

describe("/api/client-error", () => {
  beforeEach(() => captureException.mockClear());

  it("geçerli bildirimi Sentry'e yazar", async () => {
    const res = await post({ name: "TypeError", message: "x is not a function", stack: "TypeError: x\n at a.js:1", url: "https://www.rothern.com/urunler", kind: "boundary" });
    expect(res.status).toBe(204);
    expect(captureException).toHaveBeenCalledTimes(1);
    const [err, ctx] = captureException.mock.calls[0] as [Error, { tags: Record<string, string> }];
    expect(err.message).toBe("x is not a function");
    expect(ctx.tags.source).toBe("browser");
  });

  it("mesajsız gövdeyi reddeder", async () => {
    expect((await post({ name: "Error" })).status).toBe(400);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("bozuk JSON'u reddeder", async () => {
    expect((await post("{bozuk")).status).toBe(400);
  });

  it("çok büyük gövdeyi reddeder", async () => {
    expect((await post({ message: "a", stack: "x".repeat(20_000) })).status).toBe(413);
  });

  it("aynı IP'den seli keser", async () => {
    const ip = "9.9.9.9";
    let last = 204;
    for (let i = 0; i < 40; i++) last = (await post({ message: `m${i}` }, { ip })).status;
    expect(last).toBe(429);
  });
});
