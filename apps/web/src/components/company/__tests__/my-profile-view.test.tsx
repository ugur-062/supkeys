// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  q: { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() },
}));

vi.mock("@/hooks/use-company-profile", () => ({ useCompanyProfile: () => h.q }));
vi.mock("@/hooks/use-company-auth", () => ({ useHasCompanyPermission: () => true }));
vi.mock("@/components/company/profile-editor", () => ({ ProfileEditor: () => <div>editor</div> }));

import { MyProfileView } from "../my-profile-view";

beforeEach(() => {
  h.q = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
});

describe("MyProfileView (derin denetim LU-27)", () => {
  it("profil sorgusu hata verince iskelette kalmaz; hata kartı ve tekrar dene çizilir", async () => {
    h.q.isError = true;
    render(<MyProfileView />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(h.q.refetch).toHaveBeenCalledTimes(1);
  });

  it("yüklenirken iskelet, veri gelince düzenleyici", () => {
    h.q.isLoading = true;
    const { rerender } = render(<MyProfileView />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("editor")).toBeNull();
    h.q = { ...h.q, isLoading: false, data: { name: "X" } };
    rerender(<MyProfileView />);
    expect(screen.getByText("editor")).toBeInTheDocument();
  });
});
