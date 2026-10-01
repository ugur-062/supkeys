// @vitest-environment jsdom
/**
 * DAVET SEÇİCİSİ (2026-09-19 mockup + "seçilenler tablonun ALTINDA"):
 * kalemlere göre sıralama, tümünü seç, seçilenler listesi + kaldır, süzgeç
 * sırayı bozmaz; Bağlantılarım kipi = görünürlük listesi (işaretsiz görmez).
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const connections = [
  { connectionId: "c1", origin: "SENT", decidedAt: null, company: { id: "1", name: "Beta Kimya", rothernId: "BETA-0001", city: "Kocaeli", industry: "Kimyasal ürünler", activities: ["DISTRIBUTOR"], categoryIds: ["12000000", "12161500"] } },
  { connectionId: "c2", origin: "SENT", decidedAt: null, company: { id: "2", name: "Anadolu Metal", rothernId: "ANAD-0001", city: "İstanbul", industry: "Metal sanayi", activities: ["MANUFACTURER"], categoryIds: ["11000000"] } },
  { connectionId: "c3", origin: "SENT", decidedAt: null, company: { id: "3", name: "Ege Makina", rothernId: "EGEM-0001", city: "Manisa", industry: "Makine ekipmanları", activities: ["MANUFACTURER"], categoryIds: ["23000000", "23151500"], verified: true } },
];
vi.mock("@/hooks/use-company-connections", () => ({
  useConnections: () => ({ data: connections, isLoading: false }),
}));
// Tedarikçi grupları (T-19): GOLD + buy:view kapısı; şablon detayı istekle gelir.
const g = vi.hoisted(() => ({
  tier: "GOLD" as string,
  canView: true,
  groups: [] as { id: string; name: string; memberCount: number; isPublic: boolean; isOwnedByMe: boolean; createdAt: string; updatedAt: string }[],
  fetch: vi.fn(),
  enabledCalls: [] as (boolean | undefined)[],
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ company: { tier: g.tier } }),
  useHasCompanyPermission: () => g.canView,
}));
vi.mock("@/hooks/use-supplier-templates", () => ({
  useSupplierTemplates: (opts: { enabled?: boolean }) => {
    g.enabledCalls.push(opts?.enabled);
    return { data: opts?.enabled === false ? undefined : g.groups };
  },
  fetchSupplierTemplate: g.fetch,
}));

import { mergeGroupMembers, SupplierPicker } from "../supplier-picker";

describe("SupplierPicker", () => {
  it("kalem/kategori uygunluğu ÖNE gelir ve çip taşır; diğerleri ada göre", () => {
    render(<SupplierPicker value={[]} onChange={() => {}} itemNames={["Konveyör bandı"]} categoryIds={["23151500"]} />);
    const rows = within(screen.getByRole("region", { name: "Davet edilecek firmalar" })).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Ege Makina");
    expect(rows[0]).toHaveTextContent("Kalemlere uygun");
    expect(rows[1]).toHaveTextContent("Anadolu Metal");
    expect(rows[1]).not.toHaveTextContent("Kalemlere uygun");
    expect(rows[2]).toHaveTextContent("Beta Kimya");
  });

  it("kalem adı sektörle eşleşince de uygunluk puanı verir", () => {
    render(<SupplierPicker value={[]} onChange={() => {}} itemNames={["Kimyasal temizlik sıvısı"]} />);
    const rows = within(screen.getByRole("region", { name: "Davet edilecek firmalar" })).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Beta Kimya");
    expect(rows[0]).toHaveTextContent("Kalemlere uygun");
  });

  it("satır seçimi, seçilenler paneli, kaldırma ve seçimi temizle", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<SupplierPicker value={[]} onChange={onChange} />);
    await user.click(screen.getByRole("checkbox", { name: "Ege Makina seç" }));
    expect(onChange).toHaveBeenLastCalledWith(["EGEM-0001"]);
    rerender(<SupplierPicker value={["EGEM-0001", "BETA-0001"]} onChange={onChange} />);
    const panel = screen.getByRole("region", { name: "Seçilen firmalar" });
    expect(panel).toHaveTextContent("2");
    expect(within(panel).getByText("Ege Makina")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Beta Kimya davetini kaldır" }));
    expect(onChange).toHaveBeenLastCalledWith(["EGEM-0001"]);
    await user.click(within(panel).getByRole("button", { name: /Seçimi temizle/ }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("Bağlantılarım kipi: işaretliler üstte, çıkarılanlar altta ve 'Görmez'; Tümünü kaldır boşaltır; sayaç N/M", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SupplierPicker mode="connections" value={["BETA-0001", "ANAD-0001"]} onChange={onChange} itemNames={["Konveyör bandı"]} categoryIds={["23151500"]} />);
    const region = screen.getByRole("region", { name: "Bağlantılarım" });
    expect(region).toHaveTextContent("2 / 3 seçili");
    const rows = within(region).getAllByRole("row").slice(1);
    // Ege Makina kalemlere en uygun ama işaretsiz → en alta düşer ve "Görmez".
    expect(rows[0]).toHaveTextContent("Anadolu Metal");
    expect(rows[1]).toHaveTextContent("Beta Kimya");
    expect(rows[2]).toHaveTextContent("Ege Makina");
    expect(rows[2]).toHaveTextContent("Görmez");
    expect(rows[0]).toHaveTextContent("Görür");
    expect(region).toHaveTextContent("İşareti kaldırdığınız firma talebi hiç görmez");
    await user.click(within(region).getByRole("button", { name: "Tümünü kaldır" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    await user.click(within(region).getByRole("button", { name: "Tümünü seç" }));
    expect(onChange).toHaveBeenLastCalledWith(["BETA-0001", "ANAD-0001", "EGEM-0001"]);
    // Seçilenler paneli tablonun ALTINDA (DOM sırası).
    const selectedPanel = screen.getByRole("region", { name: "Seçilen firmalar" });
    expect(region.compareDocumentPosition(selectedPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Tümünü seç görünenleri seçer; süzgeç sırayı bozmadan daraltır; davet düğmesi sayıyı taşır", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onInvite = vi.fn();
    render(<SupplierPicker value={["EGEM-0001"]} onChange={onChange} onInvite={onInvite} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Şehir" }), "Manisa");
    const region = screen.getByRole("region", { name: "Davet edilecek firmalar" });
    expect(within(region).getAllByRole("row")).toHaveLength(2);
    expect(region).toHaveTextContent("1–1 / 1 firma");
    await user.click(screen.getByRole("checkbox", { name: "Görünenlerin tümünü seç" }));
    expect(onChange).toHaveBeenLastCalledWith([]); // görünen tek firma zaten seçiliydi → kaldırır
    await user.click(screen.getByRole("button", { name: "1 firmayı davet et" }));
    expect(onInvite).toHaveBeenCalledWith(1);
  });

  describe("Gruptan ekle (T-19)", () => {
    const GROUP = { id: "g1", name: "Makine tedarikçileri", memberCount: 3, isPublic: true, isOwnedByMe: true, createdAt: "", updatedAt: "" };
    beforeEach(() => {
      g.tier = "GOLD";
      g.canView = true;
      g.groups = [GROUP];
      g.enabledCalls = [];
      g.fetch.mockReset();
    });

    it("mergeGroupMembers: yalnız listedeki (geçerli bağlantı) üyeler eklenir, seçili olan tekrarlanmaz, seçim korunur", () => {
      const r = mergeGroupMembers(["BETA-0001"], ["EGEM-0001", "BETA-0001", "YOK-0001", null, "EGEM-0001"], ["BETA-0001", "ANAD-0001", "EGEM-0001"]);
      expect(r.next).toEqual(["BETA-0001", "EGEM-0001"]);
      expect(r.added).toEqual(["EGEM-0001"]);
      expect(r.skipped).toBe(2); // bağlantı olmayan + Rothern ID'siz
    });

    it("özel kipte grup seçilince üyeleri tek tıkla eklenir; bağlantı olmayan atlanır ve söylenir", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      g.fetch.mockResolvedValue({
        id: "g1",
        name: "Makine tedarikçileri",
        isPublic: true,
        members: [
          { id: "3", name: "Ege Makina", rothernId: "EGEM-0001", tier: "SILVER" },
          { id: "2", name: "Anadolu Metal", rothernId: "ANAD-0001", tier: "SILVER" },
          { id: "9", name: "Engelli Firma", rothernId: "BLOK-0001", tier: "SILVER" },
        ],
      });
      render(<SupplierPicker value={["ANAD-0001"]} onChange={onChange} />);
      await user.selectOptions(screen.getByRole("combobox", { name: "Gruptan ekle" }), "g1");
      expect(g.fetch).toHaveBeenCalledWith("g1");
      expect(onChange).toHaveBeenLastCalledWith(["ANAD-0001", "EGEM-0001"]);
      expect(await screen.findByRole("status")).toHaveTextContent(
        "“Makine tedarikçileri” grubundan 1 firma eklendi; 1 firma bağlantılarınız arasında olmadığı için eklenmedi.",
      );
    });

    it("Bağlantılarım kipinde de var; tüm üyeler zaten seçiliyse değişiklik yapılmaz", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      g.fetch.mockResolvedValue({ id: "g1", name: "Makine tedarikçileri", isPublic: true, members: [{ id: "3", name: "Ege Makina", rothernId: "EGEM-0001", tier: "SILVER" }] });
      render(<SupplierPicker mode="connections" value={["EGEM-0001", "BETA-0001"]} onChange={onChange} />);
      await user.selectOptions(screen.getByRole("combobox", { name: "Gruptan ekle" }), "g1");
      expect(onChange).not.toHaveBeenCalled();
      expect(await screen.findByRole("status")).toHaveTextContent("“Makine tedarikçileri” grubundaki firmalar zaten seçili.");
    });

    it("GOLD değilse ya da buy:view yoksa denetim çizilmez ve istek atılmaz; boş grup listelenmez", () => {
      g.tier = "SILVER";
      const { unmount } = render(<SupplierPicker value={[]} onChange={() => {}} />);
      expect(screen.queryByRole("combobox", { name: "Gruptan ekle" })).toBeNull();
      expect(g.enabledCalls.every((e) => e === false)).toBe(true);
      unmount();
      g.tier = "GOLD";
      g.canView = false;
      g.enabledCalls = [];
      const second = render(<SupplierPicker value={[]} onChange={() => {}} />);
      expect(screen.queryByRole("combobox", { name: "Gruptan ekle" })).toBeNull();
      expect(g.enabledCalls.every((e) => e === false)).toBe(true);
      second.unmount();
      g.canView = true;
      g.groups = [{ ...GROUP, memberCount: 0 }];
      render(<SupplierPicker value={[]} onChange={() => {}} />);
      expect(screen.queryByRole("combobox", { name: "Gruptan ekle" })).toBeNull();
    });
  });
});
