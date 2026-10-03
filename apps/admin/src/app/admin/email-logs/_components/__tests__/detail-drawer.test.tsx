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
function baseLog(over: Record<string, unknown> = {}) {
  return {
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
    ...over,
  };
}

const detail = vi.hoisted(() => ({ over: {} as Record<string, unknown> }));

vi.mock("@/hooks/use-email-logs", () => ({
  useEmailLogDetail: () => ({
    isLoading: false,
    isError: false,
    data: baseLog(detail.over),
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
  detail.over = {};
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

describe("DetailDrawer — onay satırı kayda bağlı (derin denetim LU-11)", () => {
  it("A'da açılan onay, çekmece B kaydına geçince taşınmaz", async () => {
    const uev = userEvent.setup();
    const { rerender } = render(<DetailDrawer id="log1" onClose={() => {}} />);
    await uev.click(await screen.findByRole("button", { name: "Yeniden Gönder" }));
    expect(screen.getByRole("button", { name: "Evet, Gönder" })).toBeInTheDocument();

    rerender(<DetailDrawer id={null} onClose={() => {}} />);
    rerender(<DetailDrawer id="log2" onClose={() => {}} />);
    expect(await screen.findByRole("button", { name: "Yeniden Gönder" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Evet, Gönder" })).not.toBeInTheDocument();
  });

  it("X ile kapatınca onay sıfırlanır; aynı kayıt yeniden açılınca ilk adımdan başlar", async () => {
    const uev = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<DetailDrawer id="log1" onClose={onClose} />);
    await uev.click(await screen.findByRole("button", { name: "Yeniden Gönder" }));
    await uev.click(screen.getByRole("button", { name: "Kapat" }));
    expect(onClose).toHaveBeenCalled();

    rerender(<DetailDrawer id={null} onClose={onClose} />);
    rerender(<DetailDrawer id="log1" onClose={onClose} />);
    expect(await screen.findByRole("button", { name: "Yeniden Gönder" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Evet, Gönder" })).not.toBeInTheDocument();
  });
});

describe("DetailDrawer — iç ve gizli kayıtlar (arayüz testi O-078)", () => {
  it("iç engel kaldırma kaydında Yeniden Gönder yok, açıklama var", async () => {
    detail.over = {
      template: "suppression_clear",
      provider: "internal",
      status: "SENT",
      contextType: "suppression_clear",
      contextId: "admin-1",
      subject: "suppression clear (admin)",
    };
    render(<DetailDrawer id="log1" onClose={() => {}} />);
    expect(await screen.findByText(/Sistemin iç kaydı/)).toBeInTheDocument();
    // Ham İngilizce konu başlıkta görünmez; şablon etiketi başlıktır.
    expect(screen.queryByText("suppression clear (admin)")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Engel kaldırma (iç kayıt)" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yeniden Gönder" })).not.toBeInTheDocument();
    expect(screen.queryByText("Önizleme")).not.toBeInTheDocument();
  });

  it("şifre sıfırlama (maskeli içerik) kaydında düğme yok, içerik saklanmaz notu var", async () => {
    detail.over = {
      template: "password_reset",
      contextType: "password_reset",
      payload: { __redacted: "hassas içerik (token/kod) loglanmaz" },
    };
    render(<DetailDrawer id="log1" onClose={() => {}} />);
    expect(await screen.findByText(/yeniden gönderilemez/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yeniden Gönder" })).not.toBeInTheDocument();
    expect(screen.queryByText(/__redacted/)).not.toBeInTheDocument();
  });
});

describe("DetailDrawer — okunur önizleme ve bağlam (arayüz testi D-144 / D-229)", () => {
  it("bildirim içeriği önizlenir; ham JSON katlanır bölümde, geliştirici notu ve ham bağlam kodu yok", async () => {
    detail.over = {
      payload: {
        subject: "Konu",
        heading: "Yeni talep",
        paragraphs: ["Kategorinize uygun bir talep yayınlandı."],
        infoRows: [{ label: "Kapanış", value: "1 Ekim" }],
        ctaLabel: "Talebi Gör",
        ctaUrl: "https://www.rothern.com/talep/1",
      },
    };
    render(<DetailDrawer id="log1" onClose={() => {}} />);
    expect(await screen.findByText("Yeni talep")).toBeInTheDocument();
    expect(screen.getByText("Kategorinize uygun bir talep yayınlandı.")).toBeInTheDocument();
    expect(screen.getByText("Kapanış")).toBeInTheDocument();
    expect(screen.getByText("Talebi Gör")).toBeInTheDocument();
    expect(screen.getByText("Ham veri (JSON)").closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByText(/webhook/)).not.toBeInTheDocument();
    expect(screen.getByText("Kategori eşleşmesi")).toBeInTheDocument();
    expect(screen.queryByText(/listing_category_match:/)).not.toBeInTheDocument();
    expect(screen.getByText("l1")).toHaveClass("break-all");
  });
});
