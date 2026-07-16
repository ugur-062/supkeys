import { describe, expect, it } from "vitest";

import { safeExternalUrl } from "../safe-url";

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
