import { describe, expect, it } from "vitest";
import { extractErrorMessage } from "../error";

const axiosErr = (data: unknown) => ({
  isAxiosError: true,
  response: { data },
});

describe("extractErrorMessage", () => {
  it("axios string message döner", () => {
    expect(
      extractErrorMessage(axiosErr({ message: "Sunucu hatası" }), "yedek"),
    ).toBe("Sunucu hatası");
  });

  it("axios dizi message birleştirilir", () => {
    expect(
      extractErrorMessage(axiosErr({ message: ["a", "b"] }), "yedek"),
    ).toBe("a, b");
  });

  it("axios message yoksa fallback", () => {
    expect(extractErrorMessage(axiosErr({}), "yedek")).toBe("yedek");
  });

  it("düz Error mesajını döner", () => {
    expect(extractErrorMessage(new Error("patladı"), "yedek")).toBe("patladı");
  });

  it("bilinmeyen değerde fallback", () => {
    expect(extractErrorMessage("string", "yedek")).toBe("yedek");
    expect(extractErrorMessage(null, "yedek")).toBe("yedek");
  });
});
