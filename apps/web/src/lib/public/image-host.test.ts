import { afterEach, describe, expect, it } from "vitest";
import { optimizable } from "./image-host";

const original = process.env.NEXT_PUBLIC_CDN_URL;
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_CDN_URL;
  else process.env.NEXT_PUBLIC_CDN_URL = original;
});

describe("görsel host kontrolü", () => {
  it("CDN tanımsızsa HİÇBİR uzak görsel optimize edilmez", () => {
    // `next/image` yapılandırılmamış host'u reddeder — düz <img>'e düşmeliyiz,
    // yoksa sayfa kırılır.
    delete process.env.NEXT_PUBLIC_CDN_URL;
    expect(optimizable("https://cdn.rothern.com/a.webp")).toBe(false);
  });

  it("CDN host'u eşleşirse optimize edilir", () => {
    process.env.NEXT_PUBLIC_CDN_URL = "https://cdn.rothern.com";
    expect(optimizable("https://cdn.rothern.com/urun/a.webp")).toBe(true);
  });

  it("BAŞKA host optimize EDİLMEZ", () => {
    process.env.NEXT_PUBLIC_CDN_URL = "https://cdn.rothern.com";
    expect(optimizable("https://baska.example/a.webp")).toBe(false);
    // r2.dev Türkiye'de engelli; oraya düşen kurulum zaten bozuk ve
    // görünür olmalı — sessizce optimize etmeye çalışmıyoruz.
    expect(optimizable("https://pub-abc.r2.dev/a.webp")).toBe(false);
  });

  it("göreli yol (aynı origin) optimize edilir", () => {
    process.env.NEXT_PUBLIC_CDN_URL = "https://cdn.rothern.com";
    expect(optimizable("/rothern-logo.png")).toBe(true);
  });

  it("bozuk env sessizce kapatır (sayfa kırılmaz)", () => {
    process.env.NEXT_PUBLIC_CDN_URL = "bu bir url degil";
    expect(optimizable("https://cdn.rothern.com/a.webp")).toBe(false);
  });
});
