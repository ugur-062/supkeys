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

const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  confirm: vi.fn(),
  canManage: true,
  company: null as { tier: string } | null,
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: () => h.canManage,
  useCompanyAuth: () => ({ user: null, company: h.company }),
}));
// Uygulama içi onay diyaloğu (arayüz testi D-126) — tarayıcının window.confirm'ü değil.
vi.mock("@/components/providers/confirm-dialog", () => ({ useConfirm: () => h.confirm }));
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
  brand: null,
  mpn: null,
  specification: null,
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
  h.confirm.mockReset();
  h.confirm.mockResolvedValue(true);
  h.canManage = true;
  h.company = null;
  h.get.mockResolvedValue({ data: [] });
  vi.mocked(toast.error).mockReset();
  vi.mocked(toast.success).mockReset();
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

// Arayüz testi Y-11 (gözden geçirme): video/belge paketin altında gizli —
// gönderilmez de; görünmeyen eski bir değer kaydı etkilemesin.
describe("ProductShowcaseForm — paketli medya alanları", () => {
  const submitBody = async () => {
    h.post.mockResolvedValue({ data: { ...EMPTY, id: "p9", name: "Pano", publishBlockers: ["En az bir görsel"] } });
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/Ürün adı/), "Pano");
    await user.click(screen.getAllByRole("button", { name: "Onaya gönder" })[0]!);
    await waitFor(() => expect(h.post).toHaveBeenCalled());
    return h.post.mock.calls[0]![1] as Record<string, unknown>;
  };

  it("Silver altı: videoUrl ve documents gövdede YOK", async () => {
    h.company = { tier: "STANDART" };
    const body = await submitBody();
    expect(body).not.toHaveProperty("videoUrl");
    expect(body).not.toHaveProperty("documents");
    expect(body).toHaveProperty("externalUrl");
  });

  it("Silver: videoUrl ve documents gönderilir", async () => {
    h.company = { tier: "SILVER" };
    const body = await submitBody();
    expect(body).toHaveProperty("videoUrl");
    expect(body).toHaveProperty("documents");
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

  it("başarıda sunucu hâli üst bileşene iletilir (form 'Yayında' kalmaz); onay uygulama içi diyalogla (D-126)", async () => {
    const native = vi.spyOn(window, "confirm");
    const draft = { ...PUBLISHED, isPublic: false, reviewStatus: "DRAFT" as const };
    h.post.mockResolvedValue({ data: draft });
    const user = userEvent.setup();
    const onSaved = renderPublished();
    await user.click(screen.getByRole("button", { name: "Diğer işlemler" }));
    await user.click(await screen.findByRole("menuitem", { name: /Vitrinden çek/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(draft));
    expect(h.post).toHaveBeenCalledWith("/company/items/p1/unpublish");
    expect(h.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Ürün vitrinden çekilsin mi?", confirmLabel: "Vitrinden çek" }));
    expect(native).not.toHaveBeenCalled();
  });

  it("onay diyaloğunda vazgeçilirse istek atılmaz", async () => {
    h.confirm.mockResolvedValue(false);
    const user = userEvent.setup();
    renderPublished();
    await user.click(screen.getByRole("button", { name: "Diğer işlemler" }));
    await user.click(await screen.findByRole("menuitem", { name: /Vitrinden çek/ }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalled());
    expect(h.post).not.toHaveBeenCalled();
  });

  it("hatada toast gösterir (işlenmemiş ret yok)", async () => {
    h.post.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    const onSaved = renderPublished();
    await user.click(screen.getByRole("button", { name: "Diğer işlemler" }));
    await user.click(await screen.findByRole("menuitem", { name: /Vitrinden çek/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onSaved).not.toHaveBeenCalled();
  });
});


/** Yayın kapısını geçen yayındaki ürün — O-009 / D-125 senaryolarının tabanı. */
const COMPLETE: ProductShowcase = {
  ...EMPTY,
  id: "p1",
  name: "Dağıtım panosu 400A",
  slug: "dagitim-panosu-400a",
  isPublic: true,
  reviewStatus: "APPROVED",
  categoryId: "39122215",
  description: "x".repeat(120),
  images: ["https://cdn.rothern.com/a.webp"],
  keywords: ["pano"],
};

function renderWith(props: Partial<React.ComponentProps<typeof ProductShowcaseForm>> & { product: ProductShowcase }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <ProductShowcaseForm unit="adet" onClose={onClose} onSaved={onSaved} {...props} />
    </QueryClientProvider>,
  );
  return { onClose, onSaved };
}

describe("ProductShowcaseForm — yayın kapısı yayındaki üründe (arayüz testi O-009)", () => {
  it("anahtar kelimeler silinince Kaydet KAPALI ve nedeni yazılı; geri eklenince açılır", async () => {
    const user = userEvent.setup();
    renderWith({ product: COMPLETE });
    await user.type(screen.getByLabelText(/Minimum sipariş miktarı/), "5");
    const save = screen.getByRole("button", { name: "Kaydet" });
    expect(save).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /pano etiketini kaldır/i }));
    expect(save).toBeDisabled();
    expect(screen.getByText(/Yayındaki ürün eksik içerikle kaydedilemez/)).toBeInTheDocument();
    const input = document.getElementById("urun-anahtar-kelime") as HTMLInputElement;
    await user.type(input, "pano{Enter}");
    expect(save).toBeEnabled();
  });
});

describe("ProductShowcaseForm — kalıtsal eksikli yayındaki ürün (arayüz testi O-009, gözden geçirme)", () => {
  // Kapı sıkılaşmadan önce yayına çıkmış, açıklaması kısa ürün: API içerik dışı
  // kaydı (fiyat/MOQ) yalnız YENİ eksik doğarsa reddeder — form da aynı kural.
  const LEGACY: ProductShowcase = { ...COMPLETE, description: "kısa eski açıklama" };

  it("yalnız MOQ değişince Kaydet AÇIK, eksik notu yok", async () => {
    const user = userEvent.setup();
    renderWith({ product: LEGACY });
    await user.type(screen.getByLabelText(/Minimum sipariş miktarı/), "5");
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeEnabled();
    expect(screen.queryByText(/Yayındaki ürün eksik içerikle kaydedilemez/)).not.toBeInTheDocument();
  });

  it("içerik değişince (ad) kalıtsal eksik de Kaydet'i KAPATIR", async () => {
    const user = userEvent.setup();
    renderWith({ product: LEGACY });
    await user.type(screen.getByLabelText(/Ürün adı/), " X");
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeDisabled();
    expect(screen.getByText(/Yayındaki ürün eksik içerikle kaydedilemez/)).toBeInTheDocument();
  });
});

describe("ProductShowcaseForm — kayıt mesajı sonuca göre (arayüz testi D-125)", () => {
  it("yalnız MOQ değişip ürün onaylı kalırsa 'Kaydedildi'; sunucu incelemeye aldıysa yeniden inceleme mesajı", async () => {
    const user = userEvent.setup();
    h.patch.mockResolvedValueOnce({ data: { ...COMPLETE, moq: "5" } });
    renderWith({ product: COMPLETE });
    await user.type(screen.getByLabelText(/Minimum sipariş miktarı/), "5");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Kaydedildi"));

    h.patch.mockResolvedValueOnce({ data: { ...COMPLETE, moq: "55", reviewStatus: "PENDING" } });
    await user.type(screen.getByLabelText(/Minimum sipariş miktarı/), "5");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenLastCalledWith("Kaydedildi — içerik değişikliği yeniden incelenecek, ürün yayında kalıyor"),
    );
  });
});

describe("ProductShowcaseForm — tavan bilinmiyorken gönderim kilitli (arayüz testi D-287)", () => {
  it("limitPending iken 'Onaya gönder' kapalı, kilit notu çizilmez; bilgi gelince açılır", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const ui = (limitPending: boolean) => (
      <QueryClientProvider client={qc}>
        <ProductShowcaseForm mode="new" product={EMPTY} unit="adet" onClose={vi.fn()} limitPending={limitPending} />
      </QueryClientProvider>
    );
    const { rerender } = render(ui(true));
    expect(screen.getAllByRole("button", { name: "Onaya gönder" })[0]).toBeDisabled();
    expect(screen.queryByText(/tavanı doldu/)).toBeNull();
    rerender(ui(false));
    expect(screen.getAllByRole("button", { name: "Onaya gönder" })[0]).toBeEnabled();
  });
});

describe("ProductShowcaseForm — belge yükleme (arayüz testi D-289)", () => {
  it("10 MB üstü PDF YÜKLENMEDEN reddedilir; tek toast", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderWith({ product: { ...EMPTY, id: "p2", name: "Pano" } });
    const input = document.querySelector('input[type="file"][accept="application/pdf"]') as HTMLInputElement;
    const big = new File(["x"], "katalog.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    await user.upload(input, big);
    expect(h.post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("Belge yüklenemedi — yalnız PDF, en fazla 10 MB");
  });
});

describe("ProductShowcaseForm — salt-okur kullanıcı (arayüz testi O-099)", () => {
  it("alanlar kapalı, görsel/PDF yükleme kontrolleri çizilmez, kaydet yok", () => {
    h.canManage = false;
    renderWith({ product: { ...COMPLETE, isPublic: false, reviewStatus: "DRAFT" } });
    expect(screen.getByLabelText(/Ürün adı/)).toBeDisabled();
    expect(screen.getByLabelText(/^Açıklama/)).toBeDisabled();
    expect(screen.queryByText("Görsel ekle")).toBeNull();
    expect(screen.queryByText("PDF ekle")).toBeNull();
    expect(screen.queryByRole("button", { name: /Kaydet|Onaya gönder/ })).toBeNull();
    expect(screen.getByText(/yetkisi gerekir/)).toBeInTheDocument();
  });
});

describe("ProductShowcaseForm — arşivle (arayüz testi O-039)", () => {
  it("editör menüsünde 'Arşivle' onay sorar, PATCH :id/active atar ve listeye döner", async () => {
    h.patch.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    const { onClose } = renderWith({ product: { ...COMPLETE, isPublic: false, reviewStatus: "DRAFT" } });
    await user.click(screen.getByRole("button", { name: "Diğer işlemler" }));
    await user.click(await screen.findByRole("menuitem", { name: "Arşivle" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(h.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Ürün arşivlensin mi?" }));
    expect(h.patch).toHaveBeenCalledWith("/company/items/p1/active", { isActive: false });
    expect(toast.success).toHaveBeenCalledWith("Ürün arşivlendi");
  });
});
