// @vitest-environment jsdom
import type {
  CompanyOrderDetail,
  CompanyOrderStatus,
} from "@/hooks/use-company-orders";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * İptal talebi paneli — "İptal Talebini Geri Çek" eyleminin görünürlüğü.
 * Kullanıcı kararı 2026-10-07: satıcı, alıcı talebi reddedip sipariş ihtilafa
 * döndükten SONRA da talebini geri çekebilir; ihtilaf biter, sipariş devam eder.
 * API aynası: `CompanyOrdersService.withdrawCancelRequest`.
 */
const h = vi.hoisted(() => ({
  withdraw: vi.fn(async () => ({ ok: true })),
  decision: vi.fn(async () => ({ ok: true })),
  user: { roles: ["SATIN_ALMACI", "SATISCI"] } as Record<string, unknown>,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: h.user }),
}));
vi.mock("@/hooks/use-company-orders", () => ({
  useWithdrawCancelRequest: () => ({
    mutateAsync: h.withdraw,
    isPending: false,
  }),
  useCancelRequestDecision: () => ({
    mutateAsync: h.decision,
    isPending: false,
  }),
}));

import { OrderCancelRequestPanel } from "../order-cancel-request-panel";

const WITHDRAW = "İptal Talebini Geri Çek";
const REQUESTED_AT = "2026-10-01T09:00:00.000+03:00";

function order(
  status: CompanyOrderStatus,
  role: "buyer" | "seller",
  over: Partial<CompanyOrderDetail> = {},
): CompanyOrderDetail {
  return {
    id: "o1",
    number: "ORD-2026-0001",
    currency: "TRY",
    status,
    role,
    paymentTotals: { confirmed: "0", pending: "0", remaining: "1000" },
    cancelRequestedAt: REQUESTED_AT,
    cancelRequestReason: "Stok tükendi, gönderemiyoruz.",
    defectNotifiedAt: null,
    ...over,
  } as CompanyOrderDetail;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { roles: ["SATIN_ALMACI", "SATISCI"] };
});

describe("OrderCancelRequestPanel — ihtilafta geri çekme", () => {
  it("satıcı, iptal talebi reddedilmiş (ihtilaflı) siparişte geri çekme düğmesini görür", () => {
    render(<OrderCancelRequestPanel order={order("DISPUTED", "seller")} />);
    expect(screen.getByRole("button", { name: WITHDRAW })).toBeEnabled();
    // Panel üç çıkışı da anlatır: sevk, geri çekme, alıcının onayı.
    expect(
      screen.getByText(/ya da iptal talebini geri çekebilir \(sipariş devam eder\)/),
    ).toBeInTheDocument();
  });

  it("düğme onay penceresi açar: metin siparişin DEVAM EDECEĞİNİ söyler; onaydan önce istek gitmez", async () => {
    const user = userEvent.setup();
    render(<OrderCancelRequestPanel order={order("DISPUTED", "seller")} />);

    await user.click(screen.getByRole("button", { name: WITHDRAW }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        /ihtilaf sona erecek\. Sipariş onaylanmış durumuna döner ve devam eder/,
      ),
    ).toBeInTheDocument();
    expect(h.withdraw).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", {
        name: "Geri çek, sipariş devam etsin",
      }),
    );
    await waitFor(() => expect(h.withdraw).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith(
      "İptal talebi geri çekildi — ihtilaf sona erdi, sipariş devam ediyor",
    );
  });

  it("onay penceresinde Vazgeç istek atmaz", async () => {
    const user = userEvent.setup();
    render(<OrderCancelRequestPanel order={order("DISPUTED", "seller")} />);
    await user.click(screen.getByRole("button", { name: WITHDRAW }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Vazgeç" }));
    expect(h.withdraw).not.toHaveBeenCalled();
  });

  it("alıcı ihtilaflı siparişte geri çekme düğmesini GÖRMEZ (kendi çıkışı: İptali Onayla)", () => {
    render(<OrderCancelRequestPanel order={order("DISPUTED", "buyer")} />);
    expect(screen.queryByRole("button", { name: WITHDRAW })).toBeNull();
    expect(
      screen.getByRole("button", { name: "İptali Onayla" }),
    ).toBeInTheDocument();
  });

  it("satış siparişi izni olmayan satıcı üyesi düğmeyi görmez (salt okunur panel)", () => {
    h.user = { roles: [], permissions: ["sell:view"] };
    render(<OrderCancelRequestPanel order={order("DISPUTED", "seller")} />);
    expect(screen.getByText("Sipariş ihtilaflı")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: WITHDRAW })).toBeNull();
  });

  it("ayıp ihbarından doğan ihtilafta panel hiç çizilmez (o ihtilafın sahibi alıcı)", () => {
    const { container } = render(
      <OrderCancelRequestPanel
        order={order("DISPUTED", "seller", {
          defectNotifiedAt: "2026-10-03T09:00:00.000+03:00",
        })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("açık iptal talebi kaydı olmayan ihtilafta geri çekilecek talep yoktur → düğme yok", () => {
    render(
      <OrderCancelRequestPanel
        order={order("DISPUTED", "seller", {
          cancelRequestedAt: null,
          cancelRequestReason: null,
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: WITHDRAW })).toBeNull();
  });

  it("açık talepte (onaylanmış sipariş) geri çekme eskisi gibi tek tık — onay penceresi açılmaz", async () => {
    const user = userEvent.setup();
    render(<OrderCancelRequestPanel order={order("ACCEPTED", "seller")} />);
    await user.click(screen.getByRole("button", { name: WITHDRAW }));
    await waitFor(() => expect(h.withdraw).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(toast.success).toHaveBeenCalledWith("İptal talebi geri çekildi");
  });

  it("geri çekilince dönen sipariş (onaylanmış, talep temiz) panelsiz çizilir", () => {
    const { container } = render(
      <OrderCancelRequestPanel
        order={order("ACCEPTED", "seller", {
          cancelRequestedAt: null,
          cancelRequestReason: null,
        })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
