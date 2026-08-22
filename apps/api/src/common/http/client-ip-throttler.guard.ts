import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { resolveClientIp, type IpRequestLike } from "./client-ip";

/**
 * ThrottlerGuard — tracker olarak gerçek istemci IP'si (cf-connecting-ip
 * bayrağı açıksa) kullanır; aksi halde varsayılan `req.ip`. Cloudflare
 * arkasında tüm kullanıcıların tek CF IP'sinde toplanıp ortak 429 yemesini
 * (ve per-IP login limitinin anlamsızlaşmasını) kapatır.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    return resolveClientIp(req as IpRequestLike);
  }
}
