"use client";

import { LiveToasts } from "@/components/company-shell/live-toasts";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import {
  connectRealtime,
  disconnectRealtime,
} from "@/lib/realtime";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/**
 * WS sinyali → TanStack Query invalidation köprüsü. Sinyaller veri taşımaz;
 * ilgili sorgular geçersiz kılınır ve veri yetkili REST'ten yeniden çekilir.
 * Poll'lar yedek olarak kalır (WS koparsa deneyim 10-15sn tazeliğe düşer).
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const user = useCompanyAuthStore((s) => s.user);
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) {
      disconnectRealtime();
      return;
    }
    const socket = connectRealtime();

    // cancelRefetch:false ŞART: aynı kayda saniyeler içinde birden çok sinyal
    // gelebiliyor (ör. yeni tur: commit ping'i + duyuru ping'i). Varsayılan
    // davranış uçuştaki çekimi İPTAL edip baştan başlatır — yavaş bağlantıda
    // sinyal fırtınası hiçbir cevabın uygulanmamasına (bayat arayüzün
    // saniyelerce kalmasına) yol açar. Süren çekim bitirilir, sonucu uygulanır.
    const keep = { cancelRefetch: false } as const;
    const onListing = (p: { listingId?: string }) => {
      if (p?.listingId) {
        qc.invalidateQueries(
          { queryKey: ["company-listings", "detail", p.listingId] },
          keep,
        );
        qc.invalidateQueries({ queryKey: ["bid-documents", p.listingId] }, keep);
      }
      // Listeler: sahip sayaçları + teklifçi durumları.
      qc.invalidateQueries({ queryKey: ["company-tenders"] }, keep);
      qc.invalidateQueries({ queryKey: ["company-my-bids"] }, keep);
      qc.invalidateQueries(
        { queryKey: ["company-listings", "seller-tenders"] },
        keep,
      );
    };
    const onOrder = (p: { orderId?: string }) => {
      if (p?.orderId) {
        qc.invalidateQueries({
          queryKey: ["company-orders", "detail", p.orderId],
        });
      }
      qc.invalidateQueries({ queryKey: ["company-orders", "list"] });
    };
    const onNotification = () => {
      qc.invalidateQueries({ queryKey: ["company-notifications"] });
      // Onay istekleri bildirimle birlikte düşer — bekleyen rozeti de tazelensin.
      qc.invalidateQueries({ queryKey: ["company-approvals"] });
    };
    const onMessage = () => {
      qc.invalidateQueries({ queryKey: ["company-msg-unread"] });
      qc.invalidateQueries({ queryKey: ["company-msg-threads"] });
      qc.invalidateQueries({ queryKey: ["company-msg-thread"] });
    };

    socket.on("listing.updated", onListing);
    socket.on("order.updated", onOrder);
    socket.on("notification.new", onNotification);
    socket.on("message.new", onMessage);
    return () => {
      socket.off("listing.updated", onListing);
      socket.off("order.updated", onOrder);
      socket.off("notification.new", onNotification);
      socket.off("message.new", onMessage);
    };
  }, [user, qc]);

  return (
    <>
      {/* Sinyal → sağ altta canlı popup (bildirim + yeni mesaj). */}
      <LiveToasts />
      {children}
    </>
  );
}
