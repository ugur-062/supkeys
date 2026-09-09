/**
 * /indexnow/<key>.txt — IndexNow anahtar dosyası (SEO Parça 5).
 *
 * IndexNow, bildirimi yapanın alan adının sahibi olduğunu bu dosyayla
 * doğrular: `keyLocation` adresindeki dosya anahtarın kendisini içermeli.
 * Dosya `public/`e statik konmadı: anahtar env'de (`INDEXNOW_KEY`, API ile
 * AYNI değer) ve rotasyonu deploy'suz. Yanlış anahtar → 404.
 *
 * `force-dynamic` YOK (public-routes değişmezi): dinamik segment + params
 * okuması zaten istek anında çalıştırır; env'i her istekte okur.
 */

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }): Promise<Response> {
  const { key } = await ctx.params;
  const expected = process.env.INDEXNOW_KEY;
  if (!expected || key !== `${expected}.txt`) return new Response("Not found", { status: 404 });
  return new Response(expected, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
