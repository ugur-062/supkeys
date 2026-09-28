// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/client-error", () => ({ reportClientError: vi.fn() }));

import AppError from "../error";

/**
 * Akış başladıktan sonra atılan hata (ör. API kesintisi — yayın denetimi B1-1)
 * 200 durum koduyla gelir; hata sayfası "ince içerik" olarak indekslenmesin.
 */
describe("segment hata sınırı", () => {
  it("noindex meta etiketini <head>'e koyar", () => {
    render(<AppError error={new Error("api down")} reset={() => {}} />);
    const meta = document.head.querySelector('meta[name="robots"]');
    expect(meta?.getAttribute("content")).toBe("noindex");
  });
});
