// @vitest-environment jsdom
/**
 * Yeni ürün "Onaya gönder" (derin denetim MU-25): gönderim BAŞARILIYSA form
 * listeye döner (onClose) ve düzenleme moduna geçmez (onCreated YOK). Eskiden
 * önce onCreated çağrılıyordu → üst bileşen TASLAK kopyayla düzenleme formu
 * açıyor, sonraki onClose boşa düşüyor, kullanıcı bayat "Taslak" formunda
 * kalıyordu. Gönderim olmazsa kayıt taslak kaldığı için düzenlemeye geçilir.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));

vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: () => true,
  useCompanyAuth: () => ({ user: null, company: null }),
}));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: h.get, post: h.post, patch: h.patch },
}));
vi.mock("@/lib/api", () => ({ api: { get: h.get } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/satis/urunlerim",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { toast } from "sonner";
import { ProductShowcaseForm } from "../product-showcase-form";
import type { ProductShowcase } from "@/hooks/use-company-items";

const EMPTY: ProductShowcase = {
  id: "",
  name: "",
  slug: null,
  isPublic: false,
  publishedAt: null,
  reviewStatus: "DRAFT",
  submittedAt: null,
  reviewedAt: null,
  rejectReason: null,
  categoryId: null,
  description: null,
  images: [],
  videoUrl: null,
  externalUrl: null,
  documents: null,
  keywords: [],
  attributes: null,
  priceMode: "ON_REQUEST",
  priceAmount: null,
  priceTiers: null,
  priceCurrency: "TRY",
  moq: null,
  unit: "adet",
  unitCode: "PCE",
  completion: { score: 0, missing: [] },
  publishBlockers: [],
  attributeDefs: [],
};

function renderForm() {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={qc}>
      <ProductShowcaseForm mode="new" product={EMPTY} unit="adet" onClose={onClose} onCreated={onCreated} />
    </QueryClientProvider>,
  );
  return { onClose, onCreated };
}

beforeEach(() => {
  h.get.mockReset();
  h.post.mockReset();
  h.patch.mockReset();
  h.get.mockResolvedValue({ data: [] });
  vi.mocked(toast.error).mockReset();
});

describe("ProductShowcaseForm — yeni ürün 'Onaya gönder'", () => {
  it("gönderim başarılı → listeye döner, bayat taslak düzenleme formu açılmaz", async () => {
    const saved = { ...EMPTY, id: "p9", name: "Pano" };
    h.post.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.includes("publish") ? { ...saved, reviewStatus: "PENDING" } : saved,
      }),
    );
    const user = userEvent.setup();
    const { onClose, onCreated } = renderForm();
    await user.type(screen.getByLabelText(/Ürün adı/), "Pano");
    await user.click(screen.getAllByRole("button", { name: "Onaya gönder" })[0]!);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(h.post.mock.calls.some(([u]) => String(u).includes("publish"))).toBe(true);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("gönderim engelliyse kayıt taslak kalır → düzenleme moduna geçilir (ikinci kayıt güncelleme olur)", async () => {
    const saved = { ...EMPTY, id: "p9", name: "Pano", publishBlockers: ["En az bir görsel"] };
    h.post.mockResolvedValue({ data: saved });
    const user = userEvent.setup();
    const { onClose, onCreated } = renderForm();
    await user.type(screen.getByLabelText(/Ürün adı/), "Pano");
    await user.click(screen.getAllByRole("button", { name: "Onaya gönder" })[0]!);
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(saved));
    expect(onClose).not.toHaveBeenCalled();
    expect(h.post.mock.calls.some(([u]) => String(u).includes("publish"))).toBe(false);
  });
});

// Derin denetim LU-31
describe("ProductShowcaseForm — anahtar kelime uzunluğu", () => {
  it("50 karakterden uzun parça çip olmaz, uyarı verir ve kutuda kalır; kısa parça eklenir", async () => {
    const user = userEvent.setup();
    renderForm();
    const long = "paslanmaz celik dikissiz endustriyel boru yuksek basinc";
    const input = document.getElementById("urun-anahtar-kelime") as HTMLInputElement;
    await user.type(input, `boru, ${long}{Enter}`);
    expect(toast.error).toHaveBeenCalledWith(
      "Etiket en fazla 50 karakter olabilir; uzun ifadeyi kısaltın ya da virgülle bölün.",
    );
    expect(screen.getByRole("button", { name: /boru etiketini kaldır/i })).toBeInTheDocument();
    expect(input.value).toBe(long);
  });
});

describe("ProductShowcaseForm — vitrinden çek", () => {
  const PUBLISHED: ProductShowcase = {
    ...EMPTY,
    id: "p1",
    name: "Pano",
    isPublic: true,
    reviewStatus: "APPROVED",
  };
  function renderPublished(onSaved = vi.fn()) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={qc}>
        <ProductShowcaseForm product={PUBLISHED} unit="adet" onClose={vi.fn()} onSaved={onSaved} />
      </QueryClientProvider>,
    );
    return onSaved;
  }

  it("başarıda sunucu hâli üst bileşene iletilir (form 'Yayında' kalmaz)", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const draft = { ...PUBLISHED, isPublic: false, reviewStatus: "DRAFT" as const };
    h.post.mockResolvedValue({ data: draft });
    const user = userEvent.setup();
    const onSaved = renderPublished();
    await user.click(screen.getByRole("button", { name: "Diğer işlemler" }));
    await user.click(await screen.findByRole("menuitem", { name: /Vitrinden çek/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(draft));
    expect(h.post).toHaveBeenCalledWith("/company/items/p1/unpublish");
  });

  it("hatada toast gösterir (işlenmemiş ret yok)", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    h.post.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    const onSaved = renderPublished();
    await user.click(screen.getByRole("button", { name: "Diğer işlemler" }));
    await user.click(await screen.findByRole("menuitem", { name: /Vitrinden çek/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onSaved).not.toHaveBeenCalled();
  });
});

