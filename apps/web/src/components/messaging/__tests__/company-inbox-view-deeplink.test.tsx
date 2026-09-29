// @vitest-environment jsdom
// Derin denetim 2026-09-29 Y-18: `?with=` derin linki bağlantısız ve daha önce
// yazışılmamış firmada (teklif veren / sipariş karşı tarafı) sohbeti HİÇ
// açmıyordu — ad yalnız konuşmalar + aktif bağlantılardan çözülüyor, panel
// "Bir kişi seç"e düşüyor, mobilde geri butonu da kayboluyordu. Ayrıca
// portalsız e-posta linki iki izinli kullanıcıda ters yöndeki boş konuşmayı
// açıyordu.
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Portal = "satinalma" | "satis";
interface ThreadRes {
  data?: { otherParty: { id: string; name: string }; messages: [] };
  isLoading: boolean;
  isError: boolean;
}

const h = vi.hoisted(() => ({
  search: "",
  permissions: [] as string[],
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
  useCompanyAuth: () => ({ user: { permissions: h.permissions } }),
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
    <div data-testid="thread">
      {p.portal}|{p.otherPartyId}|{p.otherPartyName}
    </div>
  ),
}));

import { CompanyInboxView } from "../company-inbox-view";

beforeEach(() => {
  h.search = "";
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

  it("portalsız link, konuşmalar yüklenirken yön seçilmez (iskelet)", () => {
    h.permissions = ["buy:view", "sell:view"];
    h.search = "with=buyerA";
    h.threads = { data: undefined as unknown as unknown[], isLoading: true };
    render(<CompanyInboxView />);
    expect(screen.queryByTestId("thread")).not.toBeInTheDocument();
    expect(screen.getByTestId("inbox-thread-skeleton")).toBeInTheDocument();
  });
});
