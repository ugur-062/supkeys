import { describe, expect, it } from "vitest";
import { bidViewQuery, parseBidView } from "../bid-view";

describe("bid-view (Gelen Teklifler süzgeci, D-109)", () => {
  it("yalnız bilinen değerleri kabul eder", () => {
    expect(parseBidView("complete")).toBe("complete");
    expect(parseBidView("incomplete")).toBe("incomplete");
    expect(parseBidView("all")).toBe("all");
    expect(parseBidView(null)).toBe("all");
    expect(parseBidView(undefined)).toBe("all");
    expect(parseBidView("<script>")).toBe("all");
  });

  it("varsayılan görünümde sorgu eklemez, diğerlerinde ?teklifler= taşır", () => {
    expect(bidViewQuery("all")).toBe("");
    expect(bidViewQuery("complete")).toBe("?teklifler=complete");
    expect(bidViewQuery("incomplete")).toBe("?teklifler=incomplete");
  });

  it("geri bağlantısı ham sorguyu doğrulayıp taşır", () => {
    expect(bidViewQuery(parseBidView("incomplete"))).toBe("?teklifler=incomplete");
    expect(bidViewQuery(parseBidView("x&y=1"))).toBe("");
  });
});
