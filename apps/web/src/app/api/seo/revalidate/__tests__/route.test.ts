import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath, revalidateTag }));

const { POST } = await import("../route");

function post(body: unknown, secret?: string) {
  return POST(
    new Request("http://localhost/api/seo/revalidate", {
      method: "POST",
      headers: { "content-type": "application/json", ...(secret ? { "x-seo-secret": secret } : {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("POST /api/seo/revalidate", () => {
  beforeEach(() => {
    process.env.SEO_REVALIDATE_SECRET = "gizli";
    revalidatePath.mockClear();
    revalidateTag.mockClear();
  });
  afterEach(() => {
    delete process.env.SEO_REVALIDATE_SECRET;
  });

  it("sır yoksa uç KAPALI (404), yanlış sır 403", async () => {
    delete process.env.SEO_REVALIDATE_SECRET;
    expect((await post({ paths: ["/"] }, "gizli")).status).toBe(404);
    process.env.SEO_REVALIDATE_SECRET = "gizli";
    expect((await post({ paths: ["/"] }, "yanlis")).status).toBe(403);
    expect((await post({ paths: ["/"] })).status).toBe(403);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("geçerli yol/etiketleri tazeler, biçimsizleri süzer", async () => {
    const res = await post(
      {
        paths: ["/firma/acme", "/urunler/kategori/39000000-elektrik", "javascript:alert(1)", "/a?b=c", 42],
        tags: ["product:acme/boru", "seo:sitemap", "rastgele", "company:<x>"],
      },
      "gizli",
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, paths: 2, tags: 2 });
    expect(revalidatePath).toHaveBeenCalledWith("/firma/acme");
    expect(revalidatePath).toHaveBeenCalledWith("/urunler/kategori/39000000-elektrik");
    expect(revalidateTag).toHaveBeenCalledWith("product:acme/boru");
    expect(revalidateTag).toHaveBeenCalledWith("seo:sitemap");
    expect(revalidateTag).toHaveBeenCalledTimes(2);
  });

  it("bozuk JSON 400", async () => {
    expect((await post("{", "gizli")).status).toBe(400);
  });
});
