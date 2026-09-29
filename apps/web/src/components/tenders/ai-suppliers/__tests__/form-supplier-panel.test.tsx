// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExternalInviteTarget, MemberInviteTarget } from "@/hooks/use-supplier-discovery";
import { FormSupplierPanel } from "../form-supplier-panel";

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

function Harness() {
  const [value, setValue] = useState<ExternalInviteTarget[]>([]);
  const [members, setMembers] = useState<MemberInviteTarget[]>([]);
  latestMembers = members;
  return (
    <FormSupplierPanel
      itemNames={["Vida"]}
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
});
