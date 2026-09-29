// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  users: [] as unknown[],
  flows: [] as unknown[],
  me: { id: "me", roles: ["YONETICI"] } as Record<string, unknown>,
  companyUsersCalled: false,
}));

vi.mock("@/hooks/use-company-approvals", () => ({
  useApprovalFlows: () => ({ data: h.flows, isLoading: false }),
  // Sunucu (GET company/approvals/approver-candidates) yalnız aktif +
  // approval:act taşıyanları döner — mock da süzülmüş listeyi verir.
  useApproverCandidates: () => ({ data: h.users, isLoading: false }),
  useCreateApprovalFlow: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateApprovalFlow: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteApprovalFlow: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDuplicateApprovalFlow: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetApprovalFlowStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-company-users", () => ({
  useCompanyUsers: () => {
    h.companyUsersCalled = true;
    return { data: [], isLoading: false };
  },
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({
    user: h.me,
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
  h.me = { id: "me", roles: ["YONETICI"] };
  h.companyUsersCalled = false;
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
    h.users = []; // onaycı havuzu BOŞ (sunucu SA-only kullanıcıyı süzer)
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
    h.users = [user("u1", ["ONAYLAYICI"])];
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

  it("yalnız approvals:manage taşıyan üye: adaylar onay ucundan gelir, kapalı Kullanıcılar sayfasına link yok (derin denetim MU-23)", async () => {
    h.me = {
      id: "me",
      roles: ["ONAYLAYICI"],
      permissions: ["approvals:manage", "approval:act"],
    };
    h.users = [user("u1", ["ONAYLAYICI"])];
    render(<ApprovalFlowsSection canManage openNew />);
    const nameInput = screen.queryByLabelText(/Akış adı|Akış Adı/i);
    if (nameInput) fireEvent.change(nameInput, { target: { value: "Test" } });
    const next = screen.queryByRole("button", { name: /İleri|Devam/i });
    if (next) fireEvent.click(next);
    const addBtn = await screen.findByRole("button", { name: "Onaycı Ekle" });
    fireEvent.click(addBtn);
    // users:manage isteyen GET company/users hiç çağrılmaz.
    expect(h.companyUsersCalled).toBe(false);
    expect(screen.getByRole("option", { name: /Adu1 Soyadu1/ })).toBeTruthy();
    expect(
      document.querySelector('a[href*="ayarlar/kullanicilar"]'),
    ).toBeNull();
  });

  it("users:manage taşıyan üyede Kullanıcılar linki kalır", async () => {
    h.users = [user("u1", ["ONAYLAYICI"])];
    render(<ApprovalFlowsSection canManage openNew />);
    const nameInput = screen.queryByLabelText(/Akış adı|Akış Adı/i);
    if (nameInput) fireEvent.change(nameInput, { target: { value: "Test" } });
    const next = screen.queryByRole("button", { name: /İleri|Devam/i });
    if (next) fireEvent.click(next);
    fireEvent.click(await screen.findByRole("button", { name: "Onaycı Ekle" }));
    expect(
      document.querySelector('a[href*="ayarlar/kullanicilar"]'),
    ).not.toBeNull();
  });
});
