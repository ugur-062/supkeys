"use client";

import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/format-date";
import { Button } from "@/components/catalyst/button";
import {
  useWithdrawDefectNotice,
  type CompanyOrderDetail,
} from "@/hooks/use-company-orders";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { canActOnOrder } from "@/lib/orders/can-act-on-order";
import { extractErrorMessage } from "@/lib/tenders/error";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

/**
 * TTK 23 — ayıp ihbarı DISPUTED paneli. Alıcı teslimden sonra 8 gün içinde ayıp
 * ihbar edince sipariş DISPUTED olur (A1'den farklı: defectNotifiedAt dolu).
 * Platform icra etmez/hakem değildir — ihbarı kaydeder; çözüm (dönme/indirim/
 * onarım/değişim) taraflar arasında. Alıcı ihbarı geri çekebilir → önceki durum.
 */
export function OrderDefectPanel({ order }: { order: CompanyOrderDetail }) {
  const t = useTranslations("web.panel.trade.orderDefectPanel");
  const isSeller = order.role === "seller";
  // F7: geri-çekme tarafın işlem rolünü ister (assertOrderRole aynası).
  const { user } = useCompanyAuth();
  const canAct = canActOnOrder(order.role, user);
  const active = order.status === "DISPUTED" && !!order.defectNotifiedAt;
  const withdraw = useWithdrawDefectNotice(order.id);

  if (!active) return null;

  const notifiedAt = order.defectNotifiedAt
    ? formatDate(order.defectNotifiedAt, "short")
    : null;

  const doWithdraw = async () => {
    try {
      await withdraw.mutateAsync();
      toast.success(t("ayipIhbariGeriCekildiSiparis"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("geriCekilemedi")));
    }
  };

  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-zinc-900">
            {t("ayipIhbariSiparisIhtilafliTtk")}
          </h2>
          {order.defectReason ? (
            <p className="mt-1 text-sm text-zinc-700">
              <span className="font-medium">{t("ihbarGerekcesi")}</span>{" "}
              {order.defectReason}
              {notifiedAt ? (
                <span className="text-zinc-500"> · {notifiedAt}</span>
              ) : null}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-zinc-500">
            {isSeller
              ? t("aliciTeslimAldigiMaldaAyip")
              : t("ihbarinizKaydedildiUyusmazliktaDelilCozum")}
          </p>
          {canAct && !isSeller ? (
            <div className="mt-3">
              <Button
                plain
                onClick={doWithdraw}
                disabled={withdraw.isPending}
              >
                {t("ihbariGeriCek")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
