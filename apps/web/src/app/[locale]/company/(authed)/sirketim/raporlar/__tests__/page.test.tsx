// @vitest-environment jsdom
/**
 * RAPORLAR HUB'I — YETKİYE GÖRE KART (2026-09-17, kullanıcı kararı: "genel
 * bakış ve raporlar satınalma/satışa göre değişmeli, biri diğerini görmemeli").
 *
 * İş Analizi SATIŞ raporu (Silver+, insights:view); üç satınalma raporu Gold +
 * buy:reports:view. Kart, yetkisi olmayana HİÇ çizilmez (alt düzen kapısı
 * ayrıca var — burada sınanan şey "kartı görmemesi").
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ auth: { user: null as unknown, company: null as unknown } }));
vi.mock("@/hooks/use-company-auth", () => ({ useCompanyAuth: () => h.auth }));

import RaporlarPage from "../page";

function setAuth(permissions: string[], tier: string) {
  h.auth = { user: { permissions, roles: [], isOwner: false }, company: { tier } };
}

describe("Raporlar hub — kartlar yetkiye göre", () => {
  it("yalnız SATIŞ yetkisi (Silver): İş Analizi var, satınalma raporları YOK", () => {
    setAuth(["sell:view", "insights:view"], "SILVER");
    render(<RaporlarPage />);
    expect(screen.getByRole("link", { name: /İş Analizi/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Tasarruf Raporu/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Teklif Karşılaştırma/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Genel Satın Alma Talebi/ })).toBeNull();
  });

  it("yalnız SATINALMA rapor yetkisi (Gold): üç satınalma raporu var, İş Analizi YOK", () => {
    setAuth(["buy:view", "buy:reports:view"], "GOLD");
    render(<RaporlarPage />);
    expect(screen.getByRole("link", { name: /Tasarruf Raporu/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Teklif Karşılaştırma/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Genel Satın Alma Talebi/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /İş Analizi/ })).toBeNull();
  });

  it("satınalma rapor yetkisi var ama paket SILVER: satınalma raporları çizilmez (Gold şartı)", () => {
    setAuth(["buy:view", "buy:reports:view", "insights:view"], "SILVER");
    render(<RaporlarPage />);
    expect(screen.queryByRole("link", { name: /Tasarruf Raporu/ })).toBeNull();
    expect(screen.getByRole("link", { name: /İş Analizi/ })).toBeInTheDocument();
  });

  it("iki yetki de varsa dört kart", () => {
    setAuth(["buy:reports:view", "insights:view"], "GOLD");
    render(<RaporlarPage />);
    expect(screen.getAllByRole("link").length).toBe(4);
  });
});
