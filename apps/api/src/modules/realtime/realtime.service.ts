import { Injectable, Logger } from "@nestjs/common";
import type { Server } from "socket.io";

/**
 * Gerçek-zamanlı "değişti" sinyalleri. WS üzerinden VERİ TAŞINMAZ — yalnızca
 * hangi kaydın bayatladığı duyurulur; istemci veriyi her zaman YETKİLİ REST
 * çağrısıyla yeniden çeker (kapalı zarf/maskeleme kuralları delinemez).
 *
 * Odalar:
 *  - company:{companyId} — bağlanan her kullanıcı otomatik katılır
 *  - listing:{listingId} — ilan detayı açıkken istemci abone olur
 *  - order:{orderId}     — sipariş detayı açıkken istemci abone olur
 *
 * Server gateway tarafından bağlanır; bağlı değilken (testler, cron) no-op.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  attach(server: Server): void {
    this.server = server;
  }

  /**
   * Çıkış yapılan oturumun AÇIK soketlerini kapat (H2). Handshake kapısı yeni
   * bağlantıyı zaten reddeder; bu, çıkış ANINDA açık olan soket jeton ömrü
   * dolana dek dinlemeyi sürdürmesin diye. Yalnız BU örnekteki soketler
   * (Redis adaptörü yok) — öteki örnektekiler exp zamanlayıcısıyla düşer ve
   * yeniden bağlanamaz. Sunucu bağlı değilken (test, cron) no-op.
   */
  disconnectSession(sessionId: string): number {
    if (!this.server || !sessionId) return 0;
    let closed = 0;
    try {
      for (const socket of this.server.sockets.sockets.values()) {
        if (socket.data?.sessionId === sessionId) {
          socket.disconnect(true);
          closed += 1;
        }
      }
    } catch (err) {
      this.logger.warn(`Oturum soketleri kapatılamadı: ${String(err)}`);
    }
    return closed;
  }

  /** İlan değişti: ilan odası + ilgili firma odalarına ping.
   *  Odalar TEK emit'te birleşir — iki odada birden olan istemci sinyali
   *  bir kez alır (Socket.IO oda birleşimi dedup yapar). */
  pingListing(listingId: string, companyIds: string[] = []): void {
    this.emitToRooms(
      [
        `listing:${listingId}`,
        ...[...new Set(companyIds)].map((c) => `company:${c}`),
      ],
      "listing.updated",
      { listingId },
    );
  }

  /** Sipariş değişti: sipariş odası + iki taraf firma odasına ping. */
  pingOrder(orderId: string, companyIds: string[] = []): void {
    this.emitToRooms(
      [
        `order:${orderId}`,
        ...[...new Set(companyIds)].map((c) => `company:${c}`),
      ],
      "order.updated",
      { orderId },
    );
  }

  /** Yeni uygulama-içi bildirim (zil anında güncellensin). */
  pingNotification(companyId: string): void {
    this.emit(`company:${companyId}`, "notification.new", {});
  }

  /** Yeni mesaj — ALICI firmanın kutusu/rozeti anında güncellensin. */
  pingMessage(recipientCompanyId: string): void {
    this.emit(`company:${recipientCompanyId}`, "message.new", {});
  }

  private emit(room: string, event: string, payload: unknown): void {
    this.emitToRooms([room], event, payload);
  }

  private emitToRooms(rooms: string[], event: string, payload: unknown): void {
    if (!this.server) return; // test/cron bağlamı — sessiz no-op
    try {
      this.server.to(rooms).emit(event, payload);
    } catch (err) {
      // Sinyal kaybı kritik değil (poll yedek) ama sessiz kalmasın.
      this.logger.warn(
        `WS emit başarısız (${rooms.join(",")}/${event}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
