// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ admin: { role: "SALES" } as { role: string } | null }));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: h.admin }),
}));

import { CompanyLink } from "../company-link";

beforeEach(() => {
  h.admin = { role: "SALES" };
});

describe("CompanyLink (karar T-09 — 403 sayfasına bağlantı yok)", () => {
  it("firma detayını görebilen rolde bağlantı", () => {
    render(<CompanyLink href="/admin/firmalar/c1" className="text-sm hover:underline">Acme</CompanyLink>);
    expect(screen.getByRole("link", { name: "Acme" })).toHaveAttribute("href", "/admin/firmalar/c1");
  });

  it("SUPPORT'ta düz metin (hover süsü olmadan)", () => {
    h.admin = { role: "SUPPORT" };
    render(<CompanyLink href="/admin/firmalar/c1" className="text-sm hover:underline">Acme</CompanyLink>);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    const el = screen.getByText("Acme");
    expect(el.tagName).toBe("SPAN");
    expect(el.className).toBe("text-sm");
  });
});
