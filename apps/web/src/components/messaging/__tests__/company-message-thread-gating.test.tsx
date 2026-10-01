// @vitest-environment jsdom
// F7: mesaj composer'ı portal-yönlü işlem rolü ister (backend send() birebir);
// rolsüz/etiket-only konuşmayı OKUR (regresyon) ama gönderemez.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  roles: [] as string[],
  send: null as null | ((content: string) => Promise<unknown>),
}));

vi.mock("@/hooks/use-company-messages", () => ({
  useThreadMessages: () => ({ data: { messages: [] }, isLoading: false }),
  useSendMessage: () => ({
    mutateAsync: (content: string) => (h.send ? h.send(content) : Promise.resolve()),
    isPending: false,
  }),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: { roles: h.roles } }),
}));

import { CompanyMessageThread } from "../company-message-thread";

beforeEach(() => {
  h.roles = [];
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
});
