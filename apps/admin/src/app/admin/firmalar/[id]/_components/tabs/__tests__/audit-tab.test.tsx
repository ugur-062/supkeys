// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  query: { data: undefined as unknown, isError: false, isLoading: false, refetch: vi.fn() },
}));

vi.mock("@/hooks/use-audit-logs", () => ({
  useAuditLogs: () => h.query,
}));

import { AuditTab } from "../audit-tab";

beforeEach(() => {
  h.query = { data: undefined, isError: false, isLoading: false, refetch: vi.fn() };
});

describe("AuditTab (arayüz testi O-047)", () => {
  it("genel Denetim Kaydı'yla aynı etiketler: eylem, aktör, detay ham kod/JSON değil", () => {
    h.query.data = {
      items: [
        {
          id: "a1",
          tenantId: "co1",
          actorType: "company",
          actorId: "u1",
          actorEmail: "firma@ornek.com",
          action: "company.profile.updated",
          entityType: "company",
          entityId: "co1",
          metadata: { changedFields: ["name", "website"] },
          ip: null,
          createdAt: "2026-01-15T10:00:00.000Z",
        },
      ],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };
    render(<AuditTab companyId="co1" />);
    expect(screen.getByText("Firma profili güncellendi")).toBeInTheDocument();
    expect(screen.getByText("Firma")).toBeInTheDocument();
    expect(screen.getByText("değişen alanlar: ad, web sitesi")).toBeInTheDocument();
    expect(screen.queryByText("company.profile.updated")).not.toBeInTheDocument();
    expect(screen.queryByText("company")).not.toBeInTheDocument();
    expect(screen.queryByText(/changedFields/)).not.toBeInTheDocument();
    // Varlık sütunu yok — 4 sütun.
    expect(screen.getAllByRole("columnheader")).toHaveLength(4);
  });
});
