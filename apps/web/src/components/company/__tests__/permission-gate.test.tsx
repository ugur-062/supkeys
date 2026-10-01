// @vitest-environment jsdom
/**
 * İzin kapısı metni (arayüz testi D-301): sahibe özel izinde "firma
 * yöneticinize başvurun" değil kurucuya yönlendirir; geri bağlantısı verilebilir.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { PermissionGate } from "../permission-gate";

afterEach(() => useCompanyAuthStore.setState({ user: null } as never));

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
});
