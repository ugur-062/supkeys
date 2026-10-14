// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  auth: {
    user: null as { roles: string[]; permissions?: string[] } | null,
    company: { tier: "GOLD" } as { tier?: string } | undefined,
  },
  synced: true,
  replace: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => h.auth,
  useCompanyPermissionsSynced: () => h.synced,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace }),
  useSearchParams: () => h.params,
}));
vi.mock("@/lib/company/portal-store", () => ({
  usePortalStore: (sel: (s: { lastPortal: null }) => unknown) => sel({ lastPortal: null }),
}));

import ConnectionsEntryPage from "../page";

const SELLER = { roles: ["SATISCI"], permissions: ["sell:view", "connections:manage"] };

beforeEach(() => {
  vi.clearAllMocks();
  h.auth = { user: SELLER, company: { tier: "GOLD" } };
  h.synced = true;
  h.params = new URLSearchParams();
});

describe("/company/baglantilar", () => {
  it("bildirimden gelen satışçıyı kendi portalının Gelen istekler görünümüne götürür", () => {
    h.params = new URLSearchParams("view=incoming");
    render(<ConnectionsEntryPage />);
    expect(h.replace).toHaveBeenCalledWith("/company/satis/musterilerim?view=incoming");
  });

  it("bilinmeyen görünüm taşınmaz", () => {
    h.params = new URLSearchParams("view=blocked");
    render(<ConnectionsEntryPage />);
    expect(h.replace).toHaveBeenCalledWith("/company/satis/musterilerim");
  });

  it("izinler /me ile eşitlenmeden yönlendirmez; eşitlenince bir kez yönlendirir", () => {
    h.synced = false;
    const view = render(<ConnectionsEntryPage />);
    expect(h.replace).not.toHaveBeenCalled();
    h.synced = true;
    view.rerender(<ConnectionsEntryPage />);
    view.rerender(<ConnectionsEntryPage />);
    expect(h.replace).toHaveBeenCalledTimes(1);
  });
});
