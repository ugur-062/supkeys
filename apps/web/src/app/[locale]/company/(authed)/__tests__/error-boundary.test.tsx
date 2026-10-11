// @vitest-environment jsdom
/**
 * Hata sınırlarında "Tekrar dene" (arayüz testi O-112, D-362): yalnız
 * `reset()` sunucu bileşeni hatasında başarısız yükü yeniden çekmiyor, veriden
 * kaynaklı hatada da sorgu önbelleği aynı bozuk veriyi geri veriyordu.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  refresh: vi.fn(),
  resetQueries: vi.fn(() => Promise.resolve()),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: h.refresh, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ resetQueries: h.resetQueries }),
}));
vi.mock("@/lib/client-error", () => ({ reportClientError: vi.fn() }));

import AuthedError from "../error";
import AppError from "../../../error";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("hata sınırı — Tekrar dene", () => {
  it("panel: sorgu önbelleğini sıfırlar, rotayı tazeler, sınırı sıfırlar", () => {
    const reset = vi.fn();
    render(<AuthedError error={new Error("bozuk veri")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(h.resetQueries).toHaveBeenCalledTimes(1);
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("genel: rotayı sunucudan yeniden ister ve sınırı sıfırlar", () => {
    const reset = vi.fn();
    render(<AppError error={new Error("API kesintisi")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
