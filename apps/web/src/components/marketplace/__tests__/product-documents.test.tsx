// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: api }));

import { ProductDocuments } from "../product-documents";

/**
 * T-18 / D-331 (webA-03 yeniden doğrulama): belge indirme ÜYEYE. Misafir giriş
 * CTA'sını görür; oturumlu üye (satış koltuğu dahil) giriş bağlantısı yerine
 * üye ucundan gelen indirme bağlantısını görür — eskiden oturumlu kullanıcıya
 * da "giriş yapın" basılıyor ve döngüye giriyordu.
 */
function renderDocs() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProductDocuments
        documents={[{ title: "Teknik Föy" }]}
        companySlug="satici"
        productSlug="pres"
        loginHref="/company/login?next=%2Fcompany%2Furun%2Fsatici%2Fpres%23belgeler"
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.get.mockReset();
  useCompanyAuthStore.setState({ isHydrated: true, user: null, company: null });
});

describe("ProductDocuments", () => {
  it("misafir: yalnız ad + giriş CTA'sı, üye ucu çağrılmaz", () => {
    renderDocs();
    expect(screen.getByText("Teknik Föy")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Belgeyi indirmek için giriş yapın" })).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("oturumlu üye (satınalma izni yok): indirme bağlantısı, giriş CTA'sı yok", async () => {
    useCompanyAuthStore.setState({
      isHydrated: true,
      user: { id: "u", permissions: ["sell:view"], roles: [] } as never,
      company: { tier: "SILVER", slug: "baska" } as never,
    });
    api.get.mockResolvedValue({ data: { documents: [{ url: "https://cdn.example.com/foy.pdf", title: "Teknik Föy" }] } });
    renderDocs();
    expect(screen.queryByRole("link", { name: "Belgeyi indirmek için giriş yapın" })).toBeNull();
    const link = await screen.findByRole("link", { name: "Teknik Föy" });
    expect(link).toHaveAttribute("href", "https://cdn.example.com/foy.pdf");
    expect(api.get).toHaveBeenCalledWith("/company/market/documents/satici/pres");
  });

  it("oturumlu üye, uç hata verir: giriş CTA'sı yerine hata notu", async () => {
    useCompanyAuthStore.setState({
      isHydrated: true,
      user: { id: "u", permissions: [], roles: [] } as never,
      company: { tier: "STANDART", slug: "baska" } as never,
    });
    api.get.mockRejectedValue(new Error("x"));
    renderDocs();
    await waitFor(() => expect(screen.getByText(/Belgeler şu an yüklenemedi/)).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "Belgeyi indirmek için giriş yapın" })).toBeNull();
  });
});
