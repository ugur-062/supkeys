import { beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureException: (...a: unknown[]) => captureException(...a),
  getClient: () => ({ name: "started" }),
}));

const post = async (body: unknown, headers: Record<string, string> = {}) => {
  const { POST } = await import("../route");
  const { ip, ...rest } = headers;
  return POST(
    new Request("https://admin.rothern.com/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": ip ?? `1.2.3.${Math.random()}`, ...rest },
      body: JSON.stringify(body),
    }),
  );
};

// Derin denetim LU-13: web'deki B5-9 düzeltmesi (Vercel'in x-real-ip'i + toplam
// tavan + sunucu tarafı adres süzgeci) admin ucuna taşınmamıştı.
describe("admin /api/client-error", () => {
  beforeEach(() => captureException.mockClear());

  it("geçerli bildirimi Sentry'e yazar", async () => {
    expect((await post({ message: "boom" })).status).toBe(204);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("istemcinin gönderdiği cf-connecting-ip tavanı ATLATAMAZ", async () => {
    let last = 204;
    for (let i = 0; i < 40; i++) last = (await post({ message: `c${i}` }, { ip: "8.8.4.4", "cf-connecting-ip": `10.0.0.${i}` })).status;
    expect(last).toBe(429);
  });

  it("sunucu da adresi süzer — jeton Sentry'e gitmez", async () => {
    await post({ message: "boom", url: "https://admin.rothern.com/reset-password/0123456789abcdef?token=abc" });
    const [, ctx] = captureException.mock.calls[0] as [Error, { extra: { url: string } }];
    expect(ctx.extra.url).not.toContain("0123456789abcdef");
    expect(ctx.extra.url).not.toContain("abc");
  });

  it("çok kaynaklı sele karşı süreç başına toplam tavan", async () => {
    let last = 204;
    for (let i = 0; i < 700 && last !== 429; i++) last = (await post({ message: `g${i}` }, { ip: `5.6.${Math.floor(i / 250)}.${i % 250}` })).status;
    expect(last).toBe(429);
  });
});
