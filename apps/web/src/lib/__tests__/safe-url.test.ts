import { describe, expect, it } from "vitest";

import { clampLinkInput, linkInputMaxLength, safeExternalUrl } from "../safe-url";

describe("safeExternalUrl", () => {
  it("javascript:/data:/vbscript: şemalarını DÜŞÜRÜR (null)", () => {
    expect(safeExternalUrl("javascript:alert(document.cookie)")).toBeNull();
    expect(safeExternalUrl("JavaScript:alert(1)")).toBeNull(); // büyük/küçük harf
    expect(safeExternalUrl("  javascript:alert(1)  ")).toBeNull(); // trim sonrası
    expect(safeExternalUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeExternalUrl("vbscript:msgbox(1)")).toBeNull();
  });

  it("http/https adreslerini geçirir (normalize eder)", () => {
    expect(safeExternalUrl("https://x.com")).toBe("https://x.com/");
    expect(safeExternalUrl("http://x.com/path")).toBe("http://x.com/path");
    expect(safeExternalUrl("HTTPS://X.COM")).toBe("https://x.com/");
  });

  it("şemasız girdiye https:// ekler", () => {
    expect(safeExternalUrl("foo.com")).toBe("https://foo.com/");
    expect(safeExternalUrl("linkedin.com/company/x")).toBe(
      "https://linkedin.com/company/x",
    );
  });

  it("boş/null/geçersiz → null", () => {
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
    expect(safeExternalUrl("")).toBeNull();
    expect(safeExternalUrl("   ")).toBeNull();
  });
});

describe("linkInputMaxLength (arayüz testi D-054, yeniden doğrulama)", () => {
  it("boş kutu tam sınırı verir (yapıştırılan tam adres kırpılmaz)", () => {
    expect(linkInputMaxLength("", 150)).toBe(150);
    expect(linkInputMaxLength("   ", 150)).toBe(150);
  });

  it("şemasız girdide https:// (ve çıplak alan adında /) payını düşer", () => {
    expect(linkInputMaxLength("linkedin.com/company/x", 150)).toBe(142);
    expect(linkInputMaxLength("demo.com", 200)).toBe(191);
  });

  it("şemalı girdide pay yalnız normalizasyonun eklediği kadardır", () => {
    expect(linkInputMaxLength("https://demo.com/a", 200)).toBe(200);
    expect(linkInputMaxLength("https://demo.com", 200)).toBe(199);
    expect(linkInputMaxLength("https:/", 200)).toBe(200);
  });

  it("kutunun kabul ettiği her değer normalize edildiğinde sınırı aşmaz", () => {
    for (const max of [150, 200]) {
      for (const seed of ["a", "demo.com/", "linkedin.com/company/", "https://x.com/"]) {
        let v = seed;
        while (v.length < linkInputMaxLength(v, max)) v += "b";
        expect(safeExternalUrl(v)!.length).toBeLessThanOrEqual(max);
      }
    }
  });
});

describe("clampLinkInput (arayüz testi son tur webC-05 NEW-3)", () => {
  it("boş kutuya yapıştırılan şemasız uzun değeri kaydedilebilir uzunluğa kırpar", () => {
    const pasted = "linkedin.com/company/" + "a".repeat(150 - 21);
    expect(pasted).toHaveLength(150);
    const v = clampLinkInput(pasted, 150);
    expect(v).toHaveLength(142);
    expect(safeExternalUrl(v)).toHaveLength(150);
  });

  it("sınır içindeki ve tam adresli değere dokunmaz", () => {
    expect(clampLinkInput("demo.com", 200)).toBe("demo.com");
    const full = "https://linkedin.com/company/" + "a".repeat(150 - 29);
    expect(full).toHaveLength(150);
    expect(clampLinkInput(full, 150)).toBe(full);
    expect(clampLinkInput("", 150)).toBe("");
  });

  it("kırpılan her değer normalize edildiğinde sınırı aşmaz", () => {
    for (const max of [150, 200]) {
      for (const seed of ["a", "demo.com/", "linkedin.com/company/", "https://x.com/", "  x.com/"]) {
        const v = clampLinkInput(seed + "b".repeat(max + 20), max);
        expect(safeExternalUrl(v)!.length).toBeLessThanOrEqual(max);
        expect(v.length).toBeLessThanOrEqual(linkInputMaxLength(v, max));
      }
    }
  });
});
