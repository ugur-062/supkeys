// @vitest-environment jsdom
// F7: mesaj composer'ı portal-yönlü işlem rolü ister (backend send() birebir);
// rolsüz/etiket-only konuşmayı OKUR (regresyon) ama gönderemez.
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  roles: [] as string[],
}));

vi.mock("@/hooks/use-company-messages", () => ({
  useThreadMessages: () => ({ data: { messages: [] }, isLoading: false }),
  useSendMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: { roles: h.roles } }),
}));

import { CompanyMessageThread } from "../company-message-thread";

beforeEach(() => {
  h.roles = [];
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
});
