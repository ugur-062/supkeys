// @vitest-environment jsdom
// Derin denetim 2026-09-29 Y-18: `?with=` derin linki bağlantısız ve daha önce
// yazışılmamış firmada (teklif veren / sipariş karşı tarafı) sohbeti HİÇ
// açmıyordu — ad yalnız konuşmalar + aktif bağlantılardan çözülüyor, panel
// "Bir kişi seç"e düşüyor, mobilde geri butonu da kayboluyordu. Ayrıca
// portalsız e-posta linki iki izinli kullanıcıda ters yöndeki boş konuşmayı
// açıyordu.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Portal = "satinalma" | "satis";
interface ThreadRes {
  data?: { otherParty: { id: string; name: string }; messages: [] };
  isLoading: boolean;
  isError: boolean;
}

const h = vi.hoisted(() => ({
  search: "",
  permissions: [] as string[],
  tier: "GOLD" as string,
  threads: { data: [] as unknown[], isLoading: false },
  connections: [] as unknown[],
  threadRes: (() => ({ isLoading: false, isError: false })) as (
    portal: Portal,
    id: string,
  ) => ThreadRes,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(h.search),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({
    user: { permissions: h.permissions },
    company: { tier: h.tier },
  }),
}));
vi.mock("@/hooks/use-company-connections", () => ({
  useConnections: () => ({ data: h.connections, isLoading: false }),
}));
vi.mock("@/hooks/use-company-messages", () => ({
  useThreads: () => h.threads,
  useThreadMessages: (portal: Portal, id: string | undefined) =>
    id
      ? h.threadRes(portal, id)
      : { data: undefined, isLoading: false, isError: false },
}));
vi.mock("@/components/messaging/company-message-thread", () => ({
  CompanyMessageThread: (p: {
    portal: Portal;
    otherPartyId: string;
    otherPartyName: string;
  }) => (
    <div>
      <div data-testid="thread">
        {p.portal}|{p.otherPartyId}|{p.otherPartyName}
      </div>
      <textarea aria-label="Mesaj kutusu" />
    </div>
  ),
}));

import { CompanyInboxView, INBOX_THREAD_STATE_KEY } from "../company-inbox-view";

const originalMatchMedia = window.matchMedia;
/** Ekran: `wide` = sm+ (liste ve sohbet yan yana); `coarse` = dokunmatik. */
function setScreen({ wide = false, coarse = false }: { wide?: boolean; coarse?: boolean }) {
  window.matchMedia = ((query: string) => ({
    matches:
      query === "(min-width: 40rem)" ? wide : query === "(pointer: coarse)" ? coarse : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
}
afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
});

beforeEach(() => {
  h.search = "";
  h.tier = "GOLD";
  window.history.replaceState(null, "", "/company/mesajlar");
  h.permissions = ["buy:view", "buy:listing:manage"];
  h.threads = { data: [], isLoading: false };
  h.connections = [];
  h.threadRes = () => ({ isLoading: false, isError: false });
});

describe("CompanyInboxView — ?with= derin linki", () => {
  it("bağlantısız, yazışılmamış firma: ad sohbet ucundan gelir, sohbet açılır", () => {
    h.search = "with=bidder1&portal=satinalma";
    h.threadRes = (_portal, id) => ({
      data: { otherParty: { id, name: "Bağlantısız Tedarikçi" }, messages: [] },
      isLoading: false,
      isError: false,
    });
    render(<CompanyInboxView />);
    expect(screen.getByTestId("thread")).toHaveTextContent(
      "satinalma|bidder1|Bağlantısız Tedarikçi",
    );
    expect(screen.queryByText("Bir kişi seç")).not.toBeInTheDocument();
    // Bağlam şeridi de aynı adı kullanır.
    expect(screen.getByText(/size satış yapıyor/)).toHaveTextContent(
      "Bağlantısız Tedarikçi",
    );
  });

  it("ad yüklenirken iskelet + mobil geri butonu (çıkmaz ekran yok)", () => {
    h.search = "with=bidder1&portal=satinalma";
    h.threadRes = () => ({ isLoading: true, isError: false });
    render(<CompanyInboxView />);
    expect(screen.getByTestId("inbox-thread-skeleton")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "← Kişiler" })).toBeInTheDocument();
    expect(screen.queryByTestId("thread")).not.toBeInTheDocument();
  });

  it("firma bulunamazsa hata durumu + geri butonu", () => {
    h.search = "with=ghost&portal=satinalma";
    h.threadRes = () => ({ isLoading: false, isError: true });
    render(<CompanyInboxView />);
    expect(screen.getByText("Sohbet açılamadı")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "← Kişiler" })).toBeInTheDocument();
  });

  it("portalsız link: iki izinli kullanıcıda var olan konuşmanın yönü seçilir", () => {
    h.permissions = ["buy:view", "sell:view", "sell:bid:submit"];
    h.search = "with=buyerA";
    h.threads = {
      isLoading: false,
      data: [
        {
          portal: "satis",
          threadId: "t1",
          otherPartyId: "buyerA",
          otherPartyName: "Alıcı A",
          lastMessagePreview: "Merhaba",
          lastMessageAt: "2026-09-29T08:00:00.000Z",
          unread: true,
        },
      ],
    };
    render(<CompanyInboxView />);
    expect(screen.getByTestId("thread")).toHaveTextContent("satis|buyerA|Alıcı A");
  });

  // Gözden geçirme W4: çözülen yön sabitlenmeliydi — LIVE yoklamada
  // okunmamış bayrağı düşünce seçim daha yeni öbür konuşmaya kayıyor, sohbet
  // yeniden bağlanıp taslak siliniyordu.
  it("portalsız link: çözülen yön sonraki yoklamalarda kaymaz", () => {
    h.permissions = ["buy:view", "sell:view", "sell:bid:submit"];
    h.search = "with=buyerA";
    const thread = (
      portal: Portal,
      lastMessageAt: string,
      unread: boolean,
    ) => ({
      portal,
      threadId: `t-${portal}`,
      otherPartyId: "buyerA",
      otherPartyName: "Alıcı A",
      lastMessagePreview: "Merhaba",
      lastMessageAt,
      unread,
    });
    h.threads = {
      isLoading: false,
      data: [
        thread("satis", "2026-09-29T08:00:00.000Z", true),
        thread("satinalma", "2026-09-29T09:00:00.000Z", false),
      ],
    };
    const { rerender } = render(<CompanyInboxView />);
    expect(screen.getByTestId("thread")).toHaveTextContent("satis|buyerA|Alıcı A");

    // Yoklama: okundu işaretlendi, daha yeni konuşma 'satinalma'.
    h.threads = {
      isLoading: false,
      data: [
        thread("satis", "2026-09-29T08:00:00.000Z", false),
        thread("satinalma", "2026-09-29T09:00:00.000Z", false),
      ],
    };
    rerender(<CompanyInboxView />);
    expect(screen.getByTestId("thread")).toHaveTextContent("satis|buyerA|Alıcı A");

    // Öbür yönde yeni okunmamış mesaj gelse de seçim yerinde kalır.
    h.threads = {
      isLoading: false,
      data: [
        thread("satis", "2026-09-29T08:00:00.000Z", false),
        thread("satinalma", "2026-09-29T10:00:00.000Z", true),
      ],
    };
    rerender(<CompanyInboxView />);
    expect(screen.getByTestId("thread")).toHaveTextContent("satis|buyerA|Alıcı A");
  });

  // Gözden geçirme R-4: kalıcı oturum anlık görüntüsünde izinler bayat/eksik
  // olabilir (/me gelince düzelir). Sabitleme effect'i o aralıkta fallback
  // "satinalma"yı state'e yazıp açık ?portal=satis değerini kalıcı eziyordu.
  describe("bayat izin anlık görüntüsü (/me sonradan düzeltir)", () => {
    const BOTH = ["buy:view", "sell:view", "sell:bid:submit"];
    const satisThread = {
      portal: "satis",
      threadId: "t1",
      otherPartyId: "buyerA",
      otherPartyName: "Alıcı A",
      lastMessagePreview: "Merhaba",
      lastMessageAt: "2026-09-29T08:00:00.000Z",
      unread: true,
    };
    // Devre dışı sorgu (izin yok): data yok, isLoading=false.
    const disabled = {
      data: undefined as unknown as unknown[],
      isLoading: false,
    };

    it("izin yokken açık ?portal=satis ezilmez", () => {
      h.permissions = [];
      h.search = "with=buyerA&portal=satis";
      h.threads = disabled;
      const { rerender } = render(<CompanyInboxView />);
      expect(screen.queryByTestId("thread")).not.toBeInTheDocument();

      h.permissions = BOTH;
      h.threads = { isLoading: false, data: [satisThread] };
      rerender(<CompanyInboxView />);
      expect(screen.getByTestId("thread")).toHaveTextContent(
        "satis|buyerA|Alıcı A",
      );
    });

    it("izin yokken portalsız link yönü /me sonrası konuşmalardan çözülür", () => {
      h.permissions = [];
      h.search = "with=buyerA";
      h.threads = disabled;
      const { rerender } = render(<CompanyInboxView />);

      h.permissions = BOTH;
      h.threads = { isLoading: false, data: [satisThread] };
      rerender(<CompanyInboxView />);
      expect(screen.getByTestId("thread")).toHaveTextContent(
        "satis|buyerA|Alıcı A",
      );
    });

    it("tek taraf izinliyken açık ?portal=satis, ikinci taraf gelince açılır", () => {
      h.permissions = ["buy:view"];
      h.search = "with=buyerA&portal=satis";
      h.threads = { isLoading: false, data: [] };
      h.threadRes = (_portal, id) => ({
        data: { otherParty: { id, name: "Alıcı A" }, messages: [] },
        isLoading: false,
        isError: false,
      });
      const { rerender } = render(<CompanyInboxView />);
      // Rol olan tek taraf gösterilir ama seçim yazılmaz.
      expect(screen.getByTestId("thread")).toHaveTextContent(
        "satinalma|buyerA|Alıcı A",
      );

      h.permissions = BOTH;
      h.threads = { isLoading: false, data: [satisThread] };
      rerender(<CompanyInboxView />);
      expect(screen.getByTestId("thread")).toHaveTextContent(
        "satis|buyerA|Alıcı A",
      );
    });

    it("tek taraf izinliyken portalsız link, ikinci taraf gelince var olan konuşmaya çözülür", () => {
      h.permissions = ["buy:view"];
      h.search = "with=buyerA";
      h.threads = { isLoading: false, data: [] };
      h.threadRes = (_portal, id) => ({
        data: { otherParty: { id, name: "Alıcı A" }, messages: [] },
        isLoading: false,
        isError: false,
      });
      const { rerender } = render(<CompanyInboxView />);
      expect(screen.getByTestId("thread")).toHaveTextContent(
        "satinalma|buyerA|Alıcı A",
      );

      h.permissions = BOTH;
      h.threads = { isLoading: false, data: [satisThread] };
      rerender(<CompanyInboxView />);
      expect(screen.getByTestId("thread")).toHaveTextContent(
        "satis|buyerA|Alıcı A",
      );
    });
  });

  // Derin denetim LU-31: ad, arama süzgecinden geçmiş satırlardan
  // çözülüyordu; konuşması olmayan seçili bağlantıyı dışlayan bir arama
  // sohbet panelini unmount edip yazılmış taslağı siliyordu.
  it("yeni sohbet seçiliyken arama onu dışlasa da sohbet paneli yerinde kalır", () => {
    h.connections = [{ company: { id: "connX", name: "Xfirma" } }];
    // Ad sohbet ucundan kurtarılamasın (yükleniyor) — yalnız bağlantıdan.
    h.threadRes = () => ({ isLoading: true, isError: false });
    render(<CompanyInboxView />);
    fireEvent.click(screen.getByRole("button", { name: /Xfirma/ }));
    expect(screen.getByTestId("thread")).toHaveTextContent(
      "satinalma|connX|Xfirma",
    );
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "abc" } });
    expect(screen.getByTestId("thread")).toHaveTextContent(
      "satinalma|connX|Xfirma",
    );
  });

  it("portalsız link, konuşmalar yüklenirken yön seçilmez (iskelet)", () => {
    h.permissions = ["buy:view", "sell:view"];
    h.search = "with=buyerA";
    h.threads = { data: undefined as unknown as unknown[], isLoading: true };
    render(<CompanyInboxView />);
    expect(screen.queryByTestId("thread")).not.toBeInTheDocument();
    expect(screen.getByTestId("inbox-thread-skeleton")).toBeInTheDocument();
  });
});

describe("CompanyInboxView — seçim adreste, erişilebilirlik, kesinti (arayüz testi D-355, D-267, D-070)", () => {
  const row = {
    portal: "satis",
    threadId: "t1",
    otherPartyId: "buyerA",
    otherPartyName: "Alıcı A",
    lastMessagePreview: "Merhaba",
    lastMessageAt: "2026-09-29T08:00:00.000Z",
    unread: false,
  };

  it("listeden seçilen konuşma ?with=&portal= olarak adrese yazılır; geri dönüş temizler (yan yana düzen)", () => {
    setScreen({ wide: true });
    const push = vi.spyOn(window.history, "pushState");
    h.permissions = ["buy:view", "sell:view", "sell:bid:submit"];
    h.threads = { isLoading: false, data: [row] };
    render(<CompanyInboxView />);
    fireEvent.click(screen.getByRole("button", { name: /Alıcı A/ }));
    const q = new URLSearchParams(window.location.search);
    expect(q.get("with")).toBe("buyerA");
    expect(q.get("portal")).toBe("satis");
    // Yan yana düzende geçmiş şişmez (adres yerinde yazılır).
    expect(push).not.toHaveBeenCalled();
    // Sohbet çizilince mobil geri oku bağlam şeridinde (ayrı satır yok).
    expect(screen.queryByRole("button", { name: "← Kişiler" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Kişilere dön" }));
    expect(window.location.search).toBe("");
  });

  it("arama kutusunun erişilebilir adı var", () => {
    render(<CompanyInboxView />);
    const box = screen.getByRole("searchbox", { name: "Kişi ara" });
    expect(box).toHaveAttribute("type", "search");
  });

  it("konuşmalar yüklenemezse 'önce bağlantı kur' boş durumu yerine hata + Tekrar dene", () => {
    const refetch = vi.fn();
    h.threads = { isLoading: false, data: undefined, isError: true, refetch } as never;
    render(<CompanyInboxView />);
    expect(screen.queryByText(/önce bir firmayla bağlantı kur/)).not.toBeInTheDocument();
    expect(screen.getByText(/Konuşmalar yüklenemedi/)).toBeInTheDocument();
    // Son canlı kontrol OUTF-4: kart, hemen üstündeki "Sunucuya şu anda
    // ulaşılamıyor" notuyla çelişmez — kullanıcının kendi bağlantısı suçlanmaz.
    expect(screen.getByRole("alert")).toHaveTextContent("Konuşmalar yüklenemedi. Lütfen tekrar deneyin.");
    expect(screen.getByRole("alert")).not.toHaveTextContent(/bağlantınızı/i);
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  /**
   * Son canlı kontrol OUTF-1: konuşma listesi 5 sn'de bir yoklanır; TanStack
   * verisi olmayan sorguyu her yeniden çekişte "pending"e döndürür (hata silinir)
   * → kesinti boyunca hata satırı ile iskelet dönüşümlü çiziliyordu.
   */
  it("okunamayan liste yoklamayla iskelete DÖNMEZ: hata satırı yanıt gelene dek durur", () => {
    h.threads = { isLoading: false, isPending: false, data: undefined, isError: true, refetch: vi.fn() } as never;
    const view = render(<CompanyInboxView />);
    expect(screen.getByRole("alert")).toHaveTextContent("Konuşmalar yüklenemedi");

    // Yoklama yeniden deniyor: veri yok, hata silindi, durum "pending".
    h.threads = { isLoading: true, isPending: true, data: undefined, isError: false, refetch: vi.fn() } as never;
    view.rerender(<CompanyInboxView />);
    expect(screen.getByRole("alert")).toHaveTextContent("Konuşmalar yüklenemedi");
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
    expect(view.container.querySelector(".animate-pulse")).toBeNull();

    // Yanıt geldi: hata satırı kalkar.
    h.threads = { isLoading: false, isPending: false, data: [], isError: false, refetch: vi.fn() } as never;
    view.rerender(<CompanyInboxView />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("CompanyInboxView — alıcı yönü Gold (arayüz testi O-123)", () => {
  it("SILVER firmada yeni sohbet satıcı yönünde açılır; alıcı yönü seçicide kilitli", () => {
    h.tier = "SILVER";
    h.permissions = ["buy:view", "buy:listing:manage", "sell:view", "sell:bid:submit"];
    h.connections = [{ company: { id: "c9", name: "Bağlı Firma" } }];
    h.threadRes = (_portal, id) => ({
      data: { otherParty: { id, name: "Bağlı Firma" }, messages: [] },
      isLoading: false,
      isError: false,
    });
    render(<CompanyInboxView />);
    fireEvent.click(screen.getByRole("button", { name: /Bağlı Firma/ }));
    expect(screen.getByTestId("thread")).toHaveTextContent("satis|c9|Bağlı Firma");
    expect(screen.getByRole("button", { name: "Alıcı olarak" })).toBeInTheDocument();
    expect(screen.getByTestId("inbox-direction-locked-satinalma")).toBeInTheDocument();
    expect(screen.queryByTestId("inbox-direction-locked-satis")).not.toBeInTheDocument();
  });

  // Gözden geçirme (webA-08): konuşması olan firma tek satıra (o konuşmanın
  // yönüne) sabitlenir; seçici Gold altında gizlenince yalnız ALICI yönlü
  // konuşması olan firmayla her pakete açık SATICI yönüne geçilemiyordu.
  it("SILVER firma, yalnız alıcı yönlü konuşmadan satıcı yönüne geçer", () => {
    h.tier = "SILVER";
    h.permissions = ["buy:view", "buy:listing:manage", "sell:view", "sell:bid:submit"];
    h.connections = [{ company: { id: "x1", name: "X Firma" } }];
    h.threads = {
      isLoading: false,
      data: [
        {
          portal: "satinalma",
          threadId: "t3",
          otherPartyId: "x1",
          otherPartyName: "X Firma",
          lastMessagePreview: "Teklif",
          lastMessageAt: "2026-09-20T08:00:00.000Z",
          unread: false,
        },
      ],
    };
    render(<CompanyInboxView />);
    // Firma başına tek satır (bağlantı satırı konuşmayla tekilleşir).
    expect(screen.getAllByRole("button", { name: /X Firma/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /X Firma/ }));
    expect(screen.getByTestId("thread")).toHaveTextContent("satinalma|x1|X Firma");
    fireEvent.click(screen.getByRole("button", { name: "Satıcı olarak" }));
    expect(screen.getByTestId("thread")).toHaveTextContent("satis|x1|X Firma");
  });

  it("tek işlem rolü olan kullanıcıda seçici yok", () => {
    h.tier = "SILVER";
    h.permissions = ["sell:view", "sell:bid:submit"];
    h.connections = [{ company: { id: "c9", name: "Bağlı Firma" } }];
    render(<CompanyInboxView />);
    fireEvent.click(screen.getByRole("button", { name: /Bağlı Firma/ }));
    expect(screen.getByTestId("thread")).toHaveTextContent("satis|c9|Bağlı Firma");
    expect(screen.queryByRole("button", { name: "Alıcı olarak" })).not.toBeInTheDocument();
  });

  it("SILVER firma eski alıcı konuşmasını listede görür ve açar (okuma serbest)", () => {
    h.tier = "SILVER";
    h.permissions = ["buy:view", "buy:listing:manage", "sell:view", "sell:bid:submit"];
    h.threads = {
      isLoading: false,
      data: [
        {
          portal: "satinalma",
          threadId: "t2",
          otherPartyId: "sup1",
          otherPartyName: "Eski Tedarikçi",
          lastMessagePreview: "Teklif",
          lastMessageAt: "2026-09-20T08:00:00.000Z",
          unread: false,
        },
      ],
    };
    render(<CompanyInboxView />);
    fireEvent.click(screen.getByRole("button", { name: /Eski Tedarikçi/ }));
    expect(screen.getByTestId("thread")).toHaveTextContent("satinalma|sup1|Eski Tedarikçi");
  });

  it("GOLD firmada iki yönlü seçici durur", () => {
    h.permissions = ["buy:view", "buy:listing:manage", "sell:view", "sell:bid:submit"];
    h.connections = [{ company: { id: "c9", name: "Bağlı Firma" } }];
    render(<CompanyInboxView />);
    fireEvent.click(screen.getByRole("button", { name: /Bağlı Firma/ }));
    expect(screen.getByRole("button", { name: "Alıcı olarak" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Satıcı olarak" })).toBeInTheDocument();
  });
});

describe("CompanyInboxView — telefon düzeni (mobil denetim g04)", () => {
  const row = {
    portal: "satinalma",
    threadId: "t1",
    otherPartyId: "supA",
    otherPartyName: "QA Tedarikçi Ltd. Şti.",
    lastMessagePreview: "Merhaba",
    lastMessageAt: "2026-09-29T08:00:00.000Z",
    unread: true,
  };

  it("liste satırında rol rozeti telefonda önizleme satırına iner; ad kırpılmaz, sarar", () => {
    h.permissions = ["buy:view", "buy:listing:manage", "sell:view", "sell:bid:submit"];
    h.threads = { isLoading: false, data: [row] };
    render(<CompanyInboxView />);
    const button = screen.getByRole("button", { name: /QA Tedarikçi Ltd\. Şti\./ });
    const chips = Array.from(button.querySelectorAll("span")).filter((el) => el.textContent === "Alıcısınız");
    // Ad satırında yalnız sm+ (telefonda gizli), önizleme satırında yalnız telefonda.
    expect(chips.map((el) => el.className)).toEqual([
      expect.stringMatching(/(^|\s)max-sm:hidden(\s|$)/),
      expect.stringMatching(/(^|\s)sm:hidden(\s|$)/),
    ]);
    const name = screen.getByText("QA Tedarikçi Ltd. Şti.");
    expect(name.className).toMatch(/(^|\s)max-sm:line-clamp-2(\s|$)/);
    expect(name.className).toMatch(/(^|\s)sm:truncate(\s|$)/);
  });

  it("sohbet açıkken: sayfa başlığı telefonda çekilir, kutu dvh ile ekranı doldurur, geri oku ve yön seçicisi 40+ px", () => {
    h.permissions = ["buy:view", "buy:listing:manage", "sell:view", "sell:bid:submit"];
    h.threads = { isLoading: false, data: [row] };
    const view = render(<CompanyInboxView />);
    // PageHeader: kap > metin sütunu > başlık.
    const header = () => screen.getByRole("heading", { name: "Mesajlar" }).parentElement!.parentElement!;
    const grid = view.container.querySelector("div.grid") as HTMLElement;
    // Liste görünümünde başlık durur; yükseklik vh değil dvh.
    expect(header().className).not.toMatch(/sr-only/);
    // Güvenli alanın üst/alt payı da düşülür (pay 0 iken 100dvh − 17rem).
    expect(grid.className).toMatch(/h-\[calc\(100dvh-17rem-var\(--safe-top\)-var\(--safe-bottom\)\)\]/);
    expect(grid.className).not.toMatch(/100vh/);

    vi.spyOn(window.history, "back").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: /QA Tedarikçi Ltd\. Şti\./ }));
    // Başlık ekran okuyucu için durur, telefonda görsel olarak çekilir.
    expect(header().className).toMatch(/(^|\s)max-sm:sr-only(\s|$)/);
    // Kutu sayfanın üst payına çıkar (şerit üst çubuğun hemen altında) ve üst
    // çubuk (3.5rem) + asistan düğmesinin alt payı (6rem) arasını doldurur.
    expect(grid.className).toMatch(/max-sm:h-\[calc\(100dvh-9\.5rem-var\(--safe-top\)-var\(--safe-bottom\)\)\]/);
    expect(grid.className).toMatch(/(^|\s)max-sm:-mt-6(\s|$)/);
    expect(grid.className).toMatch(/(^|\s)max-sm:border-t-0(\s|$)/);
    expect(grid.className).not.toMatch(/-mb-24/);

    const back = screen.getByRole("button", { name: "Kişilere dön" });
    expect(back.className).toMatch(/(^|\s)size-11(\s|$)/);
    expect(back.className).toMatch(/(^|\s)sm:hidden(\s|$)/);
    for (const name of ["Alıcı olarak", "Satıcı olarak"]) {
      expect(screen.getByRole("button", { name }).className).toMatch(/(^|\s)max-sm:min-h-10(\s|$)/);
    }
    // Etkin yön programatik de okunur (telefonda cümle görsel olarak çekildi).
    expect(screen.getByRole("button", { name: "Alıcı olarak" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Satıcı olarak" })).toHaveAttribute("aria-pressed", "false");
    // Yön seçicisi varken cümle telefonda görsel olarak çekilir (bilgi seçicide).
    expect(screen.getByText(/size satış yapıyor/).className).toMatch(/(^|\s)max-sm:sr-only(\s|$)/);
  });

  it("tek işlem rolünde seçici yok: cümle telefonda da görünür", () => {
    h.permissions = ["buy:view", "buy:listing:manage"];
    h.threads = { isLoading: false, data: [row] };
    render(<CompanyInboxView />);
    fireEvent.click(screen.getByRole("button", { name: /QA Tedarikçi Ltd\. Şti\./ }));
    expect(screen.getByText(/size satış yapıyor/).className).not.toMatch(/sr-only/);
  });
});

/**
 * Mobil denetim g04 (yeniden doğrulama): seçim adrese `replaceState` ile
 * yazıldığı için Android Geri'si konuşmadan Mesajlar'dan ÖNCEKİ sayfaya
 * gidiyordu; klavye açıkken mesaj listesine ~110 px kalıyordu.
 */
describe("CompanyInboxView — telefonda Geri listeye döner, yazarken kutu ekranı doldurur", () => {
  const row = {
    portal: "satinalma",
    threadId: "t1",
    otherPartyId: "supA",
    otherPartyName: "QA Tedarikçi Ltd. Şti.",
    lastMessagePreview: "Merhaba",
    lastMessageAt: "2026-09-29T08:00:00.000Z",
    unread: false,
  };
  beforeEach(() => {
    h.permissions = ["buy:view", "buy:listing:manage"];
    h.threads = { isLoading: false, data: [row] };
  });

  it("tek panelde listeden açılış geçmişe İŞARETLİ kayıt ekler; geri oku o kaydı geri alır", () => {
    setScreen({ wide: false });
    const push = vi.spyOn(window.history, "pushState");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const replace = vi.spyOn(window.history, "replaceState");
    render(<CompanyInboxView />);
    fireEvent.click(screen.getByRole("button", { name: /QA Tedarikçi/ }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]![0]).toEqual({ [INBOX_THREAD_STATE_KEY]: true });
    expect(new URLSearchParams(window.location.search).get("with")).toBe("supA");

    replace.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Kişilere dön" }));
    expect(back).toHaveBeenCalledTimes(1);
    // Kayıt Geri ile düşer — üstüne liste adresi YAZILMAZ (İleri bozulmasın).
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByTestId("thread")).not.toBeInTheDocument();
  });

  it("Geri/İleri sonrası da işaret kayıtta: geri oku history.back() kullanır (yinelenen liste kaydı yok)", () => {
    setScreen({ wide: false });
    // İleri ile dönülen konuşma kaydı: işaret history.state'te durur.
    window.history.replaceState({ [INBOX_THREAD_STATE_KEY]: true }, "", "/company/mesajlar?with=supA&portal=satinalma");
    h.search = "with=supA&portal=satinalma";
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(<CompanyInboxView />);
    expect(screen.getByTestId("thread")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Kişilere dön" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("derin bağlantı (işaretsiz kayıt): geri oku adresi yerinde temizler", () => {
    setScreen({ wide: false });
    window.history.replaceState(null, "", "/company/mesajlar?with=supA&portal=satinalma");
    h.search = "with=supA&portal=satinalma";
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(<CompanyInboxView />);
    fireEvent.click(screen.getByRole("button", { name: "Kişilere dön" }));
    expect(back).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it("adres dışarıdan değişince (sistem Geri / İleri) görünüm izler", () => {
    setScreen({ wide: false });
    const view = render(<CompanyInboxView />);
    fireEvent.click(screen.getByRole("button", { name: /QA Tedarikçi/ }));
    // Next `pushState`i `useSearchParams`e yansıtır — aynı seçim, dokunulmaz.
    h.search = "with=supA&portal=satinalma";
    view.rerender(<CompanyInboxView />);
    expect(screen.getByTestId("thread")).toHaveTextContent("satinalma|supA|");

    // Sistem Geri'si: adres listeye döndü → sohbet kapanır.
    h.search = "";
    view.rerender(<CompanyInboxView />);
    expect(screen.queryByTestId("thread")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /QA Tedarikçi/ })).toBeInTheDocument();

    // İleri: konuşma yeniden açılır.
    h.search = "with=supA&portal=satinalma";
    view.rerender(<CompanyInboxView />);
    expect(screen.getByTestId("thread")).toHaveTextContent("satinalma|supA|");
  });

  it("listeye dönünce liste kaydırma konumu geri gelir", () => {
    setScreen({ wide: false });
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    const view = render(<CompanyInboxView />);
    const scroller = () =>
      screen.getByRole("button", { name: /QA Tedarikçi/ }).parentElement as HTMLElement;
    scroller().scrollTop = 240;
    fireEvent.click(screen.getByRole("button", { name: /QA Tedarikçi/ }));
    // Gizlenen kap konumunu yitirir (tarayıcı).
    scroller().scrollTop = 0;
    fireEvent.click(screen.getByRole("button", { name: "Kişilere dön" }));
    expect(scroller().scrollTop).toBe(240);
    view.unmount();
  });

  it("yazarken (telefon/dokunmatik + metin alanı odakta) kutu asistan payını da kaplar", () => {
    setScreen({ wide: false, coarse: true });
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    const view = render(<CompanyInboxView />);
    const grid = view.container.querySelector("div.grid") as HTMLElement;
    fireEvent.click(screen.getByRole("button", { name: /QA Tedarikçi/ }));
    const box = screen.getByRole("textbox", { name: "Mesaj kutusu" });

    act(() => box.focus());
    expect(grid.className).toMatch(/(^|\s)max-sm:-mb-24(\s|$)/);
    expect(grid.className).toMatch(/max-sm:h-\[calc\(100dvh-3\.5rem-var\(--safe-top\)-var\(--safe-bottom\)\)\]/);
    // Üst kenar yerinde (geri oku ve yön seçicisi kaymaz).
    expect(grid.className).toMatch(/(^|\s)max-sm:-mt-6(\s|$)/);

    act(() => box.blur());
    expect(grid.className).not.toMatch(/-mb-24/);
    expect(grid.className).toMatch(/max-sm:h-\[calc\(100dvh-9\.5rem/);

    // Masaüstü (ince işaretçi, geniş ekran): yazmak düzeni değiştirmez.
    setScreen({ wide: true, coarse: false });
    act(() => box.focus());
    expect(grid.className).not.toMatch(/-mb-24/);
  });

  it("odaktaki kutu blur'suz kalkınca (sistem Geri) sonraki açılış asistan payını kaplamaz", () => {
    setScreen({ wide: false, coarse: true });
    const view = render(<CompanyInboxView />);
    const grid = view.container.querySelector("div.grid") as HTMLElement;
    fireEvent.click(screen.getByRole("button", { name: /QA Tedarikçi/ }));
    h.search = "with=supA&portal=satinalma";
    view.rerender(<CompanyInboxView />);
    act(() => screen.getByRole("textbox", { name: "Mesaj kutusu" }).focus());
    expect(grid.className).toMatch(/(^|\s)max-sm:-mb-24(\s|$)/);

    // Sistem Geri'si: kutu odaktayken sohbet kalkar (blur her tarayıcıda gelmez).
    h.search = "";
    view.rerender(<CompanyInboxView />);
    expect(screen.queryByTestId("thread")).not.toBeInTheDocument();

    // Yeniden açılış: kutu odakta değil → asistan düğmesi görünür, pay boş kalmalı.
    fireEvent.click(screen.getByRole("button", { name: /QA Tedarikçi/ }));
    expect(screen.getByTestId("thread")).toBeInTheDocument();
    expect(grid.className).not.toMatch(/-mb-24/);
    expect(grid.className).toMatch(/max-sm:h-\[calc\(100dvh-9\.5rem/);
  });
});
