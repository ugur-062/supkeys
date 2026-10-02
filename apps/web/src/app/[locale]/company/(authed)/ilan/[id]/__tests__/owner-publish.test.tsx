// @vitest-environment jsdom
/**
 * Talep detayı — sahip görünümü.
 *  · S059: "Yayınla" / "Onayı iptal et" yalnız yapışkan şeritteydi; şerit
 *    başlık görünürken `invisible` → taslağı açan sahip ilk ekranda
 *    yayınlama düğmesini hiç görmüyordu. Başlık kartı da taşımalı.
 *  · X22: hızlı talep taslağında bekletilen davetler (sessionStorage)
 *    detaydan yayınlanınca da gönderilmeli.
 *  · O-058 / T-06: yayınlama Gold ister — Gold olmayan firmada düğme yok,
 *    paket notu doğru CTA'yı verir.
 */
import type { ListingDetail } from "@/hooks/use-company-listings";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  detail: undefined as unknown,
  publish: vi.fn(),
  cancelApproval: vi.fn(),
  confirm: vi.fn(),
  post: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  company: {} as Record<string, unknown>,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "l1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/ilan/l1",
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/components/providers/confirm-dialog", () => ({
  useConfirm: () => h.confirm,
}));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: {
    get: vi.fn(async () => ({ data: [] })),
    post: h.post,
    patch: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({ data: {} })),
  },
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: { id: "u1" }, company: h.company }),
  useHasCompanyPermission: () => true,
}));
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ user: { id: "u1" }, company: h.company }),
}));
vi.mock("@/hooks/use-company-approvals", () => ({
  useCancelApproval: () => ({ mutateAsync: h.cancelApproval, isPending: false }),
}));
vi.mock("@/hooks/use-company-listings", async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return {
    ...mod,
    useListingDetail: () => ({
      data: h.detail,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }),
    usePublishListing: () => ({ mutateAsync: h.publish, isPending: false }),
  };
});

import ListingDetailPage from "../page";

function detail(over: Partial<ListingDetail> = {}): ListingDetail {
  return {
    id: "l1",
    number: "ROT-2026-0001",
    type: "ALIM",
    title: "Rulman Alımı",
    status: "DRAFT",
    format: "RFQ",
    isOwner: true,
    createdById: "u1",
    canPublish: true,
    canEdit: true,
    pendingApprovalId: null,
    primaryCurrency: "TRY",
    allowedCurrencies: [],
    categoryIds: [],
    targetCountries: [],
    items: [],
    bids: [],
    invitations: [],
    ...over,
  } as unknown as ListingDetail;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ListingDetailPage />
    </QueryClientProvider>,
  );
}

/** Görünür (yapışkan şerit DIŞINDAKİ) düğmeler — şerit `invisible` sınıflı. */
function visibleButtons(name: string) {
  return screen
    .queryAllByRole("button", { name })
    .filter((b) => !b.closest(".invisible"));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  h.company = { id: "c1", country: "TR", tier: "GOLD", companyVerificationStatus: "VERIFIED" };
  h.confirm.mockResolvedValue(true);
  h.publish.mockResolvedValue({});
  h.post.mockImplementation(async (url: string, body: { companyIds?: string[]; invites?: { email: string }[] }) => {
    if (url.endsWith("/invite-members"))
      return { data: { results: (body.companyIds ?? []).map((companyId) => ({ companyId, status: "INVITED" })) } };
    if (url.endsWith("/external-tender-invite"))
      return { data: { results: (body.invites ?? []).map((i) => ({ email: i.email, status: "QUEUED" })) } };
    return { data: {} };
  });
});

describe("Talep detayı (sahip) — Yayınla / Onayı iptal et (S059)", () => {
  it("taslakta 'Yayınla' sayfa kaydırılmadan (başlık kartında) görünür", () => {
    h.detail = detail();
    renderPage();
    expect(visibleButtons("Yayınla")).toHaveLength(1);
  });

  it("onay bekleyen kazandırmada 'Onayı iptal et' başlık kartında görünür", () => {
    h.detail = detail({ status: "IN_AWARD_APPROVAL", canPublish: false, pendingApprovalId: "ap1" } as Partial<ListingDetail>);
    renderPage();
    expect(visibleButtons("Onayı İptal Et")).toHaveLength(1);
  });

  it("Gold olmayan firmada taslakta Yayınla yok; paket notu Gold'a yönlendirir (T-06)", () => {
    h.company = { id: "c1", country: "TR", tier: "SILVER", companyVerificationStatus: "VERIFIED" };
    h.detail = detail();
    renderPage();
    expect(visibleButtons("Yayınla")).toHaveLength(0);
    expect(screen.getByRole("note")).toHaveTextContent(/Gold paket gerektirir/);
    expect(screen.getByRole("link", { name: "Gold'a geç" })).toHaveAttribute("href", "/company/premium");
  });

  it("yayınlanabilir değilse başlık kartında Yayınla yok", () => {
    h.detail = detail({ status: "OPEN", canPublish: false });
    renderPage();
    expect(visibleButtons("Yayınla")).toHaveLength(0);
  });
});

describe("Talep detayı (sahip) — taslakta bekleyen davetler (X22)", () => {
  it("detaydan yayınlanınca bekleyen üye + dış davetler gönderilir ve silinir", async () => {
    sessionStorage.setItem(
      "quick-request-external-invites:l1",
      JSON.stringify([{ email: "a@firma.com", locale: "tr", country: "TR" }, "b@firma.de"]),
    );
    sessionStorage.setItem(
      "quick-request-member-invites:l1",
      JSON.stringify([{ companyId: "c9", name: "Üye A.Ş." }]),
    );
    h.detail = detail();
    renderPage();
    await userEvent.setup().click(visibleButtons("Yayınla")[0]);
    await waitFor(() => expect(h.publish).toHaveBeenCalled());
    // Onay metni bekleyen davet sayısını söyler.
    expect(h.confirm.mock.calls[0][0].description).toMatch(/3 davet/);
    await waitFor(() =>
      expect(h.post).toHaveBeenCalledWith(
        "/company/connections/external-tender-invite",
        expect.objectContaining({
          listingId: "l1",
          source: "AI_FORM",
          invites: [
            { email: "a@firma.com", locale: "tr", country: "TR" },
            expect.objectContaining({ email: "b@firma.de" }),
          ],
        }),
        expect.anything(),
      ),
    );
    expect(h.post).toHaveBeenCalledWith(
      "/company/ai/supplier-discovery/listings/l1/invite-members",
      { companyIds: ["c9"] },
    );
    expect(sessionStorage.getItem("quick-request-external-invites:l1")).toBeNull();
    expect(sessionStorage.getItem("quick-request-member-invites:l1")).toBeNull();
  });

  it("yayın başarısızsa davet gönderilmez, bekleyenler saklı kalır", async () => {
    sessionStorage.setItem("quick-request-member-invites:l1", JSON.stringify([{ companyId: "c9", name: "X" }]));
    h.publish.mockRejectedValue(new Error("fail"));
    h.detail = detail();
    renderPage();
    await userEvent.setup().click(visibleButtons("Yayınla")[0]);
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.post).not.toHaveBeenCalledWith(
      expect.stringContaining("invite-members"),
      expect.anything(),
    );
    expect(sessionStorage.getItem("quick-request-member-invites:l1")).not.toBeNull();
  });

  it("davet gönderimi hata verirse liste saklı kalır (yayın geri alınmaz)", async () => {
    sessionStorage.setItem("quick-request-member-invites:l1", JSON.stringify([{ companyId: "c9", name: "X" }]));
    h.post.mockRejectedValue(new Error("net"));
    h.detail = detail();
    renderPage();
    await userEvent.setup().click(visibleButtons("Yayınla")[0]);
    await waitFor(() => expect(h.toast.warning).toHaveBeenCalled());
    expect(h.toast.success).toHaveBeenCalled();
    expect(sessionStorage.getItem("quick-request-member-invites:l1")).not.toBeNull();
  });
});

describe("Talep detayı (sahip) — meta şeridi Kapanış (G1)", () => {
  it("iki satırlı Kapanış değeri truncate/nowrap ile kırpılmaz", () => {
    h.detail = detail({ status: "OPEN", closesAt: "2026-08-28T15:00:00.000Z" } as Partial<ListingDetail>);
    renderPage();
    const label = screen.getByText("Kapanış", { selector: "p" });
    const value = label.nextElementSibling as HTMLElement;
    // Blok çocuklarda ellipsis oluşmaz → truncate tarihi uyarısız keserdi.
    expect(value.querySelectorAll("span.block")).toHaveLength(2);
    expect(value.className).not.toMatch(/\btruncate\b/);
    expect(value.className).toMatch(/\bmin-w-0\b/);
  });

  it("para birimi değeri kırpılmaz (multiline) ama title korunur", () => {
    h.detail = detail({ status: "OPEN" });
    renderPage();
    // Çok birimli liste ("TRY, USD, EUR") 390 px'te kesiliyordu ve tam değer
    // yalnız dokunmatikte açılmayan title'daydı → değer artık sarar.
    const value = screen.getByTitle("TRY");
    expect(value.className).not.toMatch(/\btruncate\b/);
    expect(value.className).toMatch(/\bmin-w-0\b/);
    expect(value).toHaveTextContent("TRY");
  });
});
