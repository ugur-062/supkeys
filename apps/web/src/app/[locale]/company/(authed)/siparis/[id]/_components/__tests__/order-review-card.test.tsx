// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  resolve: null as null | (() => void),
}));

vi.mock("@/hooks/use-company-orders", () => ({
  useOrderReview: () => ({ data: { rating: 4, comment: "", showName: false } }),
  useUpsertReview: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { OrderReviewCard } from "../order-review-card";

beforeEach(() => {
  h.mutateAsync.mockReset().mockImplementation(
    () => new Promise<void>((r) => (h.resolve = r)),
  );
});

/**
 * Arayüz testi son tur S-BUY: "Değerlendir" çift tıkta iki POST atıyordu
 * (`isPending` bir sonraki çizimde geliyor). İstek sürerken ikinci tık yok sayılır.
 */
describe("OrderReviewCard — çift tık", () => {
  it("istek sürerken ikinci tık ikinci isteği atmaz; bitince yeniden gönderilebilir", async () => {
    render(<OrderReviewCard orderId="o1" targetName="Acme" />);
    const btn = screen.getByRole("button", { name: /Değerlendirmeyi Güncelle|Değerlendir/ });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(h.mutateAsync).toHaveBeenCalledTimes(1);
    h.resolve?.();
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(btn);
    expect(h.mutateAsync).toHaveBeenCalledTimes(2);
  });
});
