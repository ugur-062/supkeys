// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CompanyProfileView,
  type ProfileViewData,
} from "../company-profile-view";

const base: ProfileViewData = {
  name: "Test Firma",
  industry: "Üretim",
  city: "İstanbul",
  country: "TR",
  logoUrl: null,
  coverImageUrl: null,
  aboutText: null,
  services: [],
  certifications: [],
  certificateImages: [],
  photos: [],
  foundedYear: 2020,
  employeeCount: "10-50",
  website: null,
  linkedinUrl: null,
  instagramUrl: null,
};

describe("CompanyProfileView — dış bağlantı XSS koruması", () => {
  it("javascript: website linki RENDER EDİLMEZ", () => {
    render(
      <CompanyProfileView
        profile={{ ...base, website: "javascript:alert(document.cookie)" }}
      />,
    );
    expect(screen.queryByText("Web Sitesi")).toBeNull();
  });

  it("geçerli https website linki render edilir (href normalize)", () => {
    render(
      <CompanyProfileView
        profile={{ ...base, website: "https://example.com" }}
      />,
    );
    const link = screen.getByText("Web Sitesi").closest("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("https://example.com/");
  });

  it("şemasız website https:// ile normalize edilip render edilir", () => {
    render(<CompanyProfileView profile={{ ...base, website: "foo.com" }} />);
    const link = screen.getByText("Web Sitesi").closest("a");
    expect(link?.getAttribute("href")).toBe("https://foo.com/");
  });
});
