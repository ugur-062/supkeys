// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

/**
 * Derin denetim LU-12: KVKK sil/anonimleştir sonrası firma listesi ve KPI
 * önbelleği (staleTime 60 sn) tazelenmiyor, silinen firma listede kalıyordu.
 */
const h = vi.hoisted(() => ({
  push: vi.fn(),
  del: vi.fn(async () => ({ data: { mode: "deleted" } })),
  invalidate: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("@/hooks/use-admin-auth", () => ({ useAdminAuth: () => ({ admin: { role: "SUPER_ADMIN" } }) }));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), delete: h.del }, toastApiError: vi.fn() }));
vi.mock("@/hooks/use-admin-companies", () => ({
  useUpdateCompanyProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: h.invalidate, removeQueries: h.remove }),
}));

import { SummaryTab } from "../summary-tab";

const data = {
  id: "c1",
  rothernId: "RT-1",
  name: "Muster",
  legalName: "Muster GmbH",
  country: "DE",
  createdAt: "2026-09-27T10:00:00.000Z",
  _count: { users: 1, listings: 0, complaintsReceived: 0 },
  openComplaints: 0,
  suppressions: [],
  vies: null,
  viesSupported: false,
} as never;

describe("SummaryTab — KVKK silme", () => {
  it("silme başarılıysa liste/KPI önbelleği geçersizlenir, detay atılır, listeye dönülür", async () => {
    const user = userEvent.setup();
    render(<SummaryTab data={data} />);
    await user.type(screen.getByLabelText("Silme onayı — firma kodu"), "RT-1");
    await user.click(screen.getByRole("button", { name: /Kalıcı Olarak Sil/ }));
    expect(h.del).toHaveBeenCalledWith("/admin/companies/c1");
    expect(h.remove).toHaveBeenCalledWith({ queryKey: ["admin-company-detail", "c1"] });
    expect(h.invalidate).toHaveBeenCalledWith({ queryKey: ["admin-companies"] });
    expect(h.invalidate).toHaveBeenCalledWith({ queryKey: ["admin-company-stats"] });
    expect(h.push).toHaveBeenCalledWith("/admin/firmalar");
  });
});
