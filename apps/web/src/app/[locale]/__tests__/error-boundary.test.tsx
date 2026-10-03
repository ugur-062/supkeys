// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
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

  it("Tekrar dene: rotayı sunucudan yeniden ister ve sınırı sıfırlar (arayüz testi O-112)", async () => {
    const reset = vi.fn();
    render(<AppError error={new Error("api down")} reset={reset} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Tekrar dene/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
