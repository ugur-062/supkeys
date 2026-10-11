// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  calls: [] as unknown[][],
  data: undefined as unknown,
}));

vi.mock("@/hooks/use-admin-companies", () => ({
  useAdminComplaints: (...args: unknown[]) => {
    h.calls.push(args);
    return { data: h.data, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

import { ComplaintsTab } from "../complaints-tab";

function complaint(id: string) {
  return {
    id,
    status: "RESOLVED",
    reason: `Konu ${id}`,
    detail: null,
    adminNote: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    complainant: { id: "x", name: "Şikayetçi" },
    against: { id: "c1", name: "Hedef" },
  };
}

beforeEach(() => {
  h.calls = [];
  h.data = undefined;
});

describe("ComplaintsTab — sayfalama (derin denetim LU-11)", () => {
  it("25'i aşan kayıtta sayfalama gösterir ve sonraki sayfayı ister", async () => {
    h.data = {
      items: Array.from({ length: 25 }, (_, i) => complaint(`k${i}`)),
      total: 40,
      page: 1,
      pageSize: 25,
    };
    render(<ComplaintsTab companyId="c1" />);
    expect(h.calls.at(-1)).toEqual([undefined, "c1", undefined, 1]);
    await userEvent.setup().click(screen.getByRole("button", { name: "Sonraki sayfa" }));
    expect(h.calls.at(-1)).toEqual([undefined, "c1", undefined, 2]);
  });

  it("tek sayfalık veride sayfalama çizilmez", () => {
    h.data = { items: [complaint("k1")], total: 1, page: 1, pageSize: 25 };
    render(<ComplaintsTab companyId="c1" />);
    expect(screen.queryByRole("navigation", { name: "Sayfalama" })).not.toBeInTheDocument();
  });
});
