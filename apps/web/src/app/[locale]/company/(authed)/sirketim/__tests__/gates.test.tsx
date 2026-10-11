// @vitest-environment jsdom
/**
 * Şirketim alan kapısı + Profil sayfa kapısı (arayüz testi O-062, O-101):
 * tek "Ziyaret edenler" / "Satınalma raporları" tikli kişi alana girer;
 * yalnız "Kullanıcı ve yetki" tikli kişi Profil'de 403 yerine kapı görür.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/company/my-profile-view", () => ({
  MyProfileView: () => <div data-testid="profile-view">PROFIL</div>,
}));

import { useCompanyAuthStore } from "@/lib/company-auth/store";
import SirketimLayout from "../layout";
import SirketimProfilPage from "../profil/page";

const setPerms = (...permissions: string[]) =>
  useCompanyAuthStore.setState({ user: { permissions, roles: [], isOwner: false } } as never);

afterEach(() => useCompanyAuthStore.setState({ user: null } as never));

describe("Şirketim alan kapısı", () => {
  it.each([["insights:view"], ["buy:reports:view"], ["users:manage"]])("yalnız %s → alan açılır", (perm) => {
    setPerms(perm);
    render(
      <SirketimLayout>
        <div data-testid="child">ALAN</div>
      </SirketimLayout>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("yalnız onaylama izni → alan kapısı", () => {
    setPerms("approval:act");
    render(
      <SirketimLayout>
        <div data-testid="child">ALAN</div>
      </SirketimLayout>,
    );
    expect(screen.queryByTestId("child")).toBeNull();
    expect(screen.getByText("Şirketim alanı yetki gerektirir")).toBeInTheDocument();
  });
});

describe("Profil sayfa kapısı", () => {
  it("yalnız users:manage → profil isteği atılmaz, kapı görünür", () => {
    setPerms("users:manage");
    render(<SirketimProfilPage />);
    expect(screen.queryByTestId("profile-view")).toBeNull();
    expect(screen.getByText("Profil yetki gerektirir")).toBeInTheDocument();
  });

  it("sell:view → profil açılır", () => {
    setPerms("sell:view");
    render(<SirketimProfilPage />);
    expect(screen.getByTestId("profile-view")).toBeInTheDocument();
  });
});
