// @vitest-environment jsdom
/**
 * ÜRÜN FORMU — ESKİ ÜRÜNÜN GİZLİ SEGMENTTEKİ KATEGORİSİ (canlı doğrulama
 * 2026-10-09, CP-01 / CP-03).
 *
 * Kayıtlı kod formda durur ve değişmeden geri gider; ama o koddan hiçbir şey
 * türetilmez:
 *  - CP-01: nitelik alanları yalnız GÖRÜNÜR kategoriden istenir — çelik borunun
 *    formunda gizli segmentin "Ürün grubu*" alanları çıkıyordu, ray da yıldızlı
 *    nitelik istiyordu;
 *  - CP-03: henüz yayında olmayan üründe kategori ray / puan / yayın kapısında
 *    eksik sayılır (API `publishGateLike`) — ret ancak "Onaya gönder"den sonra
 *    geliyordu. Yayındaki eski ürün etkilenmez.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  companyGet: vi.fn(),
  publicGet: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  company: null as { tier: string; name: string; slug: string; country: string } | null,
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: () => true,
  useCompanyAuth: () => ({ user: null, company: h.company }),
}));
vi.mock("@/components/providers/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: h.companyGet, post: h.post, patch: h.patch },
}));
vi.mock("@/lib/api", () => ({ api: { get: h.publicGet } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/satis/urunlerim",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { ProductShowcaseForm } from "../product-showcase-form";
import type { ProductShowcase } from "@/hooks/use-company-items";

const HIDDEN = "10101500";
const VISIBLE = "31161500";
/** Sunucunun bir kategori için döndürdüğü nitelik seti: biri zorunlu (yıldızlı). */
const DEFS = [
  { key: "urun_grubu", nameTr: "Ürün grubu", type: "SINGLE_SELECT", options: ["Süs bitkisi", "Tohum"], unit: null, isRequired: true, definedAt: "x" },
  { key: "sertifika", nameTr: "Sertifika", type: "TEXT", options: null, unit: null, isRequired: false, definedAt: "x" },
];
const ATTRIBUTE_HINT = /Önce 1\. bölümde kategori seçin/;
const STARRED = /Kategoriye özel yıldızlı \(\*\) nitelikler/;
const NOT_CURRENT = "Kategori artık kullanılmıyor, güncel bir kategori seçilmeli";

/** Kategori dışında her şeyi tam bir ürün (ad, açıklama, görsel, etiket, fiyat modu, MOQ). */
const COMPLETE: ProductShowcase = {
  id: "p1",
  name: "QA Çelik Boru",
  slug: "qa-celik-boru",
  isPublic: false,
  publishedAt: null,
  reviewStatus: "DRAFT",
  submittedAt: null,
  reviewedAt: null,
  rejectReason: null,
  categoryId: HIDDEN,
  description: "Dikişsiz çelik boru, 3/4 inç, ST37 kalite. ".repeat(4),
  images: ["https://cdn.rothern.com/boru.webp"],
  videoUrl: null,
  externalUrl: null,
  documents: null,
  keywords: ["çelik boru"],
  attributes: { urun_grubu: "Tohum" },
  priceMode: "ON_REQUEST",
  priceAmount: null,
  priceTiers: null,
  priceCurrency: "TRY",
  moq: "10",
  unit: "adet",
  unitCode: "PCE",
  brand: null,
  mpn: null,
  specification: null,
  completion: { score: 0, missing: [] },
  publishBlockers: [],
  attributeDefs: [],
} as unknown as ProductShowcase;

function renderForm(product: ProductShowcase) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProductShowcaseForm product={product} unit="adet" onClose={() => {}} />
    </QueryClientProvider>,
  );
}
const attributeRequests = () =>
  h.companyGet.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("/company/items/attributes/"));
const rail = () => screen.getByRole("region", { name: "Tamamlanma" });

beforeEach(() => {
  for (const fn of [h.companyGet, h.publicGet, h.post, h.patch]) fn.mockReset();
  h.company = null;
  // Sunucu gizli kod için de nitelik seti döndürür (API'nin eski hâli) — web istemez.
  h.companyGet.mockImplementation((url: string) =>
    Promise.resolve({ data: String(url).includes("/company/items/attributes/") ? DEFS : [] }),
  );
  h.publicGet.mockResolvedValue({ data: [{ id: VISIBLE, code: VISIBLE, nameTr: "Vidalar", level: 3, breadcrumb: "" }] });
});

describe("ürün formu — gizli segmentteki kayıtlı kategori (CP-01)", () => {
  it.each([
    ["yayındaki eski ürün", { isPublic: true, reviewStatus: "APPROVED", publishedAt: "2026-09-01T00:00:00.000Z" }],
    ["eski taslak", {}],
  ])("%s: gizli kategorinin nitelik seti İSTENMEZ, alanları çizilmez; 3. bölüm kategori seçtirir, ray yıldızlı nitelik istemez", async (_ad, over) => {
    renderForm({ ...COMPLETE, ...over } as ProductShowcase);
    expect(await screen.findByText(ATTRIBUTE_HINT)).toBeInTheDocument();
    // Kategori kutusu nedenini söyler (kategorinin adı anılmadan).
    expect(screen.getByText(/Önceki kategori artık kullanılmıyor/)).toBeInTheDocument();
    // Sorgu etkin olsaydı ilk çizimde giderdi; yanıtı bekleyecek kadar dur.
    await new Promise((r) => setTimeout(r, 50));
    expect(attributeRequests()).toEqual([]);
    expect(screen.queryByText("Ürün grubu")).toBeNull();
    expect(screen.queryByText("Sertifika")).toBeNull();
    expect(screen.queryByText(/Bu alanlar seçtiğiniz kategoriden/)).toBeNull();
    expect(within(rail()).queryByText(STARRED)).toBeNull();
  });

  it("görünür kategorili üründe nitelik seti istenir ve alanları çizilir (kural yalnız gizli koda)", async () => {
    renderForm({ ...COMPLETE, categoryId: VISIBLE, attributes: {} } as ProductShowcase);
    expect(await screen.findByText("Ürün grubu")).toBeInTheDocument();
    expect(attributeRequests()).toEqual([`/company/items/attributes/${VISIBLE}`]);
    expect(screen.queryByText(ATTRIBUTE_HINT)).toBeNull();
    // Zorunlu nitelik boş: ray ister.
    await waitFor(() => expect(within(rail()).getByText(STARRED)).toBeInTheDocument());
  });
});

describe("ürün formu — eski taslağın yayın kapısı (CP-03)", () => {
  it("yayında OLMAYAN ürün: gizli kategori eksik sayılır — ray güncel kategori ister, puan kategoriyi saymaz", async () => {
    renderForm(COMPLETE);
    await screen.findByText(ATTRIBUTE_HINT);
    const r = within(rail());
    expect(r.getByText("Onaya göndermek için gerekli")).toBeInTheDocument();
    expect(r.getByRole("button", { name: NOT_CURRENT })).toBeInTheDocument();
    // "Seçilmeli" değil: ürünün kategorisi VAR ama kullanımdan kalktı.
    expect(r.queryByRole("button", { name: "Kategori seçilmeli" })).toBeNull();
    // Kategori dışında her şey tam: 100 − 15.
    expect(r.getByText("%85")).toBeInTheDocument();
    expect(r.getByText("Kategori seçimi (+15)")).toBeInTheDocument();
    expect(r.queryByText(/Tüm alanlar dolu/)).toBeNull();
  });

  it("düzeltme istenen (yayında olmayan) ürün de aynı kurala girer", async () => {
    renderForm({ ...COMPLETE, reviewStatus: "REJECTED", rejectReason: "Görsel net değil" } as ProductShowcase);
    await screen.findByText(ATTRIBUTE_HINT);
    expect(within(rail()).getByRole("button", { name: NOT_CURRENT })).toBeInTheDocument();
  });

  it("YAYINDAKİ eski ürün etkilenmez: kayıtlı kategori sayılır, kapıda kategori eksiği yok", async () => {
    renderForm({ ...COMPLETE, isPublic: true, reviewStatus: "APPROVED", publishedAt: "2026-09-01T00:00:00.000Z" } as ProductShowcase);
    await screen.findByText(ATTRIBUTE_HINT);
    const r = within(rail());
    expect(r.queryByRole("button", { name: NOT_CURRENT })).toBeNull();
    expect(r.queryByRole("button", { name: "Kategori seçilmeli" })).toBeNull();
    expect(r.queryByText("Onaya göndermek için gerekli")).toBeNull();
    expect(r.getByText("%100")).toBeInTheDocument();
  });

  it("görünür kategorili taslakta kategori eksiği yok (kural yalnız gizli koda)", async () => {
    renderForm({ ...COMPLETE, categoryId: VISIBLE, attributes: { urun_grubu: "Tohum" } } as ProductShowcase);
    await screen.findByText("Ürün grubu");
    const r = within(rail());
    expect(r.queryByRole("button", { name: NOT_CURRENT })).toBeNull();
    expect(r.queryByRole("button", { name: "Kategori seçilmeli" })).toBeNull();
    await waitFor(() => expect(r.getByText("%100")).toBeInTheDocument());
  });
});

/**
 * İKİ KART AYNI DEĞERİ OKUR (son canlı kontrol 2026-10-10, NEW-PF-4): eski
 * taslakta "Tamamlanma" kategoriyi eksik sayarken "Arama görünürlüğü" kayıtlı
 * (gizli) kodu "Kategori seçili" diye sayıyor, 10 puanı veriyordu.
 */
describe("ürün formu — arama görünürlüğü kartı eski kategoriyi rayla aynı sayar (NEW-PF-4)", () => {
  /** Kartın açık maddeleri — "+N madde daha" açılmış hâliyle. */
  const openSeoItems = () => {
    const card = within(screen.getByRole("region", { name: "Arama görünürlüğü" }));
    const more = card.queryByRole("button", { name: /madde daha/ });
    if (more) fireEvent.click(more);
    return card;
  };

  it("yayında OLMAYAN eski ürün: 'Kategori seçili' bu kartta da açık madde", async () => {
    renderForm(COMPLETE);
    await screen.findByText(ATTRIBUTE_HINT);
    expect(within(rail()).getByRole("button", { name: NOT_CURRENT })).toBeInTheDocument();
    expect(openSeoItems().getByText("Kategori seçili")).toBeInTheDocument();
  });

  it("YAYINDAKİ eski ürün: kayıtlı kategori iki kartta da sayılır", async () => {
    renderForm({ ...COMPLETE, isPublic: true, reviewStatus: "APPROVED", publishedAt: "2026-09-01T00:00:00.000Z" } as ProductShowcase);
    await screen.findByText(ATTRIBUTE_HINT);
    expect(within(rail()).queryByRole("button", { name: NOT_CURRENT })).toBeNull();
    expect(openSeoItems().queryByText("Kategori seçili")).toBeNull();
  });

  it("görünür kategorili taslakta madde kapalıdır (kural yalnız gizli koda)", async () => {
    renderForm({ ...COMPLETE, categoryId: VISIBLE, attributes: { urun_grubu: "Tohum" } } as ProductShowcase);
    await screen.findByText("Ürün grubu");
    expect(openSeoItems().queryByText("Kategori seçili")).toBeNull();
  });
});

/**
 * KATEGORİ NOTUNUN SÖZÜ (son canlı kontrol 2026-10-10, NEW-PF-5): yayındaki
 * eski üründe kayıt güncel kategori seçmeden de geçer (ray istemez, PATCH 200),
 * ama yıldızlı alanın altındaki not "Lütfen güncel bir kategori seçin" diyordu.
 */
describe("ürün formu — eski kategori notu (NEW-PF-5)", () => {
  const OPTIONAL = "Önceki kategori artık kullanılmıyor. Güncel bir kategori seçebilirsiniz; seçmeden de kaydedebilirsiniz.";
  const REQUIRED = "Önceki kategori artık kullanılmıyor. Lütfen güncel bir kategori seçin.";

  it("YAYINDAKİ eski ürün: not seçim İSTEMEZ", async () => {
    renderForm({ ...COMPLETE, isPublic: true, reviewStatus: "APPROVED", publishedAt: "2026-09-01T00:00:00.000Z" } as ProductShowcase);
    expect(await screen.findByText(OPTIONAL)).toBeInTheDocument();
    expect(screen.queryByText(REQUIRED)).toBeNull();
  });

  it("yayında OLMAYAN eski ürün: kategori gerçekten eksik — not ister (ray da ister)", async () => {
    renderForm(COMPLETE);
    expect(await screen.findByText(REQUIRED)).toBeInTheDocument();
    expect(screen.queryByText(OPTIONAL)).toBeNull();
    expect(within(rail()).getByRole("button", { name: NOT_CURRENT })).toBeInTheDocument();
  });
});

/**
 * Kayıtlı nitelik DEĞERLERİ de (gizli segmentin alanları) hiçbir yere taşınmaz:
 * tanımları istenmediği için AI istemine etiketsiz ham anahtarla
 * ("urun_grubu: Tohum") giderlerdi.
 */
describe("ürün formu — gizli kategorinin nitelikleri AI istemine girmez (CP-01)", () => {
  const enrichBody = async () => {
    h.post.mockResolvedValue({ data: { description: "x", keywords: [], titleSuggestion: null, missingFacts: [] } });
    fireEvent.click(await screen.findByRole("button", { name: "AI ile açıklamayı güçlendir" }));
    await waitFor(() => expect(h.post).toHaveBeenCalled());
    const [url, body] = h.post.mock.calls[0]!;
    expect(url).toBe("/company/ai/seo-enrich");
    return body as { facts: string[]; categoryName: string | null };
  };

  it("gizli kategorili eski ürün: olgu listesi boş, kategori adı yok", async () => {
    h.company = { tier: "GOLD", name: "Acme", slug: "acme", country: "TR" };
    renderForm({ ...COMPLETE, isPublic: true, reviewStatus: "APPROVED", publishedAt: "2026-09-01T00:00:00.000Z" } as ProductShowcase);
    await screen.findByText(ATTRIBUTE_HINT);
    const body = await enrichBody();
    expect(body.facts).toEqual([]);
    expect(body.categoryName).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/urun_grubu|Tohum/);
  });

  it("görünür kategorili üründe nitelik etiketiyle gider (kural yalnız gizli koda)", async () => {
    h.company = { tier: "GOLD", name: "Acme", slug: "acme", country: "TR" };
    renderForm({ ...COMPLETE, categoryId: VISIBLE, attributes: { urun_grubu: "Tohum" } } as ProductShowcase);
    await screen.findByText("Ürün grubu");
    const body = await enrichBody();
    expect(body.facts).toEqual(["Ürün grubu: Tohum"]);
  });
});

/**
 * ÜRÜNÜN KATEGORİSİ DEĞİŞTİRİLİR, KALDIRILMAZ (kapanış kontrolü 2026-10-10,
 * CL-PF-2). Çip × ile kaldırılıp "Taslak olarak kaydet" denince PATCH
 * `categoryId: null` gönderiyor, sunucu kayıtlı kategoriyi koruyor (null orada
 * "olduğu gibi bırak"), form ise "Taslak kaydedildi" deyip kategorisiz
 * görünüyordu — sayfa yenilenince kategori ve nitelik alanları geri geliyordu.
 * Kategori kutusu GERÇEK (`CategorySelectorButton`).
 */
describe("ürün formu — kategori kaldırılamaz, yalnız değiştirilir (CL-PF-2)", () => {
  const draft = { ...COMPLETE, categoryId: VISIBLE, attributes: { urun_grubu: "Tohum" } } as ProductShowcase;

  it("kategori çipinde kaldırma düğmesi YOK, 'Değiştir' var; taslak kaydı gösterilen kategoriyi gönderir", async () => {
    renderForm(draft);
    // Çip adıyla çizildi.
    expect(await screen.findByText("Vidalar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /kategorisini kaldır/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Değiştir" })).toBeInTheDocument();

    h.patch.mockResolvedValue({ data: draft });
    fireEvent.click(screen.getByRole("button", { name: "Diğer işlemler" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Taslak olarak kaydet" }));
    await waitFor(() => expect(h.patch).toHaveBeenCalled());
    const [, body] = h.patch.mock.calls[0]!;
    // Form ile kayıt aynı şeyi söyler: gönderilen kategori ekrandaki kategoridir.
    expect((body as { categoryId: string | null }).categoryId).toBe(VISIBLE);
    expect(screen.getByText("Vidalar")).toBeInTheDocument();
  });
});

/**
 * GÖRÜNÜR SEKTÖRÜN GİZLİ DALI (2026-10-10, sahip kararı). 46 "İş Güvenliği ve
 * Yangın Ekipmanları" adıyla geri açıldı; yalnız silah ve kolluk dalları gizli
 * (aile 4610…4615, 4620, 4622 ve görünür 4618 ailesinin 461825 sınıfı). Kural
 * kodun TAMAMIYLA sorulur: aynı sektörün gizli dalındaki eski ürün yukarıdaki
 * kurallara girer, görünür dalındaki ürün (koruyucu giysi) sıradan bir üründür.
 */
describe("ürün formu — 46: gizli dal eski kategoridir, görünür dal sıradan kategoridir", () => {
  it.each([
    ["gizli aile (4610, hafif silahlar)", "46101500"],
    ["gizli sınıf (461825, kişisel güvenlik cihazları)", "46182501"],
  ])("%s: nitelik seti istenmez, taslakta kategori eksik sayılır, alan nedenini söyler", async (_ad, code) => {
    renderForm({ ...COMPLETE, categoryId: code } as ProductShowcase);
    expect(await screen.findByText(ATTRIBUTE_HINT)).toBeInTheDocument();
    expect(screen.getByText(/Önceki kategori artık kullanılmıyor/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(attributeRequests()).toEqual([]);
    expect(within(rail()).getByRole("button", { name: NOT_CURRENT })).toBeInTheDocument();
  });

  it("46181500 (koruyucu giysi): nitelik seti istenir, kategori eksiği ve 'önceki kategori' notu yok", async () => {
    h.publicGet.mockResolvedValue({ data: [{ id: "46181500", code: "46181500", nameTr: "Koruyucu giysi", level: 3, breadcrumb: "" }] });
    renderForm({ ...COMPLETE, categoryId: "46181500", attributes: { urun_grubu: "Tohum" } } as ProductShowcase);
    expect(await screen.findByText("Ürün grubu")).toBeInTheDocument();
    expect(attributeRequests()).toEqual(["/company/items/attributes/46181500"]);
    const r = within(rail());
    expect(r.queryByRole("button", { name: NOT_CURRENT })).toBeNull();
    expect(r.queryByRole("button", { name: "Kategori seçilmeli" })).toBeNull();
    expect(screen.queryByText(/Önceki kategori artık kullanılmıyor/)).toBeNull();
    await waitFor(() => expect(r.getByText("%100")).toBeInTheDocument());
  });
});
