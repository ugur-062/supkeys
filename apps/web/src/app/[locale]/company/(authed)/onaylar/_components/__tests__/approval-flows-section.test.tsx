// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  users: [] as unknown[],
  flows: [] as unknown[],
  me: { id: "me", roles: ["YONETICI"] } as Record<string, unknown>,
  companyUsersCalled: false,
  tier: "GOLD",
  /** Akış listesi okunamadı (kesinti): veri yok, `isError`. */
  flowsFailed: false,
}));

vi.mock("@/hooks/use-company-approvals", () => ({
  useApprovalFlows: () =>
    h.flowsFailed
      ? { data: undefined, isLoading: false, isPending: false, isError: true, refetch: vi.fn() }
      : { data: h.flows, isLoading: false },
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
    company: { tier: h.tier },
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
  h.tier = "GOLD";
  h.flowsFailed = false;
});

/**
 * Son canlı kontrol OUTF-4: hata kartı "Bağlantı sorunu olabilir" diyordu —
 * hemen üstündeki "Sunucuya şu anda ulaşılamıyor" notuyla çelişen, kullanıcının
 * kendi bağlantısını işaret eden bir cümle. Kart nedeni tahmin etmez.
 */
describe("ApprovalFlowsSection — liste okunamadı (OUTF-4)", () => {
  it("hata kartı nötr: kullanıcının bağlantısı suçlanmaz", () => {
    h.flowsFailed = true;
    render(<ApprovalFlowsSection canManage />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Onay akışları yüklenemedi");
    expect(alert).toHaveTextContent("Lütfen yeniden deneyin.");
    expect(alert).not.toHaveTextContent(/bağlantı/i);
  });

  it("yeniden deneme düğmesi cümle düzeninde: 'Yeniden dene' (kapanış kontrolü OUTC-1 — 'Yeniden Dene' idi)", () => {
    h.flowsFailed = true;
    render(<ApprovalFlowsSection canManage />);
    const buttons = within(screen.getByRole("alert")).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Yeniden dene"]);
  });
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

  /**
   * Arayüz testi kapanış NUM: bütçe eşiği `type="number"` idi; Türkçe "12,50"
   * 1.250 TL, "1.500" 1,5 TL eşik oluyordu. Artık yerel para girişi.
   */
  it("bütçe eşiği TR '1.500' = 1.500 TL, '12,50' = 12,50 TL (NUM)", async () => {
    h.users = [user("u1", ["ONAYLAYICI"])];
    render(<ApprovalFlowsSection canManage openNew />);
    const nameInput = screen.queryByLabelText(/Akış adı|Akış Adı/i);
    if (nameInput) fireEvent.change(nameInput, { target: { value: "Test" } });
    const next = screen.queryByRole("button", { name: /İleri|Devam/i });
    if (next) fireEvent.click(next);
    fireEvent.click(await screen.findByRole("button", { name: "Onaycı Ekle" }));
    const threshold = screen.getByPlaceholderText(/Boş/) as HTMLInputElement;
    fireEvent.change(threshold, { target: { value: "1.500" } });
    fireEvent.blur(threshold);
    expect(threshold.value).toBe("1.500");
    fireEvent.change(threshold, { target: { value: "12,50" } });
    fireEvent.blur(threshold);
    expect(threshold.value).toBe("12,50");
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

describe("ApprovalFlowsSection — yeni onaycı seçici varsayılanı (arayüz testi D-097)", () => {
  it("seçici BOŞ açılır: giriş yapan kişi önceden seçilmez, 'kendinizi seçtiniz' uyarısı çıkmaz", async () => {
    h.users = [user("me", ["KURUCU"]), user("u1", ["ONAYLAYICI"])];
    render(<ApprovalFlowsSection canManage openNew />);
    const nameInput = screen.queryByLabelText(/Akış adı|Akış Adı/i);
    if (nameInput) fireEvent.change(nameInput, { target: { value: "Test" } });
    const next = screen.queryByRole("button", { name: /İleri|Devam/i });
    if (next) fireEvent.click(next);
    fireEvent.click(await screen.findByRole("button", { name: "Onaycı Ekle" }));
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(document.body.textContent).not.toContain("Kendinizi");
    expect(screen.getByRole("button", { name: "Ekle" })).toBeDisabled();
    // Kendini bilinçli seçince uyarı yine görünür (INV-APPR-1).
    fireEvent.change(select, { target: { value: "me" } });
    expect(document.body.textContent).toMatch(/Kendinizi/);
  });
});

describe("ApprovalFlowsSection — erişim (doğrulama) kapısı (derin denetim LU-21; ücretsiz dönem)", () => {
  const flow = {
    id: "f1",
    name: "Büyük alımlar",
    type: "LISTING_AWARD",
    listingType: null,
    status: "ACTIVE",
    initiatorRoles: [],
    steps: [],
    createdAt: "2026-09-01T00:00:00.000Z",
  };

  it("erişim yetmiyor: yeni akış / kopyala yok, doğrulama notu var (paket adı yok); düzenle ve sil kalır; openNew sihirbazı açmaz", () => {
    h.tier = "SILVER";
    h.flows = [flow];
    render(<ApprovalFlowsSection canManage openNew />);
    expect(screen.queryByRole("button", { name: /Yeni Onay Akışı/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Kopyala" })).toBeNull();
    const note = screen.getByText(/akış kopyalamak firma doğrulaması gerektirir/);
    expect(note).not.toHaveTextContent(/Gold|Silver|paket/i);
    expect(screen.getByRole("button", { name: /Düzenle/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Devam: Onay Adımları/ })).toBeNull();
  });

  it("erişim yetmiyor, boş liste: 'İlk akışı oluştur' yok", () => {
    h.tier = "STANDART";
    render(<ApprovalFlowsSection canManage />);
    expect(screen.queryByRole("button", { name: /İlk/i })).toBeNull();
    expect(screen.getByText(/firma doğrulaması gerektirir/)).toBeInTheDocument();
  });

  it("tam erişim: yeni akış ve kopyala görünür", () => {
    h.flows = [flow];
    render(<ApprovalFlowsSection canManage />);
    expect(screen.getByRole("button", { name: /Yeni Onay Akışı/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kopyala" })).toBeInTheDocument();
    expect(screen.queryByText(/firma doğrulaması gerektirir/)).toBeNull();
  });
});
