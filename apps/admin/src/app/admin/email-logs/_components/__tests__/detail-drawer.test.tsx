// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  resendResult: { success: true, emailLogId: "new1", sent: true } as {
    success: boolean;
    emailLogId: string;
    sent?: boolean;
  },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-email-logs", () => ({
  useEmailLogDetail: () => ({
    isLoading: false,
    isError: false,
    data: {
      id: "log1",
      template: "notification",
      toEmail: "alici@firma.com",
      toName: null,
      subject: "Konu",
      provider: "resend",
      providerMessageId: null,
      status: "FAILED",
      errorMessage: null,
      payload: {},
      attemptCount: 1,
      queuedAt: "2026-09-29T08:00:00.000Z",
      sentAt: null,
      failedAt: null,
      deliveredAt: null,
      openedAt: null,
      clickedAt: null,
      bouncedAt: null,
      bounceType: null,
      bounceReason: null,
      complainedAt: null,
      contextType: "listing_category_match",
      contextId: "l1",
      events: [],
    },
  }),
  useResendEmail: () => ({
    isPending: false,
    mutate: (_id: string, opts: { onSuccess?: (r: unknown) => void }) =>
      opts.onSuccess?.(h.resendResult),
  }),
}));

import { DetailDrawer } from "../detail-drawer";

async function resend() {
  const uev = userEvent.setup();
  render(<DetailDrawer id="log1" onClose={() => {}} />);
  await uev.click(await screen.findByRole("button", { name: "Yeniden Gönder" }));
  await uev.click(screen.getByRole("button", { name: "Evet, Gönder" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DetailDrawer — yeniden gönderim sonucu (derin denetim MU-05)", () => {
  it("gerçekten gittiyse başarı bildirimi", async () => {
    h.resendResult = { success: true, emailLogId: "new1", sent: true };
    await resend();
    expect(h.toast.success).toHaveBeenCalledWith("E-posta yeniden gönderildi");
    expect(h.toast.warning).not.toHaveBeenCalled();
  });

  it("alıcı çıkmış/adres bastırılmışsa (sent:false) başarı DEMEZ, uyarır", async () => {
    h.resendResult = { success: true, emailLogId: "new1", sent: false };
    await resend();
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.toast.warning).toHaveBeenCalledWith(expect.stringMatching(/^Gönderilmedi/));
  });
});
