// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  users: [] as unknown[],
  flows: [] as unknown[],
}));

vi.mock("@/hooks/use-company-approvals", () => ({
  useApprovalFlows: () => ({ data: h.flows, isLoading: false }),
  useCreateApprovalFlow: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateApprovalFlow: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteApprovalFlow: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDuplicateApprovalFlow: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetApprovalFlowStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-company-users", () => ({
  useCompanyUsers: () => ({ data: h.users, isLoading: false }),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({
    user: { id: "me", roles: ["YONETICI"] },
    company: { tier: "GOLD" },
  }),
}));
vi.mock("@/components/providers/confirm-dialog", () => ({
  useConfirm: () => vi.fn(),
}));

import { ApprovalFlowsSection } from "../approval-flows-section";

function user(id: string, roles: string[], active = true) {
  return {
    id,
    firstName: `Ad${id}`,
    lastName: `Soyad${id}`,
    email: `${id}@x.com`,
    roles,
    isActive: active,
    isOwner: false,
    lastLoginAt: null,
    phone: null,
    rolePermissions: [],
    permissionsOverride: { added: [], removed: [] },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.users = [];
  h.flows = [];
});

describe("ApprovalFlowsSection — onaycı seçici keşfedilebilirlik", () => {
  it("statik bilgi notu Kurucu'yu da sayar + rol-verme yönlendirmesi", () => {
    h.users = [user("u1", ["ONAYLAYICI"])];
    render(<ApprovalFlowsSection canManage openNew />);
    // Statik not sihirbazın 2. adımında (yardım paneli) — adımı geç.
    const nameInput = screen.queryByLabelText(/Akış adı/i);
    if (nameInput) fireEvent.change(nameInput, { target: { value: "Test" } });
    fireEvent.click(screen.getByRole("button", { name: /Devam: Onay Adımları/ }));
    // Metin <strong>/<Link> ile bölünüyor → düz textContent üzerinden doğrula.
    expect(document.body.textContent).toContain(
      "Kurucu, Yönetici veya Onaylayıcı",
    );
    expect(document.body.textContent).toContain("Onaylayıcı rolü verin");
  });

  it("onaycı-ekle dialogunda seçilebilir kimse yoksa yönlendirmeli boş-durum", async () => {
    h.users = [user("u1", ["SATIN_ALMACI"])]; // onaycı havuzu BOŞ
    render(<ApprovalFlowsSection canManage openNew />);
    // Adım 2'ye geç (akış adı zorunluysa doldur).
    const nameInput = screen.queryByLabelText(/Akış adı|Akış Adı/i);
    if (nameInput) fireEvent.change(nameInput, { target: { value: "Test" } });
    const next = screen.queryByRole("button", { name: /İleri|Devam/i });
    if (next) fireEvent.click(next);
    const addBtn = await screen.findByRole("button", { name: "Onaycı Ekle" });
    fireEvent.click(addBtn);
    expect(document.body.textContent).toContain(
      "Onaycı olabilecek aktif kullanıcı yok",
    );
    // Kaydet/Ekle butonu kilitli (approverUserId boş).
    expect(screen.getByRole("button", { name: "Ekle" })).toBeDisabled();
  });

  it("onaycı varken seçici altında liste-kuralı açıklaması render edilir", async () => {
    h.users = [user("u1", ["ONAYLAYICI"]), user("u2", ["SATISCI"])];
    render(<ApprovalFlowsSection canManage openNew />);
    const nameInput = screen.queryByLabelText(/Akış adı|Akış Adı/i);
    if (nameInput) fireEvent.change(nameInput, { target: { value: "Test" } });
    const next = screen.queryByRole("button", { name: /İleri|Devam/i });
    if (next) fireEvent.click(next);
    const addBtn = await screen.findByRole("button", { name: "Onaycı Ekle" });
    fireEvent.click(addBtn);
    expect(document.body.textContent).toContain(
      "rolündeki aktif kullanıcılar listelenir",
    );
  });
});
