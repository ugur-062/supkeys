// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ detail: vi.fn() }));
vi.mock("@/hooks/use-admin-companies", () => ({
  useCompanyDetail: () => h.detail(),
  useCompanyAction: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-admin-auth", () => ({ useAdminAuth: () => ({ admin: { role: "SUPPORT" } }) }));

import { CompanyDetailView } from "../company-detail-view";

/**
 * Yayın denetimi 2026-09-28 Bölüm 6: firma detayı SUPER_ADMIN + SALES'e açık;
 * Destek rolü 403'te genel hata + işe yaramayan "Tekrar dene" görüyordu.
 */
describe("CompanyDetailView — yetki hatası", () => {
  beforeEach(() => h.detail.mockReset());

  it("403: yetki mesajı gösterir, 'Tekrar dene' YOK", () => {
    h.detail.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: { response: { status: 403 } }, refetch: vi.fn() });
    render(<CompanyDetailView companyId="c1" />);
    expect(screen.getByText(/görüntüleme yetkiniz yok/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tekrar dene" })).toBeNull();
  });

  it("diğer hatalar: genel mesaj + 'Tekrar dene'", () => {
    h.detail.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: { response: { status: 500 } }, refetch: vi.fn() });
    render(<CompanyDetailView companyId="c1" />);
    expect(screen.getByText("Firma yüklenemedi.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
  });
});
