// @vitest-environment jsdom
// F7: boş-durum "Yeni İhale Aç" CTA'sı yalnız buy|sell:listing:create iznine
// görünür; izinsizde liste yine render olur (salt-okunur regresyon).
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  hasPerm: false,
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: () => h.hasPerm,
  useCompanyAuth: () => ({ user: { id: "u1", roles: [] } }),
}));
vi.mock("@/hooks/use-company-listings", () => ({
  usePublishListing: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { OwnerTenderList } from "../owner-tender-cards";

beforeEach(() => {
  h.hasPerm = false;
});

const baseProps = {
  items: [] as never[],
  isLoading: false,
  isError: false,
  onRetry: () => {},
};

describe("OwnerTenderList boş-durum CTA gating", () => {
  it("izinsiz: CTA yok, rol açıklaması var (boş durum yine görünür)", () => {
    render(<OwnerTenderList {...baseProps} />);
    expect(screen.getByText("Henüz ihale yok")).toBeInTheDocument();
    expect(screen.queryByText("Yeni İhale Aç")).not.toBeInTheDocument();
    expect(
      screen.getByText(/işlem rolü .* gerektirir/),
    ).toBeInTheDocument();
  });

  it("izinli (SA/ST): CTA görünür", () => {
    h.hasPerm = true;
    render(<OwnerTenderList {...baseProps} />);
    expect(screen.getByText("Yeni İhale Aç")).toBeInTheDocument();
  });
});
