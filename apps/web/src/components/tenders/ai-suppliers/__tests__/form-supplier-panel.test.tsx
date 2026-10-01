// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExternalInviteTarget, MemberInviteTarget } from "@/hooks/use-supplier-discovery";
import { FormSupplierPanel, remapSingleItemMatch } from "../form-supplier-panel";

/**
 * Derin denetim S082: kullanıcının işaretini kaldırdığı Rothern üyesi, web
 * araması aynı üyeyi (e-posta anahtarıyla) döndürünce yeniden seçilmemeli.
 */
const h = vi.hoisted(() => ({
  platform: vi.fn(),
  external: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-supplier-discovery", () => ({
  useSupplierDiscovery: () => ({ mutateAsync: h.platform, isPending: false }),
  useExternalSupplierDiscovery: () => ({ mutateAsync: h.external, isPending: false }),
}));

let latestMembers: MemberInviteTarget[] = [];
let latestValue: ExternalInviteTarget[] = [];

function Harness({ items = ["Vida"] }: { items?: string[] }) {
  const [value, setValue] = useState<ExternalInviteTarget[]>([]);
  const [members, setMembers] = useState<MemberInviteTarget[]>([]);
  latestMembers = members;
  latestValue = value;
  return (
    <FormSupplierPanel
      itemNames={items}
      categoryIds={[]}
      targetCountries={[]}
      buyerCountry="TR"
      available
      value={value}
      onChange={setValue}
      members={members}
      onMembersChange={setMembers}
    />
  );
}

beforeEach(() => {
  sessionStorage.clear();
  latestMembers = [];
  latestValue = [];
  h.platform.mockReset();
  h.external.mockReset();
});

describe("FormSupplierPanel", () => {
  it("işareti kaldırılan üye, web araması aynı üyeyi döndürünce yeniden seçilmez", async () => {
    h.platform.mockResolvedValue([
      {
        companyId: "X",
        name: "Üye X",
        city: null,
        country: "TR",
        rothernId: "RX",
        matchedCategories: [],
        strongMatch: true,
        matchedItems: [1],
        connectionStatus: "NONE",
      },
    ]);
    let resolveWeb: (v: unknown) => void = () => undefined;
    h.external.mockReturnValue(new Promise((r) => (resolveWeb = r)));

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "AI ile tedarikçi bul" }));

    await waitFor(() => expect(latestMembers.map((m) => m.companyId)).toEqual(["X"]));
    // İlk turda web boş döner; kullanıcı üyeyi çıkarır; "Yeniden ara" turunda
    // web araması aynı üyeyi e-posta anahtarıyla (satis@x.com) getirir.
    await act(async () => {
      resolveWeb([]);
    });
    const box = await screen.findByRole("checkbox", { name: /Üye X/ });
    expect((box as HTMLInputElement).checked).toBe(true);
    fireEvent.click(box);
    await waitFor(() => expect(latestMembers).toEqual([]));

    h.external.mockResolvedValue([
      {
        name: "Üye X",
        city: null,
        country: "TR",
        website: "x.com",
        email: "satis@x.com",
        reason: "r",
        matchedItems: [1],
        scope: "LOCAL",
        status: "MEMBER",
        memberCompanyId: "X",
      },
    ]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Yeniden ara" }));
    });
    await waitFor(() => expect(h.external).toHaveBeenCalledTimes(2));
    await act(async () => undefined);
    expect(latestMembers).toEqual([]);
  });

  it("tek kalemli eşleşme: API kalemi işaretlemediyse boş kalır, işaretlediyse formdaki sıraya çevrilir (O-057)", () => {
    const base = { key: "a@x.com", name: "A", email: "a@x.com", website: null, city: null, country: "TR", reason: "", scope: null, status: "SUGGESTED" as const, recentlyInvited: false, memberCompanyId: null };
    expect(remapSingleItemMatch({ ...base, matchedItems: [] }, "Somun", ["Vida", "Somun"]).matchedItems).toEqual([]);
    expect(remapSingleItemMatch({ ...base, matchedItems: [1] }, "Somun", ["Vida", "Somun"]).matchedItems).toEqual([2]);
  });

  it("'daha fazla bul': eşleşmesi boş dönen firmalar kalemi karşılamış sayılmaz ve seçili gelmez (O-057)", async () => {
    h.platform.mockResolvedValue([]);
    const ext = (name: string, matchedItems: number[]) => ({
      name,
      city: null,
      country: "TR",
      website: null,
      email: `${name.toLowerCase()}@x.com`,
      reason: "r",
      matchedItems,
      scope: "LOCAL",
      status: "SUGGESTED",
      memberCompanyId: null,
    });
    // İlk arama: yalnız 1. kalem (Vida) karşılanır.
    h.external.mockResolvedValueOnce([ext("Alfa", [1])]);
    render(<Harness items={["Vida", "Somun"]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "AI ile tedarikçi bul" }));
    });
    await waitFor(() => expect(latestValue.map((v) => v.email)).toEqual(["alfa@x.com"]));
    // Somun için daha fazla bul: Beta kalemi karşılıyor, Gama karşılamıyor.
    h.external.mockResolvedValueOnce([ext("Beta", [1]), ext("Gama", [])]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Somun için daha fazla bul" }));
    });
    await waitFor(() => expect(h.external).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(latestValue.map((v) => v.email).sort()).toEqual(["alfa@x.com", "beta@x.com"]));
    expect(screen.getByText(/2\/2 kalem karşılandı/)).toBeInTheDocument();
    expect((screen.getByRole("checkbox", { name: /Gama/ }) as HTMLInputElement).checked).toBe(false);
  });
});
