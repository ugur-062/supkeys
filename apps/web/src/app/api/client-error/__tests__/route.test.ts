import { beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException: (...a: unknown[]) => captureException(...a) }));

const post = async (body: unknown, headers: Record<string, string> = {}) => {
  const { POST } = await import("../route");
  return POST(
    new Request("https://www.rothern.com/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": headers.ip ?? `1.2.3.${Math.random()}`, ...headers },
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

  // Yayın denetimi 2026-09-28 Bölüm 5: web Cloudflare arkasında değil; istemcinin
  // gönderdiği `cf-connecting-ip` her istekte değişip tavanı atlatıyordu.
  it("istemcinin gönderdiği cf-connecting-ip tavanı ATLATAMAZ (Vercel'in x-real-ip'i esas)", async () => {
    let last = 204;
    for (let i = 0; i < 40; i++) last = (await post({ message: `c${i}` }, { ip: "8.8.4.4", "cf-connecting-ip": `10.0.0.${i}` })).status;
    expect(last).toBe(429);
  });

  it("sunucu da adresi süzer — Rusça davet yolundaki jeton Sentry'e gitmez", async () => {
    await post({ message: "boom", url: "https://www.rothern.com/ru/kompaniya/priglashenie/0123456789abcdef0123" });
    const [, ctx] = captureException.mock.calls[0] as [Error, { extra: { url: string } }];
    expect(ctx.extra.url).not.toContain("0123456789abcdef0123");
    expect(ctx.extra.url).toContain("/priglashenie/[gizlendi]");
  });

  it("aynı IP'den seli keser", async () => {
    const ip = "9.9.9.9";
    let last = 204;
    for (let i = 0; i < 40; i++) last = (await post({ message: `m${i}` }, { ip })).status;
    expect(last).toBe(429);
  });

  it("çok kaynaklı sele karşı süreç başına toplam tavan (Sentry kotası)", async () => {
    let last = 204;
    for (let i = 0; i < 700 && last !== 429; i++) last = (await post({ message: `g${i}` }, { ip: `5.6.${Math.floor(i / 250)}.${i % 250}` })).status;
    expect(last).toBe(429);
  });
});
