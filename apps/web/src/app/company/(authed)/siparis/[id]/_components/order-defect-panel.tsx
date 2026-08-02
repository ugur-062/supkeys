"use client";

import { Button } from "@/components/catalyst/button";
import {
  useWithdrawDefectNotice,
  type CompanyOrderDetail,
} from "@/hooks/use-company-orders";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { canActOnOrder } from "@/lib/orders/can-act-on-order";
import { extractErrorMessage } from "@/lib/tenders/error";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

/**
 * TTK 23 — ayıp ihbarı DISPUTED paneli. Alıcı teslimden sonra 8 gün içinde ayıp
 * ihbar edince sipariş DISPUTED olur (A1'den farklı: defectNotifiedAt dolu).
 * Platform icra etmez/hakem değildir — ihbarı kaydeder; çözüm (dönme/indirim/
 * onarım/değişim) taraflar arasında. Alıcı ihbarı geri çekebilir → önceki durum.
 */
export function OrderDefectPanel({ order }: { order: CompanyOrderDetail }) {
  const isSeller = order.role === "seller";
  // F7: geri-çekme tarafın işlem rolünü ister (assertOrderRole aynası).
  const { user } = useCompanyAuth();
  const canAct = canActOnOrder(order.role, user?.roles);
  const active = order.status === "DISPUTED" && !!order.defectNotifiedAt;
  const withdraw = useWithdrawDefectNotice(order.id);

  if (!active) return null;

  const notifiedAt = order.defectNotifiedAt
    ? format(new Date(order.defectNotifiedAt), "dd MMM yyyy", { locale: tr })
    : null;

  const doWithdraw = async () => {
    try {
      await withdraw.mutateAsync();
      toast.success("Ayıp ihbarı geri çekildi — sipariş önceki durumuna döndü");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Geri çekilemedi"));
    }
  };

  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-zinc-900">
            Ayıp ihbarı — sipariş ihtilaflı (TTK 23)
          </h2>
          {order.defectReason ? (
            <p className="mt-1 text-sm text-zinc-700">
              <span className="font-medium">İhbar gerekçesi:</span>{" "}
              {order.defectReason}
              {notifiedAt ? (
                <span className="text-zinc-500"> · {notifiedAt}</span>
              ) : null}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-zinc-500">
            {isSeller
              ? "Alıcı teslim aldığı malda ayıp ihbar etti. Çözüm (onarım, değişim, bedel indirimi, iade/dönme) taraflar arasındadır — platform hakem değildir, ihbarı kaydeder."
              : "İhbarınız kaydedildi (uyuşmazlıkta delil). Çözüm satıcıyla aranızdadır. Sorun çözülürse ihbarı geri çekebilirsiniz."}
          </p>
          {canAct && !isSeller ? (
            <div className="mt-3">
              <Button
                plain
                onClick={doWithdraw}
                disabled={withdraw.isPending}
              >
                İhbarı Geri Çek
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
