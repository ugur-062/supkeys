// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CompanyOrderDetail } from "@/hooks/use-company-orders";
import { OrderTimeline } from "../order-timeline";

describe("OrderTimeline — kronolojik sıra (derin denetim LU-22)", () => {
  it("A1: iptal talebi → ihtilaf → sevk → tamamlandı sırası damgaya göre dizilir", () => {
    // Satıcı DISPUTED'dan sevk etti; cancelRequestedAt/disputedAt silinmez.
    const order = {
      role: "buyer",
      createdAt: "2026-09-28T09:00:00.000Z",
      acceptedAt: "2026-09-30T09:00:00.000Z",
      cancelRequestedAt: "2026-10-01T09:00:00.000Z",
      disputedAt: "2026-10-02T09:00:00.000Z",
      deliveryStartedAt: "2026-10-05T09:00:00.000Z",
      deliveredAt: "2026-10-08T09:00:00.000Z",
      completedAt: "2026-10-08T10:00:00.000Z",
      deliveryTerm: null,
    } as unknown as CompanyOrderDetail;

    render(<OrderTimeline order={order} />);
    const titles = screen
      .getAllByRole("listitem")
      .map((li) => li.querySelector("p")?.textContent);
    expect(titles).toEqual([
      "Sipariş Oluşturuldu",
      "Sipariş Onaylandı",
      "Satıcı İptal Talep Etti",
      "Sipariş İhtilaflı",
      "Sipariş Gönderildi",
      "Teslim Alındı",
      "Sipariş Tamamlandı",
    ]);
  });
});
