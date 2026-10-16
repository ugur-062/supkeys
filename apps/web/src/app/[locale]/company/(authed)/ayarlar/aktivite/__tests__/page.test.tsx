// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

const h = vi.hoisted(() => ({
  items: [] as unknown[],
  enabled: undefined as boolean | undefined,
  /** Yanıt hiç yok (yükleme, çevrimdışı duraklama ya da veri gelmeden düşen istek). */
  noData: false,
  isError: false,
  totalPages: 1,
  pages: [] as number[],
}));

vi.mock("@/hooks/use-activity-log", () => ({
  useActivityLog: (page: number, _module?: string, enabled?: boolean) => (h.enabled = enabled, h.pages.push(page), {
    data: h.noData
      ? undefined
      : {
          items: h.items,
          pagination: { page, pageSize: 25, total: h.items.length, totalPages: h.totalPages },
        },
    isLoading: false,
    isPending: h.noData && !h.isError,
    isError: h.isError,
    error: h.isError ? { message: "Network Error" } : null,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/components/company-shell/premium-only", () => ({
  VerifiedOnly: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../../_components/settings-shell", () => ({
  SettingsShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import AktivitePage from "../page";

function row(action: string, metadata: Record<string, unknown>) {
  return {
    id: `${action}-${JSON.stringify(metadata)}`,
    action,
    actorEmail: "ada@example.com",
    entityType: null,
    entityId: null,
    metadata,
    createdAt: "2026-09-29T10:00:00.000Z",
  };
}

beforeEach(() => {
  useCompanyAuthStore.setState({ company: { country: "TR", tier: "SILVER" } } as never);
  h.items = [];
  h.noData = false;
  h.isError = false;
  h.totalPages = 1;
  h.pages = [];
});

describe("AktivitePage — liste durumları (canlı doğrulama 2026-10-09 taraması)", () => {
  it("yanıt yokken (çevrimdışı duraklama: `isLoading` false) tablo ve 'Henüz kayıt yok' çizilmez", () => {
    h.noData = true;
    render(<AktivitePage />);
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
    expect(screen.queryByText("Henüz kayıt yok")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("hiç okunamadıysa hata + Yeniden dene", () => {
    h.noData = true;
    h.isError = true;
    render(<AktivitePage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Aktivite logu yüklenemedi.");
    expect(screen.queryByText("Henüz kayıt yok")).toBeNull();
  });

  it("arka plan yenilemesi düşünce eldeki satırlar kalır (hata satırına dönmez)", () => {
    h.items = [row("company.user.invited", { email: "yeni@example.com", roles: ["SATISCI"] })];
    h.isError = true;
    render(<AktivitePage />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByText("ada@example.com").length).toBeGreaterThan(0);
  });

  it("başarılı ve BOŞ yanıt 'Henüz kayıt yok' der", () => {
    render(<AktivitePage />);
    expect(screen.getByText("Henüz kayıt yok")).toBeInTheDocument();
  });
});

describe("AktivitePage — erişim kilidi (arayüz testi O-044)", () => {
  it("efektif kademesi yetmeyen (doğrulanmamış) firmada log isteği atılmaz (kapı yeter, 403/toast yok); yetende atılır", () => {
    useCompanyAuthStore.setState({ company: { country: "TR", tier: "STANDART" } } as never);
    const { unmount } = render(<AktivitePage />);
    expect(h.enabled).toBe(false);
    unmount();
    useCompanyAuthStore.setState({ company: { country: "TR", tier: "SILVER" } } as never);
    render(<AktivitePage />);
    expect(h.enabled).toBe(true);
  });
});

describe("AktivitePage — Detay sütunu (derin denetim LU-20)", () => {
  it("belge türü iç anahtarı yerine katalog etiketi basılır", () => {
    h.items = [row("company.docs.uploaded", { kind: "taxPlate" })];
    render(<AktivitePage />);
    // Dar ekran kopyası (sm:hidden) da DOM'da — en az bir eşleşme yeter.
    expect(screen.getAllByText("Vergi Levhası").length).toBeGreaterThan(0);
    expect(screen.queryByText("taxPlate")).not.toBeInTheDocument();
  });

  it("kodlu red nedeni çevrilir, serbest metin gerekçe aynen kalır", () => {
    h.items = [
      row("company.user.role_change_denied", { reason: "not_admin_grant" }),
      row("company.order.cancelled", { orderNumber: "SIP-1", reason: "Stok bitti" }),
    ];
    render(<AktivitePage />);
    expect(screen.getAllByText("Yönetici yetkisi olmadan rol atama denemesi").length).toBeGreaterThan(0);
    expect(screen.queryByText("not_admin_grant")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Stok bitti/).length).toBeGreaterThan(0);
  });

  it("alan adları katalog etiketiyle, iç çift (city/cityId) tek; koltuk seçimi sebebi çevrilir (arayüz testi O-107)", () => {
    h.items = [
      row("company.profile.updated", { changedFields: ["postalCode", "city", "cityId"] }),
      row("company.user.roles_changed", { reason: "seat_selection" }),
    ];
    render(<AktivitePage />);
    expect(screen.getAllByText("alanlar: Posta kodu, Şehir").length).toBeGreaterThan(0);
    expect(screen.queryByText(/postalCode/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Koltuk seçimiyle işlem yetkisi kaldırıldı").length).toBeGreaterThan(0);
    expect(screen.queryByText(/seat_selection/)).not.toBeInTheDocument();
  });

  it("izin değişimi ham anahtar ve 'yeni roller' yerine hedef kişi + izin etiketleriyle; detay kesilmez (arayüz testi api2-01)", () => {
    h.items = [
      {
        ...row("company.user.permissions_changed", {
          before: ["sell:view"],
          after: ["sell:view", "sell:bid:submit", "sell:order:manage"],
          added: ["sell:bid:submit", "sell:order:manage"],
          removed: [],
        }),
        entityType: "company_user",
        entityId: "u1",
        entityLabel: "Ayşe Yılmaz",
      },
      row("company.user.roles_changed", { before: ["SATISCI"], after: ["YONETICI"] }),
    ];
    render(<AktivitePage />);
    const detail = "kullanıcı: Ayşe Yılmaz · eklenen izinler: Teklif verme, Satış siparişi işlemleri";
    expect(screen.getAllByText(detail).length).toBeGreaterThan(0);
    expect(screen.queryByText(/sell:bid:submit/)).not.toBeInTheDocument();
    // Rol değişimi rol etiketiyle kalır.
    expect(screen.getAllByText(/^yeni roller: /).length).toBeGreaterThan(0);
    // Masaüstü detay hücresi tek satıra kırpılmaz (truncate yok, sarar).
    const cell = screen.getAllByText(detail).find((el) => el.tagName === "TD");
    expect(cell).toBeDefined();
    expect(cell!.className).not.toMatch(/\btruncate\b/);
    expect(cell!.className).toMatch(/whitespace-normal/);
  });

  it("kullanıcı yönetimi olayları 'Diğer işlem' değil kendi etiketiyle görünür", () => {
    h.items = [row("company.user.invited", {}), row("company.user.invitation_accepted", {})];
    render(<AktivitePage />);
    expect(screen.getByText("Üye davet edildi")).toBeInTheDocument();
    expect(screen.getByText("Üye daveti kabul edildi")).toBeInTheDocument();
    expect(screen.queryByText("Diğer işlem")).not.toBeInTheDocument();
  });
});

// Arayüz testi son tur api-2: koltuk seçimi satırı toast/kullanıcılar
// sayfasıyla aynı adı taşır ve Detay'da sınır/kalan/kaldırılan özeti yazar.
describe("AktivitePage — koltuk seçimi satırı", () => {
  it("'Koltuk seçimi uygulandı' + sınır/kalan/kaldırılan özeti", () => {
    h.items = [
      row("company.seats.selection_applied", { limit: 2, keptCount: 2, droppedCount: 1 }),
    ];
    render(<AktivitePage />);
    expect(screen.getAllByText("Koltuk seçimi uygulandı").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("koltuk sınırı: 2 · kalan koltuk: 2 · işlem yetkisi kaldırılan: 1 kişi")
        .length,
    ).toBeGreaterThan(0);
  });
});

// Arayüz testi kapanış api-2:NEW-1: davet satırının Detay'ı boştu — metadata
// `{roles, permissions}` eşlenmiyordu.
describe("AktivitePage — davet / kabul / çıkarma satırları", () => {
  it("hazır set daveti yalnız rol etiketiyle; ham rol anahtarı basılmaz", () => {
    h.items = [
      row("company.user.invited", {
        roles: ["SATISCI"],
        permissions: [
          "sell:view",
          "sell:bid:submit",
          "sell:order:manage",
          "sell:product:manage",
          "sell:inquiry:reply",
          "connections:manage",
          "addresses:manage",
          "insights:view",
        ],
      }),
    ];
    render(<AktivitePage />);
    expect(screen.getAllByText("roller: Satışçı").length).toBeGreaterThan(0);
    expect(screen.queryByText(/SATISCI/)).not.toBeInTheDocument();
  });

  it("hazır setten sapan davet izinleri de etiketle listeler; rolsüz liste Görüntüleyici", () => {
    h.items = [
      row("company.user.invited", { roles: ["ONAYLAYICI"], permissions: ["approval:act", "buy:view"] }),
      row("company.user.invitation_accepted", {
        invitationId: "i1",
        roles: [],
        permissions: ["buy:view", "sell:view", "buy:reports:view"],
      }),
    ];
    render(<AktivitePage />);
    const custom = screen.getAllByText(/^roller: Onaylayıcı · izinler: /);
    expect(custom.length).toBeGreaterThan(0);
    expect(custom[0].textContent).toContain("Onaylama");
    expect(custom[0].textContent).not.toMatch(/approval:act|buy:view/);
    expect(screen.getAllByText("roller: Görüntüleyici").length).toBeGreaterThan(0);
  });

  it("davet iptali: davet edilen adres + geri alınan roller; metadata'sız eski satır kasıtlı yedek yazar (arayüz testi kalanlar api-2)", () => {
    h.items = [
      {
        ...row("company.user.invitation_cancelled", { roles: ["SATISCI"], permissions: [] }),
        entityType: "company_user_invitation",
        entityId: "inv1",
        entityLabel: "aday@firma.com",
      },
      { ...row("company.user.invitation_cancelled", {}), id: "eski", metadata: null },
    ];
    render(<AktivitePage />);
    expect(screen.getAllByText("davet edilen: aday@firma.com · roller: Satışçı").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("bekleyen davet geri alındı, davet bağlantısı artık çalışmaz").length,
    ).toBeGreaterThan(0);
  });

  it("izin üzerine yazma satırı (roles var, permissions yok) rol özeti eklemez; çıkarma önceki rolleri yazar", () => {
    h.items = [
      row("company.user.permissions_overridden", {
        roles: ["SATISCI"],
        rolesAfter: ["SATISCI"],
        before: ["sell:view"],
        after: ["sell:view", "sell:bid:submit"],
        added: ["sell:bid:submit"],
        removed: [],
      }),
      row("company.user.removed", { previousRoles: ["SATIN_ALMACI"] }),
    ];
    render(<AktivitePage />);
    expect(screen.getAllByText("eklenen izinler: Teklif verme").length).toBeGreaterThan(0);
    expect(screen.queryByText(/^roller: /)).not.toBeInTheDocument();
    expect(screen.getAllByText("önceki roller: Satın Almacı").length).toBeGreaterThan(0);
  });
});

// Mobil denetim 2026-10 g11.
describe("AktivitePage — telefon", () => {
  const scrollSpy = vi.fn();
  beforeEach(() => {
    scrollSpy.mockReset();
    Element.prototype.scrollIntoView = scrollSpy;
  });
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
    vi.restoreAllMocks();
  });

  /** Filtre + tablo + sayfalayıcıyı saran liste kabı (kaydırma hedefi). */
  const listTop = () => screen.getByText("Modül").closest<HTMLElement>('[class*="scroll-mt"]')!;

  it("'Sonraki' / 'Önceki' liste başı ekranın üstünde kaldıysa listenin başına kaydırır", async () => {
    h.totalPages = 3;
    h.items = [row("company.user.invited", { email: "yeni@example.com", roles: ["SATISCI"] })];
    render(<AktivitePage />);
    const top = listTop();
    // Kullanıcı sayfanın dibinde: liste başı görünümün çok üstünde.
    vi.spyOn(top, "getBoundingClientRect").mockReturnValue({ top: -1552 } as DOMRect);
    fireEvent.click(screen.getByRole("button", { name: "Sonraki" }));
    expect(h.pages.at(-1)).toBe(2);
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy.mock.contexts[0]).toBe(top);
    expect(scrollSpy).toHaveBeenCalledWith({ block: "start" });

    fireEvent.click(screen.getByRole("button", { name: "Önceki" }));
    expect(h.pages.at(-1)).toBe(1);
    expect(scrollSpy).toHaveBeenCalledTimes(2);
  });

  it("liste başı zaten görünürken sayfa değişimi sayfayı kaydırmaz", () => {
    h.totalPages = 3;
    h.items = [row("company.user.invited", { email: "yeni@example.com", roles: ["SATISCI"] })];
    render(<AktivitePage />);
    vi.spyOn(listTop(), "getBoundingClientRect").mockReturnValue({ top: 180 } as DOMRect);
    fireEvent.click(screen.getByRole("button", { name: "Sonraki" }));
    expect(h.pages.at(-1)).toBe(2);
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it("tarih sütunu telefonda gizli, tarih eylem hücresinin üstünde ayrı satır (RU '(GMT+3)' satırı daraltmaz)", () => {
    h.items = [row("company.user.invited", { email: "yeni@example.com", roles: ["SATISCI"] })];
    render(<AktivitePage />);
    const header = screen.getByRole("columnheader", { name: "Tarih" });
    expect(header.className.split(/\s+/)).toEqual(expect.arrayContaining(["hidden", "sm:table-cell"]));
    const time = document.querySelector("time")!;
    expect(time).toHaveAttribute("dateTime", "2026-09-29T10:00:00.000Z");
    expect(time.className.split(/\s+/)).toContain("sm:hidden");
    expect(time.closest("td")).toHaveTextContent("Üye davet edildi");
    // Gizli tarih hücresi hâlâ ilk çocuk: eylem sütunu telefonda ilk sütunun
    // kenar boşluğunu açıkça alır (16 px yerine 8 px).
    expect(screen.getByRole("columnheader", { name: "Eylem" }).className.split(/\s+/)).toContain("max-sm:pl-2");
    expect(time.closest("td")!.className.split(/\s+/)).toContain("max-sm:pl-2");
  });
});
