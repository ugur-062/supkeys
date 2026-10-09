// @vitest-environment jsdom
/**
 * KULLANICI YÖNETİMİ — liste durumları (canlı doğrulama 2026-10-09, OUTR-4).
 *
 * GERÇEK `useCompanyUsers` kancası + gerçek QueryClient; yalnız `companyApi`
 * sahte. 6 kullanıcılı firmada kesinti "KULLANICILAR (0)" başlığı altında
 * "Kullanıcılar yüklenemedi" diye okunuyordu.
 */
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn<(url: string) => Promise<{ data: unknown }>>() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: h.get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { CompanyUsersSection } from "../company-users-section";

const networkError = Object.assign(new Error("Network Error"), { isAxiosError: true });

const user = (id: string, firstName: string, over: Record<string, unknown> = {}) => ({
  id,
  email: `${firstName.toLowerCase()}@firma.com`,
  firstName,
  lastName: "Yılmaz",
  phone: null,
  roles: ["SATIN_ALMACI"],
  isOwner: false,
  isActive: true,
  lastLoginAt: null,
  permissions: ["buy:view"],
  rolePermissions: [],
  permissionsOverride: { added: [], removed: [] },
  ...over,
});

/** API ayakta: yalnız kullanıcı listesi dolu; öteki uçlar boş. */
function apiUp(users: unknown[]) {
  h.get.mockImplementation(async (url: string) => {
    if (url === "/company/users") return { data: users };
    if (url === "/company/users/invitations") return { data: [] };
    throw networkError;
  });
}
const apiDown = () => h.get.mockRejectedValue(networkError);

let client: QueryClient;
const view = () =>
  render(
    <QueryClientProvider client={client}>
      <CompanyUsersSection canManage meId="u1" />
    </QueryClientProvider>,
  );
const heading = () => screen.getByRole("heading", { level: 3 });

beforeEach(() => {
  h.get.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  onlineManager.setOnline(true);
  client.clear();
});

describe("CompanyUsersSection — liste durumları (OUTR-4)", () => {
  it("kesinti: başlıkta '(0)' YOK; hata + Yeniden dene, 'henüz kullanıcı yok' yok", async () => {
    apiDown();
    view();
    expect(await screen.findByText("Kullanıcılar yüklenemedi.")).toBeInTheDocument();
    expect(heading()).toHaveTextContent(/^Kullanıcılar$/);
    expect(heading().textContent).not.toMatch(/\d/);
    expect(screen.getByRole("button", { name: "Yeniden dene" })).toBeInTheDocument();
    expect(screen.queryByText(/Henüz kullanıcı yok/)).toBeNull();
  });

  it("çevrimdışı duraklayan sorgu (istek yok, hata yok, veri yok): sayaçsız başlık + 'Yükleniyor…'", async () => {
    onlineManager.setOnline(false);
    apiDown();
    view();
    await act(async () => {});
    expect(h.get).not.toHaveBeenCalled();
    expect(heading()).toHaveTextContent(/^Kullanıcılar$/);
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
    expect(screen.queryByText(/Henüz kullanıcı yok/)).toBeNull();
    expect(screen.queryByText("Kullanıcılar yüklenemedi.")).toBeNull();
  });

  it("okunmuş listede sayı yazılır; arka plan yenilemesi düşünce sayı ve satırlar kalır", async () => {
    apiUp([user("u1", "Ada", { isOwner: true, roles: ["SAHIP"] }), user("u2", "Bora")]);
    view();
    await waitFor(() => expect(heading()).toHaveTextContent("Kullanıcılar (2)"));
    expect(screen.getByText("Bora Yılmaz")).toBeInTheDocument();

    apiDown();
    await act(async () => {
      await client.refetchQueries({ queryKey: ["company-users"], exact: true });
    });
    await waitFor(() => expect(client.getQueryState(["company-users"])?.status).toBe("error"));

    expect(screen.queryByText("Kullanıcılar yüklenemedi.")).toBeNull();
    expect(heading()).toHaveTextContent("Kullanıcılar (2)");
    expect(screen.getByText("Bora Yılmaz")).toBeInTheDocument();
  });

  it("başarılı ve BOŞ yanıt: sayı gerçekten 0'dır ve boş durum çizilir", async () => {
    apiUp([]);
    view();
    await waitFor(() => expect(heading()).toHaveTextContent("Kullanıcılar (0)"));
    expect(screen.getByText(/Henüz kullanıcı yok/)).toBeInTheDocument();
  });
});
