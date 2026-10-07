// @vitest-environment jsdom
// F7: mesaj composer'ı portal-yönlü işlem rolü ister (backend send() birebir);
// rolsüz/etiket-only konuşmayı OKUR (regresyon) ama gönderemez.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  roles: [] as string[],
  tier: "GOLD" as string,
  verification: "VERIFIED" as string,
  sendOpenByOrder: undefined as boolean | undefined,
  send: null as null | ((content: string) => Promise<unknown>),
}));

vi.mock("@/hooks/use-company-messages", () => ({
  useThreadMessages: () => ({
    data: { messages: [], sendOpenByOrder: h.sendOpenByOrder },
    isLoading: false,
  }),
  useSendMessage: () => ({
    mutateAsync: (content: string) => (h.send ? h.send(content) : Promise.resolve()),
    isPending: false,
  }),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({
    user: { roles: h.roles },
    company: { tier: h.tier, companyVerificationStatus: h.verification },
  }),
}));

import { CompanyMessageThread } from "../company-message-thread";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

/** Doğrulama kapısı durumu oturum deposundan okur (verification-gate). */
const setVerification = (status: string | null) =>
  useCompanyAuthStore.setState({
    user: null,
    company: status ? { companyVerificationStatus: status } : null,
  } as never);

beforeEach(() => {
  setVerification(null);
  h.roles = [];
  h.tier = "GOLD";
  h.verification = "VERIFIED";
  h.sendOpenByOrder = undefined;
  h.send = null;
  // jsdom scrollIntoView yok — thread mount'ta çağırıyor.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("CompanyMessageThread composer gating", () => {
  it("satinalma portalında etiket-only: konuşma görünür, composer yerine rol notu", () => {
    h.roles = ["SAHIP"];
    render(
      <CompanyMessageThread
        portal="satinalma"
        otherPartyId="c2"
        otherPartyName="Karşı Firma"
      />,
    );
    expect(screen.getByText("Karşı Firma")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gönder" })).not.toBeInTheDocument();
    expect(screen.getByText(/Satın Almacı.*rolü gerektirir/)).toBeInTheDocument();
  });

  it("yön uyuşmayan rol de gönderemez (satinalma'da yalnız-Satışçı)", () => {
    h.roles = ["SATISCI"];
    render(
      <CompanyMessageThread
        portal="satinalma"
        otherPartyId="c2"
        otherPartyName="Karşı Firma"
      />,
    );
    expect(screen.queryByRole("button", { name: "Gönder" })).not.toBeInTheDocument();
  });

  it("doğru yön rolü: composer görünür", () => {
    h.roles = ["SATIN_ALMACI"];
    render(
      <CompanyMessageThread
        portal="satinalma"
        otherPartyId="c2"
        otherPartyName="Karşı Firma"
      />,
    );
    expect(screen.getByRole("button", { name: "Gönder" })).toBeInTheDocument();
  });

  it("Enter'a art arda basmak aynı mesajı bir kez gönderir (arayüz testi FX-00 D-067)", async () => {
    h.roles = ["SATIN_ALMACI"];
    let resolve!: () => void;
    const send = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    h.send = send;
    render(
      <CompanyMessageThread portal="satinalma" otherPartyId="c2" otherPartyName="Karşı Firma" />,
    );
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "Merhaba" } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Gönder" }));
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve();
    });
  });

  it("IME bileşimindeki Enter mesajı GÖNDERMEZ (arayüz testi D-356)", () => {
    h.roles = ["SATIN_ALMACI"];
    const send = vi.fn(() => Promise.resolve());
    h.send = send;
    render(
      <CompanyMessageThread portal="satinalma" otherPartyId="c2" otherPartyName="Karşı Firma" />,
    );
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "こんにちは" } });
    fireEvent.keyDown(box, { key: "Enter", isComposing: true });
    fireEvent.keyDown(box, { key: "Enter", keyCode: 229 });
    expect(send).not.toHaveBeenCalled();
  });

  it("5000 karakter tavanı + sayaç (arayüz testi D-356)", () => {
    h.roles = ["SATIN_ALMACI"];
    render(
      <CompanyMessageThread portal="satinalma" otherPartyId="c2" otherPartyName="Karşı Firma" />,
    );
    const box = screen.getByRole("textbox");
    expect(box).toHaveAttribute("maxLength", "5000");
    fireEvent.change(box, { target: { value: "a".repeat(100) } });
    expect(screen.queryByText(/\/5\.000 karakter/)).not.toBeInTheDocument();
    fireEvent.change(box, { target: { value: "a".repeat(4500) } });
    expect(screen.getByText("4.500/5.000 karakter")).toBeInTheDocument();
  });
});

describe("CompanyMessageThread — alıcı yönü doğrulama kapısı (arayüz testi O-123; ücretsiz dönem)", () => {
  it("doğrulaması incelemedeki firmada alıcı yönü: konuşma okunur, composer yerine doğrulama notu + durum bağlantısı", () => {
    h.roles = ["SATIN_ALMACI", "SATISCI"];
    h.tier = "STANDART";
    h.verification = "PENDING";
    setVerification("PENDING");
    render(
      <CompanyMessageThread portal="satinalma" otherPartyId="c2" otherPartyName="Karşı Firma" />,
    );
    expect(screen.getByText("Karşı Firma")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gönder" })).not.toBeInTheDocument();
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(/Alıcı olarak mesaj göndermek firma doğrulaması gerektirir/);
    // Paket adı / paket sayfası yok.
    expect(note).not.toHaveTextContent(/Gold|Silver|paket/i);
    expect(screen.getByRole("link", { name: "Doğrulama durumunu gör" })).toHaveAttribute(
      "href",
      "/company/ayarlar/dogrulama",
    );
  });

  it("doğrulanmamış firmada bağlantı doğrulama başvurusuna gider", () => {
    h.roles = ["SATIN_ALMACI"];
    h.tier = "STANDART";
    h.verification = "UNVERIFIED";
    setVerification("UNVERIFIED");
    render(
      <CompanyMessageThread portal="satinalma" otherPartyId="c2" otherPartyName="Karşı Firma" />,
    );
    expect(screen.getByRole("link", { name: "Firmanızı doğrulayın" })).toHaveAttribute(
      "href",
      "/company/ayarlar/dogrulama",
    );
  });

  it("doğrulaması reddedilen firmada bağlantı 'Yeniden başvurun'", () => {
    h.roles = ["SATIN_ALMACI"];
    h.tier = "STANDART";
    h.verification = "REJECTED";
    setVerification("REJECTED");
    render(
      <CompanyMessageThread portal="satinalma" otherPartyId="c2" otherPartyName="Karşı Firma" />,
    );
    expect(screen.getByRole("link", { name: "Yeniden başvurun" })).toHaveAttribute("href", "/company/ayarlar/dogrulama");
  });

  // Gözden geçirme (webA-08), T-06: süren siparişin satıcısına yazışma
  // kesilmez — sunucu istisnayı bildirir, composer açılır (rol yine şart).
  it("erişimi yetmeyen firmada süren sipariş istisnası: doğrulama notu yerine composer", () => {
    h.roles = ["SATIN_ALMACI"];
    h.tier = "SILVER";
    h.sendOpenByOrder = true;
    render(
      <CompanyMessageThread portal="satinalma" otherPartyId="c2" otherPartyName="Karşı Firma" />,
    );
    expect(screen.getByRole("button", { name: "Gönder" })).toBeInTheDocument();
    expect(screen.queryByText(/firma doğrulaması gerektirir/)).not.toBeInTheDocument();
  });

  it("süren sipariş istisnası rol kapısını aşmaz (etiket-only)", () => {
    h.roles = ["SAHIP"];
    h.tier = "SILVER";
    h.sendOpenByOrder = true;
    render(
      <CompanyMessageThread portal="satinalma" otherPartyId="c2" otherPartyName="Karşı Firma" />,
    );
    expect(screen.queryByRole("button", { name: "Gönder" })).not.toBeInTheDocument();
    expect(screen.getByText(/Satın Almacı.*rolü gerektirir/)).toBeInTheDocument();
  });

  it("satıcı yönü her pakete açık: ücretsiz pakette Satışçı yazabilir", () => {
    h.roles = ["SATISCI"];
    h.tier = "STANDART";
    render(
      <CompanyMessageThread portal="satis" otherPartyId="c2" otherPartyName="Karşı Firma" />,
    );
    expect(screen.getByRole("button", { name: "Gönder" })).toBeInTheDocument();
  });
});
