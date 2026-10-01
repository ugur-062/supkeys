import { isHttpsUrl, productVideoEmbedUrl } from "@rothern/shared";

/** Arayüz testi Y-11: ürün videosu gömme adresi tek kaynak (web çizer, API doğrular). */
describe("productVideoEmbedUrl", () => {
  it("YouTube biçimleri çerezsiz gömme adresine", () => {
    const want = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
    expect(productVideoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe(want);
    expect(productVideoEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(want);
    expect(productVideoEmbedUrl("https://m.youtube.com/shorts/dQw4w9WgXcQ")).toBe(want);
    expect(productVideoEmbedUrl(" https://youtube.com/embed/dQw4w9WgXcQ ")).toBe(want);
  });

  it("Vimeo oynatıcı adresine", () => {
    expect(productVideoEmbedUrl("https://vimeo.com/76979871")).toBe("https://player.vimeo.com/video/76979871");
    expect(productVideoEmbedUrl("https://player.vimeo.com/video/76979871")).toBe("https://player.vimeo.com/video/76979871");
  });

  it("izinsiz konak, http, bozuk kimlik ve şema null", () => {
    for (const bad of [
      "https://example.com/watch?v=dQw4w9WgXcQ",
      "http://youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=kisa",
      "https://evil-youtube.com/watch?v=dQw4w9WgXcQ",
      "javascript:alert(1)",
      "https://vimeo.com/channels/abc",
      "",
      null,
    ]) {
      expect(productVideoEmbedUrl(bad)).toBeNull();
    }
  });

  it("isHttpsUrl", () => {
    expect(isHttpsUrl("https://a.com")).toBe(true);
    expect(isHttpsUrl("http://a.com")).toBe(false);
    expect(isHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpsUrl(null)).toBe(false);
  });
});
