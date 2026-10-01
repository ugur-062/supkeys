// @vitest-environment jsdom
/**
 * Şablonlar (arayüz testi webB-10):
 * - D-260: grup düzenlemede detay yüklenene kadar Kaydet pasif.
 * - D-261: soru seti adı 120 karakterle sınırlı, 20 soruda "Soru Ekle" pasif.
 * - D-262: "Talepte kullan" yalnız talep açma yetkisiyle (buy:listing:manage).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QUESTION_TEMPLATE_MAX_ITEMS, TEMPLATE_NAME_MAX_LENGTH } from "@rothern/shared";

const h = vi.hoisted(() => ({
  get: vi.fn(),
  perms: [] as string[],
  releaseDetail: null as null | (() => void),
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: (p: string) => h.perms.includes(p),
  useCompanyAuth: () => ({ user: null, company: null }),
}));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: h.get, patch: vi.fn().mockResolvedValue({ data: {} }), post: vi.fn().mockResolvedValue({ data: {} }), delete: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/satinalma/sablonlar",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { ConfirmProvider } from "@/components/providers/confirm-dialog";
import { GroupTemplatesView, ListingTemplatesView, QuestionTemplatesView } from "../templates-view";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <ConfirmProvider>{ui}</ConfirmProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.get.mockReset();
  h.perms = ["templates:manage"];
  h.get.mockImplementation((url: string) => {
    if (url === "/company/listing-templates") {
      return Promise.resolve({ data: [{ id: "t1", name: "Aylık cıvata", payload: { listingType: "ALIM", items: [{}] } }] });
    }
    if (url === "/company/supplier-templates") {
      return Promise.resolve({
        data: [{ id: "g1", name: "Çelik", isPublic: false, memberCount: 1, isOwnedByMe: true, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" }],
      });
    }
    if (url === "/company/supplier-templates/g1") {
      return new Promise((resolve) => {
        h.releaseDetail = () => resolve({ data: { id: "g1", name: "Çelik", isPublic: false, members: [{ id: "a", name: "Alfa", rothernId: null, tier: "STANDART" }] } });
      });
    }
    if (url === "/company/connections") {
      return Promise.resolve({ data: [{ id: "c-a", company: { id: "a", name: "Alfa", city: null, industry: null, rothernId: null } }] });
    }
    return Promise.resolve({ data: [] });
  });
});

describe("ListingTemplatesView — Talepte kullan (D-262)", () => {
  it("talep açma yetkisi yoksa bağlantı yok", async () => {
    wrap(<ListingTemplatesView basePath="/company/satinalma/sablonlar" />);
    expect(await screen.findByText("Aylık cıvata")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Talepte kullan" })).toBeNull();
  });

  it("buy:listing:manage ile bağlantı görünür", async () => {
    h.perms = ["buy:listing:manage"];
    wrap(<ListingTemplatesView basePath="/company/satinalma/sablonlar" />);
    expect(await screen.findByRole("link", { name: "Talepte kullan" })).toBeInTheDocument();
  });
});

describe("QuestionTemplateDialog — sınırlar (D-261)", () => {
  it(`ad ${TEMPLATE_NAME_MAX_LENGTH} karakterle sınırlı; ${QUESTION_TEMPLATE_MAX_ITEMS} soruda Soru Ekle pasif`, async () => {
    const user = userEvent.setup();
    wrap(<QuestionTemplatesView basePath="/company/satinalma/sablonlar" />);
    await user.click(await screen.findByRole("button", { name: /Yeni Set/ }));
    expect(screen.getByPlaceholderText(/Örn/)).toHaveAttribute("maxlength", String(TEMPLATE_NAME_MAX_LENGTH));
    const add = screen.getByRole("button", { name: /Soru Ekle/ });
    for (let i = 1; i < QUESTION_TEMPLATE_MAX_ITEMS; i++) await user.click(add);
    expect(screen.getAllByRole("button", { name: /Soruyu kaldır/i })).toHaveLength(QUESTION_TEMPLATE_MAX_ITEMS);
    expect(add).toBeDisabled();
    expect(screen.getByText(/en fazla 20 soru/i)).toBeInTheDocument();
  });
});

describe("GroupTemplateDialog — yükleme sırasında Kaydet (D-260)", () => {
  it("detay gelene dek Kaydet pasif, gelince etkin", async () => {
    const user = userEvent.setup();
    wrap(<GroupTemplatesView basePath="/company/satinalma/sablonlar" />);
    await user.click(await screen.findByRole("button", { name: /Çelik.*düzenle/i }));
    const save = await screen.findByRole("button", { name: "Kaydet" });
    expect(save).toBeDisabled();
    await waitFor(() => expect(h.releaseDetail).not.toBeNull());
    h.releaseDetail!();
    await waitFor(() => expect(screen.getByRole("button", { name: "Kaydet" })).not.toBeDisabled());
  });
});
