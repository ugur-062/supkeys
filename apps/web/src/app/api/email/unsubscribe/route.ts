import { resolveApiBaseUrl } from "@/lib/resolve-api-url";

/**
 * RFC 8058 TEK TIK ÇIKIŞ UCU (2026-09-27) — e-postanın `List-Unsubscribe`
 * başlığındaki adres. Gmail/Yahoo/Outlook "abonelikten çık" düğmesine
 * basıldığında buraya `POST` atar (gövde `List-Unsubscribe=One-Click`);
 * jeton sorguda. İstek API'ye iletilir. Adres gönderenle aynı alan adında
 * kalsın diye uç web'dedir (API'nin genel adresi e-postaya yazılmaz).
 *
 * `GET` HİÇBİR ŞEY DEĞİŞTİRMEZ: bazı istemciler başlık adresini tarayıcıda
 * açar, kurumsal güvenlik tarayıcıları bağlantıları önceden ziyaret eder →
 * onay sayfasına yönlendirilir, çıkış orada düğmeyle yapılır.
 */
export const dynamic = "force-dynamic";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,2000}$/;

export async function POST(req: Request): Promise<Response> {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (!TOKEN_RE.test(t)) return new Response(null, { status: 400 });
  try {
    const res = await fetch(`${resolveApiBaseUrl()}/public/email/unsubscribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t }),
      cache: "no-store",
    });
    if (res.ok) return new Response(null, { status: 200 });
    return new Response(null, { status: res.status === 400 ? 400 : 502 });
  } catch {
    return new Response(null, { status: 502 });
  }
}

export function GET(req: Request): Response {
  const url = new URL(req.url);
  const t = url.searchParams.get("t") ?? "";
  const target = new URL("/e-posta-tercihleri", url.origin);
  if (TOKEN_RE.test(t)) target.searchParams.set("t", t);
  // Dil jetonun içinde (şifreli) — sayfa API'den okuyup doğru ön eke geçer.
  return Response.redirect(target, 303);
}
