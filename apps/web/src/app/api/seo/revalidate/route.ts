import { timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";

/**
 * POST /api/seo/revalidate — API'nin yayın anı tazeleme kancası (SEO Parça 5).
 *
 * Gövde `{ paths: string[], tags: string[] }`; `x-seo-secret` başlığı
 * `SEO_REVALIDATE_SECRET` env'iyle ZAMAN-SABİT karşılaştırılır. Sır yoksa uç
 * KAPALI (404 — varlığı bile söylenmez). Yol ve etiketler dar süzgeçten
 * geçer: yalnız `/` ile başlayan, sorgu/hash taşımayan, 200 karakteri
 * aşmayan yollar; etiketler `seo:`/`product:`/`company:`/`listing:` önekli.
 *
 * Kötüye kullanım yüzeyi: sır bilinmeden çağrı 404; sır bilinse bile
 * yapılabilecek tek şey önbelleği daha sık tazeletmek (veri yazılmaz).
 */
export const dynamic = "force-dynamic";

const MAX_ITEMS = 500;
const PATH_RE = /^\/[A-Za-z0-9\-._~/%]*$/;
const TAG_RE = /^(seo|product|company|listing):[A-Za-z0-9\-._~/]+$/;

function secretOk(req: Request): boolean {
  const expected = process.env.SEO_REVALIDATE_SECRET;
  const given = req.headers.get("x-seo-secret");
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<Response> {
  if (!process.env.SEO_REVALIDATE_SECRET) return new Response("Not found", { status: 404 });
  if (!secretOk(req)) return new Response("Forbidden", { status: 403 });

  let body: { paths?: unknown; tags?: unknown };
  try {
    body = (await req.json()) as { paths?: unknown; tags?: unknown };
  } catch {
    return Response.json({ error: "Geçersiz gövde" }, { status: 400 });
  }
  const paths = (Array.isArray(body.paths) ? body.paths : [])
    .filter((p): p is string => typeof p === "string" && p.length <= 200 && PATH_RE.test(p))
    .slice(0, MAX_ITEMS);
  const tags = (Array.isArray(body.tags) ? body.tags : [])
    .filter((t): t is string => typeof t === "string" && t.length <= 200 && TAG_RE.test(t))
    .slice(0, MAX_ITEMS);

  for (const t of tags) revalidateTag(t);
  for (const p of paths) revalidatePath(p);

  return Response.json({ ok: true, paths: paths.length, tags: tags.length });
}
