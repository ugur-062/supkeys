// @vitest-environment jsdom
/**
 * Tedarikçi grubu düzenleme (derin denetim MU-25): bağlantısı kopan üye
 * listede çizilmediği için seçimden çıkarılamıyordu; gizli seçili kalıp her
 * kayıtta API'nin bağlantı kontrolünde reddediliyordu. Dialog üyeleri aktif
 * bağlantılarla kesiştirir ve düşen üye sayısını not olarak gösterir.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn() }));

vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: () => true,
  useCompanyAuth: () => ({ user: null, company: null }),
}));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: h.get, patch: h.patch, post: h.post, delete: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/satinalma/sablonlar/gruplar",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { ConfirmProvider } from "@/components/providers/confirm-dialog";
import { GroupTemplatesView } from "../templates-view";

const conn = (id: string, name: string) => ({
  id: `c-${id}`,
  company: { id, name, city: null, industry: null, rothernId: null },
});

beforeEach(() => {
  h.get.mockReset();
  h.patch.mockReset();
  h.get.mockImplementation((url: string) => {
    if (url === "/company/supplier-templates") {
      return Promise.resolve({
        data: [
          { id: "g1", name: "Çelik", isPublic: false, memberCount: 3, isOwnedByMe: true, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" },
        ],
      });
    }
    if (url === "/company/supplier-templates/g1") {
      return Promise.resolve({
        data: {
          id: "g1",
          name: "Çelik",
          isPublic: false,
          members: [
            { id: "a", name: "Alfa", rothernId: null, tier: "STANDART" },
            { id: "b", name: "Beta", rothernId: null, tier: "STANDART" },
            { id: "x", name: "Kopan", rothernId: null, tier: "STANDART" },
          ],
        },
      });
    }
    if (url === "/company/connections") {
      return Promise.resolve({ data: [conn("a", "Alfa"), conn("b", "Beta")] });
    }
    return Promise.resolve({ data: [] });
  });
  h.patch.mockResolvedValue({ data: {} });
});

describe("GroupTemplateDialog — bağlantısı kopan üye", () => {
  it("kopan üye seçime tohumlanmaz, not gösterilir, kayıt yalnız bağlı üyeleri gönderir", async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={qc}>
        <ConfirmProvider>
          <GroupTemplatesView basePath="/company/satinalma/sablonlar" />
        </ConfirmProvider>
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: /Çelik.*düzenle/i }));
    expect(await screen.findByText(/aktif olmayan 1 firma seçimden çıkarıldı/)).toBeInTheDocument();
    expect(screen.getByText(/2 seçili/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(h.patch).toHaveBeenCalled());
    const [url, body] = h.patch.mock.calls[0] as [string, { memberCompanyIds: string[] }];
    expect(url).toBe("/company/supplier-templates/g1");
    expect([...body.memberCompanyIds].sort()).toEqual(["a", "b"]);
  });
});
