// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

const h = vi.hoisted(() => ({ post: vi.fn(), logout: vi.fn() }));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { post: h.post } }));
vi.mock("@/hooks/use-company-auth", () => ({ useCompanyLogout: () => h.logout }));

import { TermsAcceptanceGate } from "../terms-acceptance-gate";

function setUser(needsTermsAcceptance?: boolean) {
  useCompanyAuthStore.setState({
    user: { id: "u1", needsTermsAcceptance } as never,
    company: { id: "c1" } as never,
  } as never);
}

function renderGate() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TermsAcceptanceGate />
    </QueryClientProvider>,
  );
}

describe("TermsAcceptanceGate (derin denetim MU-04)", () => {
  beforeEach(() => {
    h.post.mockReset();
    h.logout.mockReset();
  });

  it("onayı olan kullanıcıda hiçbir şey çizmez", () => {
    setUser(false);
    renderGate();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("eski anlık görüntüde alan yoksa çizmez", () => {
    setUser(undefined);
    renderGate();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("onay izi yoksa kapı açılır; üç zorunlu onay olmadan gönderilemez, onayla kapanır", async () => {
    setUser(true);
    h.post.mockResolvedValue({
      data: {
        user: { id: "u1", needsTermsAcceptance: false },
        company: { id: "c1" },
        selfUpgradeEnabled: false,
      },
    });
    const uev = userEvent.setup();
    renderGate();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Sözleşmeleri onaylayın");
    const submit = screen.getByRole("button", { name: "Onayla ve devam et" });
    expect(submit).toBeDisabled();

    const boxes = screen.getAllByRole("checkbox");
    // İlk üç satır zorunlu onaylar (kullanıcı · aracılık · KVKK).
    await uev.click(boxes[0]);
    await uev.click(boxes[1]);
    expect(submit).toBeDisabled();
    await uev.click(boxes[2]);
    expect(submit).toBeEnabled();
    await uev.click(submit);

    expect(h.post).toHaveBeenCalledWith("/company-auth/accept-terms", {
      termsAccepted: true,
      mediationAccepted: true,
      kvkkAccepted: true,
      marketingConsent: false,
      profileImprovementConsent: false,
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(useCompanyAuthStore.getState().user?.needsTermsAcceptance).toBe(false);
  });

  it("Çıkış yap oturumu kapatır", async () => {
    setUser(true);
    const uev = userEvent.setup();
    renderGate();
    await uev.click(await screen.findByRole("button", { name: "Çıkış yap" }));
    expect(h.logout).toHaveBeenCalled();
  });
});
