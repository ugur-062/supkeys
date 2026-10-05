"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  useResendInvitation,
  type InvitationEmailResult,
} from "@/hooks/use-company-users";
import { extractErrorMessage } from "@/lib/tenders/error";

/**
 * Ekip daveti e-postasının GERÇEK sonucunu bildirir (2026-09-27). Eskiden
 * davet diyaloğu her durumda "gönderildi (7 gün)" diyordu; suppress edilmiş
 * adreste ya da sağlayıcı hatasında e-posta hiç gitmiyordu. Başarısızlıkta
 * uyarı + "Yeniden gönder" eylemi (suppress'te eylem yok: aynı adrese
 * yeniden göndermek yine gitmez — farklı adres gerekir).
 */
export function useInviteDeliveryToast() {
  const t = useTranslations("web.panel.settings.inviteDelivery");
  const resend = useResendInvitation();

  const report = (
    res: InvitationEmailResult | undefined,
    ctx: { id: string; email: string; successMessage: string },
  ) => {
    if (res?.emailSent !== false) {
      toast.success(ctx.successMessage);
      return;
    }
    // Kalıcı nedenler — yeniden gönder eylemi yok, farklı adres gerekir.
    if (res.emailFailureReason === "suppressed" || res.emailFailureReason === "undeliverable") {
      toast.warning(t(res.emailFailureReason, { email: ctx.email }), { duration: 12_000 });
      return;
    }
    toast.warning(t("failed", { email: ctx.email }), {
      duration: 12_000,
      action: {
        label: t("resend"),
        onClick: () => {
          resend
            .mutateAsync(ctx.id)
            .then((r) => report(r, { ...ctx, successMessage: t("resent") }))
            .catch((err: unknown) => toast.error(extractErrorMessage(err, t("resendFailed"))));
        },
      },
    });
  };
  return report;
}
