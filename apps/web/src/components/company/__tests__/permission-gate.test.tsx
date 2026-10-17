// @vitest-environment jsdom
/**
 * İzin kapısı metni (arayüz testi D-301): sahibe özel izinde "firma
 * yöneticinize başvurun" değil kurucuya yönlendirir; geri bağlantısı verilebilir.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { PermissionGate } from "../permission-gate";

afterEach(() => useCompanyAuthStore.setState({ user: null, company: null } as never));

describe("PermissionGate", () => {
  it("sahibe özel izin (billing:manage): kurucuya yönlendirir + geri bağlantısı", () => {
    useCompanyAuthStore.setState({ user: { permissions: ["company:manage", "users:manage"], roles: [], isOwner: false } } as never);
    render(
      <PermissionGate permission="billing:manage" description="Banka hesaplarını yalnız firma kurucusu yönetir." backHref="/company/ayarlar" backLabel="Ayarlar'a dön">
        <div>GİZLİ</div>
      </PermissionGate>,
    );
    expect(screen.queryByText("GİZLİ")).toBeNull();
    expect(screen.getByText(/firma kurucusuna başvurun/)).toBeInTheDocument();
    expect(screen.queryByText(/firma yöneticinize başvurun/)).toBeNull();
    expect(screen.getByRole("link", { name: "Ayarlar'a dön" })).toHaveAttribute("href", "/company/ayarlar");
  });

  it("tabloda verilebilen izin: yöneticiye yönlendirir, geri bağlantısı yoksa çizilmez", () => {
    render(
      <PermissionGate permission="users:manage" description="Bu sayfa “Kullanıcı ve yetki” tikini ister.">
        <div>GİZLİ</div>
      </PermissionGate>,
    );
    expect(screen.getByText(/firma yöneticinize başvurun/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("tierFirst: paket yetmiyorsa izin notu yerine içerik (sayfanın paket kilidi) çizilir; paket yeterse izin notu (arayüz testi T3)", () => {
    useCompanyAuthStore.setState({
      user: { permissions: ["sell:view"], roles: [], isOwner: false },
      company: { tier: "STANDART" },
    } as never);
    const { unmount } = render(
      <PermissionGate tierFirst="SILVER" permission={["users:manage", "company:manage"]} description="x">
        <div>PAKET KİLİDİ</div>
      </PermissionGate>,
    );
    expect(screen.getByText("PAKET KİLİDİ")).toBeInTheDocument();
    expect(screen.queryByText(/firma yöneticinize başvurun/)).toBeNull();
    unmount();
    useCompanyAuthStore.setState({ company: { tier: "SILVER" } } as never);
    render(
      <PermissionGate tierFirst="SILVER" permission={["users:manage", "company:manage"]} description="x">
        <div>PAKET KİLİDİ</div>
      </PermissionGate>,
    );
    expect(screen.queryByText("PAKET KİLİDİ")).toBeNull();
    expect(screen.getByText(/firma yöneticinize başvurun/)).toBeInTheDocument();
  });
});
