// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CompanyProfileView,
  type ProfileViewData,
} from "../company-profile-view";

const base: ProfileViewData = {
  name: "Firma X",
  industry: null,
  city: null,
  country: "TR",
  logoUrl: null,
  coverImageUrl: null,
  aboutText: null,
  services: [],
  certifications: [],
  certificateImages: [],
  photos: [],
  foundedYear: null,
  employeeCount: null,
  website: null,
  linkedinUrl: null,
  instagramUrl: null,
};

describe("CompanyProfileView — değerlendirme özeti (firma bazında gruplu)", () => {
  it("genel puan + firma/sipariş sayısı, anonim rol etiketi, opt-in ad, gizli yorumlar", () => {
    render(
      <CompanyProfileView
        profile={{
          ...base,
          rating: { avg: 3, count: 11 },
          reviewSummary: {
            avg: 3,
            firms: 2,
            orders: 11,
            distribution: { 5: 10, 4: 0, 3: 0, 2: 0, 1: 1 },
            partners: [
              { name: null, role: "buyer", avg: 1, count: 1, lastAt: "2026-08-10T00:00:00.000Z", comments: [{ rating: 1, comment: "Geç teslim", createdAt: "2026-08-10T00:00:00.000Z" }] },
              {
                name: "Referans A.Ş.",
                role: "seller",
                avg: 5,
                count: 10,
                lastAt: "2026-07-10T00:00:00.000Z",
                comments: [
                  { rating: 5, comment: "Harika", createdAt: "2026-07-10T00:00:00.000Z" },
                  { rating: 5, comment: "Yine harika", createdAt: "2026-07-01T00:00:00.000Z" },
                ],
              },
            ],
          },
        }}
      />,
    );
    expect(screen.getByText("Değerlendirmeler")).toBeInTheDocument();
    expect(screen.getAllByText("3.0").length).toBeGreaterThan(0); // başlık şeridi + özet
    expect(screen.getByText(/2 firma · 11 sipariş/)).toBeInTheDocument();
    expect(screen.getByText("Doğrulanmış alıcı")).toBeInTheDocument();
    expect(screen.getByText("Referans A.Ş.")).toBeInTheDocument();
    expect(screen.getByText(/· 10 sipariş/)).toBeInTheDocument();
    expect(screen.getByText("Geç teslim")).toBeInTheDocument();
    expect(screen.getByText("Harika")).toBeInTheDocument();
    // İkinci yorum <details> içinde — özet etiketi var
    expect(screen.getByText("Diğer 1 yorum")).toBeInTheDocument();
  });

  it("değerlendirme yoksa bölüm hiç çizilmez", () => {
    render(<CompanyProfileView profile={{ ...base, reviewSummary: { avg: 0, firms: 0, orders: 0, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, partners: [] } }} />);
    expect(screen.queryByText("Değerlendirmeler")).not.toBeInTheDocument();
  });
});
