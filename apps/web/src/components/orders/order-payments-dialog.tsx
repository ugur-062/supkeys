"use client";

import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Button } from "@/components/ui/button";
import type { OrderDetail } from "@/lib/tenders/types";
import { OrderPaymentsCard } from "./order-payments-card";

/**
 * Faz 3 madde 16 — Direkt ödeme popup'ı.
 * Alıcı/tedarikçi sipariş detayındaki aksiyon butonundan açılır; ödeme
 * kaydı/onayı/dekontu tek bir modal içinde yönetilir.
 */
export function OrderPaymentsDialog({
  open,
  onClose,
  surface,
  order,
  canAct = true,
}: {
  open: boolean;
  onClose: () => void;
  surface: "tenant" | "supplier";
  order: OrderDetail;
  canAct?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} size="2xl">
      <DialogTitle>Direkt Ödeme</DialogTitle>
      <DialogDescription>
        {order.orderNumber} · nakit/çek ödeme kaydı ve onayı
      </DialogDescription>
      <DialogBody>
        <OrderPaymentsCard
          surface={surface}
          order={order}
          canAct={canAct}
          bare
        />
      </DialogBody>
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>
          Kapat
        </Button>
      </DialogActions>
    </Dialog>
  );
}
