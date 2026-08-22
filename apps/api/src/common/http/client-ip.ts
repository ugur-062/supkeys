import { isIP } from "node:net";

/**
 * Gerçek istemci IP'si — TEK KAYNAK (throttle tracker + audit IP + @ClientIp).
 *
 * Denetim 2026-08-23 (Parça 1 #7): `app.set("trust proxy", 1)` tek hop
 * varsayar; prod'da api.rothern.com Render'ın KENDİ Cloudflare ön ucu
 * arkasında (canlı: `server: cloudflare`, `cf-ray`) → X-Forwarded-For
 * "istemci, CF-edge, Render-LB" üç hop → `req.ip` = Cloudflare egress IP'si
 * → hız limiti herkes için ORTAK, audit IP yanlış. Cloudflare gelen her
 * istekte `cf-connecting-ip`'yi gerçek istemciyle ÜZERİNE YAZAR; istemcinin
 * sahte başlığı CF'den geçemez. Bu yüzden prod'da (TRUST_CF_CONNECTING_IP=true)
 * bu başlık tercih edilir; CF olmayan kurulumda (dev/self-host) bayrak kapalı
 * kalır ve `req.ip` kullanılır — sahte başlık kabul edilmez.
 */
export const CF_CONNECTING_IP_HEADER = "cf-connecting-ip";

export function trustCfConnectingIp(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TRUST_CF_CONNECTING_IP === "true";
}

export interface IpRequestLike {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

export function resolveClientIp(
  req: IpRequestLike,
  opts: { trustCf?: boolean } = {},
): string {
  const trustCf = opts.trustCf ?? trustCfConnectingIp();
  if (trustCf) {
    const raw = req.headers?.[CF_CONNECTING_IP_HEADER];
    const v = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (v && isIP(v)) return v;
  }
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}
