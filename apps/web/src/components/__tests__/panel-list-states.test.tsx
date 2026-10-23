// @vitest-environment jsdom
/**
 * PANEL LİSTELERİ — LİSTE DURUMLARI TARAMASI (canlı doğrulama 2026-10-09).
 *
 * Kural (CLAUDE.md "LİSTE DURUMLARI EKİ"):
 *  (1) boş durum ("yok", "henüz …") yalnız BAŞARILI ve boş yanıtta; yükleme
 *      `isPending`e bağlı (`isLoading`e değil — çevrimdışıyken sorgu duraklar:
 *      istek yok, hata yok, veri yok) ve hata ayrı dal;
 *  (2) okunamayan sayı 0 diye çizilmez;
 *  (3) arka plan yenilemesi düşerse ekrandaki satırlar kalır.
 *
 * Her satır GERÇEK kancalarla ve gerçek QueryClient'la koşar; yalnız
 * `companyApi` sahte. "BAŞARILI ve boş" denemesi aynı metin eşleyicisini
 * kullanır: eşleyici yanlışsa (metin değişmişse) o deneme düşer, öteki
 * denemelerin "yok"ları boşuna geçmez.
 */
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn<(url: string) => Promise<{ data: unknown }>>() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/satinalma",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/components/providers/confirm-dialog", () => ({ useConfirm: () => async () => true }));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: h.get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { ApprovalDetailPanel } from "@/components/company/approval-detail-panel";
import { InsightsView } from "@/components/company/insights-view";
import { OrdersList } from "@/components/company/orders-list";
import { GroupTemplatesView, ListingTemplatesView, QuestionTemplatesView } from "@/components/company/templates-view";
import { VisitorsView } from "@/components/company/visitors-view";
import { HomeCompanyList } from "@/components/dashboard/home-company-list";
import { InquiriesView } from "@/components/inquiries/inquiries-view";
import { CompanyMessageThread } from "@/components/messaging/company-message-thread";
import { FilesTab } from "@/components/tenders/files-tab";
import { SupplierPicker } from "@/components/tenders/quick/supplier-picker";
import { RoundHistoryDialog } from "@/components/tenders/round-history-dialog";
import { ApprovalFlowsSection } from "@/app/[locale]/company/(authed)/onaylar/_components/approval-flows-section";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

const networkError = Object.assign(new Error("Network Error"), { isAxiosError: true });

const directoryCompany = {
  name: "Vida Sanayi A.Ş.",
  slug: "vida-sanayi",
  rothernId: "AAAA-0001",
  city: "Bursa",
  country: "TR",
  industry: "Metal",
  activities: ["MANUFACTURER"],
  logoUrl: null,
  verified: true,
  mainCategory: { id: "31000000", name: "İmalat Bileşenleri" },
  productCount: 1,
  productPreview: [],
  topCategories: [],
  fastReply: false,
  connectionStatus: "none",
};
const visitors = {
  days: 30, total: 12, profileViews: 8, productViews: 4, identified: 2, anonymous: 5, locked: false, page: 1, pageSize: 20, totalItems: 1,
  previous: { total: 6, identified: 1 },
  daily: Array.from({ length: 30 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, "0")}`, views: i === 29 ? 12 : 0 })),
  items: [
    { company: { id: "c1", rothernId: "ABCD-1234", name: "Ziyaretçi A", slug: "za", city: "Bursa", activities: ["MANUFACTURER"], verified: true, logoUrl: null }, visits: 3, lastViewedAt: "2026-09-05T10:00:00Z", profileViews: 1, products: [], connected: true },
  ],
};
const insights = {
  days: 30,
  generatedAt: "2026-09-30T00:00:00Z",
  series: [],
  views: { profile: { current: 1, previous: 0 }, product: { current: 2, previous: 0 }, identifiedVisitors: { current: 0, previous: 0 } },
  topProducts: [{ id: "p1", name: "Rulman 6204", slug: null, views: 2 }],
  viewerCities: [],
  inquiries: { received: 1, replied: 1, medianFirstReplyHours: 2, replyWindowDays: 90 },
  connections: { invitesReceived: 1, accepted: 0 },
  listingInvitations: 1,
  bids: { submitted: 1, won: 0 },
};

interface Case {
  name: string;
  ui: () => ReactElement;
  /** Kesintide / duraklamada yanlışlıkla çizilen "yok" metni. */
  emptyText: RegExp;
  /** Uç → BAŞARILI ve boş yanıt (eşleyicinin doğruluğunu da sınar). */
  emptyData?: (url: string) => unknown;
  /** Uç → dolu yanıt + ekranda aranacak satır (kural 3). */
  rows?: { data: (url: string) => unknown; text: string | RegExp; queryKey: readonly unknown[] };
  /** Hiç okunamayan listede beklenen hata metni (yoksa genel hata kartı). */
  errorText?: string | RegExp;
  /** Duraklamada hiçbir hata metni çıkmamalı (yoksa yalnız `emptyText` denetlenir). */
  pausedIsNotError?: boolean;
}

const GENERIC_ERROR = "Bir şeyler ters gitti";

const CASES: Case[] = [
  {
    name: "Panel anasayfası › Firmalar (HomeCompanyList)",
    ui: () => <HomeCompanyList portal="satinalma" />,
    emptyText: /Henüz listelenen firma yok/,
    emptyData: () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
    rows: {
      data: () => ({ items: [directoryCompany], total: 1, page: 1, pageSize: 20 }),
      text: "Vida Sanayi A.Ş.",
      queryKey: ["company-directory", "search"],
    },
  },
  {
    name: "Şablonlar › Tedarikçi Grupları",
    ui: () => <GroupTemplatesView basePath="/company/satinalma/sablonlar" />,
    emptyText: /Henüz grup yok/,
    emptyData: () => [],
    rows: {
      data: () => [{ id: "g1", name: "Boru tedarikçileri", memberCount: 3, updatedAt: "2026-09-01T10:00:00Z" }],
      text: "Boru tedarikçileri",
      queryKey: ["supplier-templates"],
    },
  },
  {
    name: "Şablonlar › Soru Setleri",
    ui: () => <QuestionTemplatesView basePath="/company/satinalma/sablonlar" />,
    emptyText: /Henüz soru seti yok/,
    emptyData: () => [],
    rows: {
      data: () => [{ id: "q1", name: "Kalite soruları", itemCount: 2, preview: ["Menşei nedir?"] }],
      text: "Kalite soruları",
      queryKey: ["question-templates"],
    },
  },
  {
    name: "Şablonlar › Talep Şablonları",
    ui: () => <ListingTemplatesView basePath="/company/satinalma/sablonlar" />,
    emptyText: /Henüz şablon yok/,
    emptyData: () => [],
    rows: {
      data: () => [{ id: "t1", name: "Aylık sarf alımı", payload: { title: "Sarf", items: [] }, createdAt: "2026-09-01T10:00:00Z" }],
      text: "Aylık sarf alımı",
      queryKey: ["listing-templates"],
    },
  },
  {
    name: "Mesajlar › konuşma (CompanyMessageThread)",
    ui: () => <CompanyMessageThread portal="satis" otherPartyId="c1" otherPartyName="Alıcı A.Ş." />,
    emptyText: /Henüz mesaj yok/,
    emptyData: () => ({ thread: null, otherParty: { id: "c1", name: "Alıcı A.Ş." }, messages: [] }),
    rows: {
      data: () => ({
        thread: { id: "t1", lastMessageAt: "2026-09-01T10:00:00Z" },
        otherParty: { id: "c1", name: "Alıcı A.Ş." },
        messages: [{ id: "m1", body: "Teklifinizi bekliyoruz", senderName: "Ada", mine: false, createdAt: "2026-09-01T10:00:00Z" }],
      }),
      text: "Teklifinizi bekliyoruz",
      queryKey: ["company-msg-thread"],
    },
  },
  {
    name: "Bilgi Talepleri (InquiriesView)",
    ui: () => <InquiriesView portal="satis" />,
    emptyText: /Henüz bilgi talebi yok/,
    emptyData: () => ({ items: [], total: 0 }),
  },
  {
    name: "Talep formu › tedarikçi seçici (SupplierPicker)",
    ui: () => <SupplierPicker value={[]} onChange={() => {}} />,
    emptyText: /Henüz bağlantınız yok/,
    emptyData: () => [],
  },
  {
    name: "Talep detayı › Dosyalar (FilesTab)",
    ui: () => <FilesTab listingId="l1" isOwner={false} />,
    emptyText: /dosya eklenmemiş/,
    emptyData: () => [],
    errorText: "Dosyalar yüklenemedi.",
  },
  {
    name: "Tur geçmişi penceresi (RoundHistoryDialog)",
    ui: () => <RoundHistoryDialog id="l1" open onClose={() => {}} />,
    emptyText: /Henüz tamamlanmış tur yok/,
    emptyData: () => [],
    errorText: /Tur geçmişi yüklenemedi/,
  },
  {
    name: "Onay Akışları (ApprovalFlowsSection)",
    ui: () => <ApprovalFlowsSection canManage />,
    emptyText: /Henüz onay akışı yok/,
    emptyData: () => [],
    errorText: "Onay akışları yüklenemedi",
  },
  {
    name: "Siparişlerim (OrdersList)",
    ui: () => <OrdersList role="buyer" />,
    emptyText: /Henüz sipariş yok/,
    emptyData: () => [],
    errorText: /Siparişler yüklenemedi/,
  },
];

let client: QueryClient;
const mount = (ui: ReactElement) => render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
const apiDown = () => h.get.mockRejectedValue(networkError);
const apiUp = (data: (url: string) => unknown) => h.get.mockImplementation(async (url: string) => ({ data: data(url) }));
const goOffline = () => {
  onlineManager.setOnline(false);
  apiDown();
};

beforeEach(() => {
  // jsdom'da yok; konuşma penceresi yeni mesajda en alta kaydırır.
  Element.prototype.scrollIntoView = vi.fn();
  h.get.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useCompanyAuthStore.setState({
    user: { id: "u1", isOwner: true, roles: ["SAHIP"], permissions: [] },
    company: { id: "co1", name: "Demo A.Ş.", tier: "GOLD", country: "TR", companyVerificationStatus: "VERIFIED" },
  } as never);
});
afterEach(() => {
  onlineManager.setOnline(true);
  client.clear();
});

describe.each(CASES)("$name", ({ ui, emptyText, emptyData, rows, errorText, pausedIsNotError = true }) => {
  it("kesinti: 'yok' çizilmez, hata + yeniden deneme çıkar", async () => {
    apiDown();
    mount(ui());
    expect(await screen.findByText(errorText ?? GENERIC_ERROR)).toBeInTheDocument();
    expect(screen.queryByText(emptyText)).toBeNull();
    expect(screen.getAllByRole("button", { name: /Tekrar dene|Yeniden dene/i }).length).toBeGreaterThan(0);
  });

  it("çevrimdışı duraklayan sorgu (istek yok, hata yok, veri yok): 'yok' çizilmez", async () => {
    goOffline();
    mount(ui());
    await act(async () => {});
    expect(h.get).not.toHaveBeenCalled();
    expect(screen.queryByText(emptyText)).toBeNull();
    if (pausedIsNotError) expect(screen.queryByText(errorText ?? GENERIC_ERROR)).toBeNull();
  });

  if (emptyData) {
    it("BAŞARILI ve boş yanıt boş durumu çizer (boş durum yalnız buradan)", async () => {
      apiUp(emptyData);
      mount(ui());
      expect((await screen.findAllByText(emptyText)).length).toBeGreaterThan(0);
    });
  }

  if (rows) {
    it("arka plan yenilemesi düşünce ekrandaki satırlar kalır", async () => {
      apiUp(rows.data);
      mount(ui());
      expect((await screen.findAllByText(rows.text)).length).toBeGreaterThan(0);

      apiDown();
      await act(async () => {
        await client.refetchQueries({ queryKey: [...rows.queryKey] });
      });
      await waitFor(() =>
        expect(client.getQueryCache().find({ queryKey: [...rows.queryKey], exact: false })?.state.status).toBe("error"),
      );
      expect(screen.getAllByText(rows.text).length).toBeGreaterThan(0);
      expect(screen.queryByText(errorText ?? GENERIC_ERROR)).toBeNull();
    });
  }
});

describe("Siparişlerim — okunamayan toplam ve role ait satırı olmayan firma", () => {
  it("yanıt yokken '0 sipariş' ve 'Tümü (0)' yazılmaz", async () => {
    goOffline();
    mount(<OrdersList role="buyer" />);
    await act(async () => {});
    expect(document.body.textContent).not.toMatch(/\(0\)/);
    expect(screen.queryByText(/^\s*sipariş$/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/0 sipariş/);
  });

  it("verisi okunmuş ama bu role ait siparişi olmayan firmada düşen yoklama boş durumu hata kartına çevirmez", async () => {
    // Eskiden hata dalı `all.length === 0`a bakıyordu (role göre süzülmüş liste).
    apiUp(() => [{ id: "o1", role: "seller", status: "PENDING", counterparty: "Alıcı A.Ş.", amount: "10", currency: "TRY", createdAt: "2026-09-01T10:00:00Z" }]);
    mount(<OrdersList role="buyer" />);
    expect((await screen.findAllByText(/Henüz sipariş yok/)).length).toBeGreaterThan(0);
    apiDown();
    await act(async () => {
      await client.refetchQueries({ queryKey: ["company-orders", "list"] });
    });
    await waitFor(() => expect(client.getQueryState(["company-orders", "list"])?.status).toBe("error"));
    expect(screen.queryByText(/Siparişler yüklenemedi/)).toBeNull();
    expect(screen.getAllByText(/Henüz sipariş yok/).length).toBeGreaterThan(0);
  });
});

describe("Ziyaret Edenler ve İş Analizi — pano sayfaları", () => {
  const up = () =>
    apiUp((url) =>
      url.startsWith("/company/views/visitors") ? visitors : url.startsWith("/company/views/insights") ? insights : { visitsVisible: true },
    );

  it.each([
    { name: "Ziyaret Edenler", ui: () => <VisitorsView />, key: ["company-views", "visitors"], text: "Ziyaretçi A", error: "Ziyaretçi verisi alınamadı." },
    { name: "İş Analizi", ui: () => <InsightsView />, key: ["company-views", "insights"], text: "Rulman 6204", error: /İş Analizi verisi alınamadı/ },
  ])("$name: arka plan yenilemesi düşünce eldeki rakamlar kalır; hiç okunamazsa hata; duraklamada bekleme", async ({ ui, key, text, error }) => {
    up();
    const first = mount(ui());
    expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);
    apiDown();
    await act(async () => {
      await client.refetchQueries({ queryKey: key });
    });
    await waitFor(() => expect(client.getQueryCache().find({ queryKey: key, exact: false })?.state.status).toBe("error"));
    expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    expect(screen.queryByText(error)).toBeNull();
    first.unmount();
    client.clear();

    // Hiç okunamadı → hata kartı.
    apiDown();
    const second = mount(ui());
    expect(await screen.findByText(error)).toBeInTheDocument();
    second.unmount();
    client.clear();

    // Çevrimdışı duraklama → iskelet (hata kartı değil).
    goOffline();
    const third = mount(ui());
    await act(async () => {});
    expect(screen.queryByText(error)).toBeNull();
    expect(third.container.querySelector(".animate-pulse")).not.toBeNull();
  });
});

describe("Onay detayı (ApprovalDetailPanel)", () => {
  it("çevrimdışı duraklamada 'Onay detayı yüklenemedi' değil iskelet; hiç okunamazsa hata + Tekrar dene", async () => {
    goOffline();
    const paused = mount(<ApprovalDetailPanel id="a1" />);
    await act(async () => {});
    expect(screen.queryByText(/Onay detayı yüklenemedi/)).toBeNull();
    expect(paused.container.querySelector(".animate-pulse")).not.toBeNull();
    paused.unmount();
    client.clear();

    onlineManager.setOnline(true);
    apiDown();
    mount(<ApprovalDetailPanel id="a1" />);
    expect(await screen.findByText(/Onay detayı yüklenemedi/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
  });
});
