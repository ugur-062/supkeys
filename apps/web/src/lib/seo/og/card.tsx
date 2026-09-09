import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { optimizable } from "@/lib/public/image-host";
import { resolveSiteUrl } from "@/lib/site-url";
import type { OgContent } from "./content";

/**
 * OG KARTI ÇİZİMİ — 1200×630, `next/og` (Satori) (SEO Parça 6).
 *
 * Monokrom (herkese açık yüzey kuralı): beyaz zemin, siyah tipografi, ince
 * çerçeve; markanın "S" kutusu tek vurgu. Sağ panel varsa gerçek görsel
 * (ürün fotoğrafı / firma kapağı), yoksa tipografik kart.
 *
 * Fontlar dosyadan (Inter latin-ext, OFL): Satori sistem fontu okuyamaz ve
 * varsayılan fontu Türkçe "ğ/ş/ı"yı taşımayabilir. `new URL(…, import.meta.url)`
 * Next'in izlediği kalıp — dosya sunucusuz pakete girer.
 *
 * GÖRSEL: WebP yüklenmiş olabilir ve Satori WebP çözemez. Görsel önce
 * Next'in optimize edicisinden (`/_next/image`) JPEG olarak çekilir ve
 * data URI ile gömülür; çekilemezse kart görselsiz çizilir (kırık kart
 * yerine tipografik kart).
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

let fontCache: Promise<{ regular: Buffer; bold: Buffer }> | null = null;

/**
 * Dosyadan okunur (Node çalışma zamanı). `fetch(new URL(…, import.meta.url))`
 * kalıbı yalnız edge'de çalışır — Node'da `/_next/static/media/…` göreli
 * adresi üretip "Invalid URL" verdi (build 2026-09-09). `process.cwd()` +
 * sabit yol Next'in dosya izleyicisinin tanıdığı biçim; `next.config.ts`
 * `outputFileTracingIncludes` fontları sunucusuz pakete ayrıca ekler.
 */
function loadFonts() {
  if (!fontCache) {
    const dir = path.join(process.cwd(), "src/lib/seo/og/fonts");
    fontCache = Promise.all([
      readFile(path.join(dir, "Inter-Regular.ttf")),
      readFile(path.join(dir, "Inter-Bold.ttf")),
    ]).then(([regular, bold]) => ({ regular, bold }));
  }
  return fontCache;
}

/** Görseli JPEG/PNG data URI'ye indirger; olmazsa null (fail-open). */
async function embedImage(src: string | null): Promise<string | null> {
  if (!src) return null;
  const site = resolveSiteUrl();
  // Optimize edici yalnız `remotePatterns`taki host'u kabul eder; dış host'ta
  // ham adres denenir (JPEG/PNG ise Satori okur).
  const url = optimizable(src) || src.startsWith("/")
    ? `${site}/_next/image?url=${encodeURIComponent(src)}&w=640&q=80`
    : src;
  try {
    // Accept başlığı bilinçli YOK: optimize edici WebP/AVIF sunmaz, JPEG döner.
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!/^image\/(jpeg|png|gif)/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4_000_000) return null;
    return `data:${type.split(";")[0]};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function renderOgCard(content: OgContent): Promise<ImageResponse> {
  const [fonts, image] = await Promise.all([loadFonts(), embedImage(content.image)]);
  const withImage = !!image;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#ffffff",
          color: "#09090b",
          fontFamily: "Inter",
          padding: 56,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: withImage ? 640 : 1088,
            paddingRight: withImage ? 40 : 0,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: "#09090b",
                  color: "#ffffff",
                  fontSize: 26,
                  fontWeight: 700,
                }}
              >
                R
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>Rothern</div>
              {content.badge ? (
                <div
                  style={{
                    marginLeft: 12,
                    fontSize: 18,
                    padding: "6px 12px",
                    border: "1.5px solid #09090b",
                    borderRadius: 999,
                  }}
                >
                  {content.badge}
                </div>
              ) : null}
            </div>
            <div style={{ marginTop: 44, fontSize: 20, letterSpacing: 2, color: "#52525b" }}>{content.eyebrow}</div>
            <div
              style={{
                marginTop: 12,
                fontSize: content.title.length > 60 ? 44 : 56,
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: -1,
              }}
            >
              {content.title}
            </div>
            {content.subtitle ? (
              <div style={{ marginTop: 16, fontSize: 26, color: "#3f3f46" }}>{content.subtitle}</div>
            ) : null}
          </div>
          {content.facts.length ? (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {content.facts.slice(0, 3).map((f) => (
                <div
                  key={f}
                  style={{
                    fontSize: 22,
                    padding: "10px 16px",
                    background: "#f4f4f5",
                    borderRadius: 10,
                    color: "#18181b",
                  }}
                >
                  {f}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 22, color: "#71717a" }}>www.rothern.com</div>
          )}
        </div>
        {withImage ? (
          <div
            style={{
              display: "flex",
              width: 448,
              height: 518,
              borderRadius: 20,
              border: "1.5px solid #e4e4e7",
              overflow: "hidden",
              background: "#fafafa",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        ) : null}
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Inter", data: fonts.regular, weight: 400, style: "normal" },
        { name: "Inter", data: fonts.bold, weight: 700, style: "normal" },
      ],
    },
  );
}
