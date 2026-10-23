/**
 * GÖRSEL KIRPMA — saf hesap + tuval çıktısı (2026-09-15, kullanıcı: "eklerken
 * önden görsün, nereye odaklanacağını ayarlayabilsin").
 *
 * Model: sabit oranlı bir ÇERÇEVE (görünüm alanı, `frameW × frameH` piksel)
 * ve arkasında kaydırılıp büyütülen görsel. Görsel çerçeveyi HER ZAMAN
 * doldurur ("cover") — boş kenar kalamaz, kullanıcı yalnız hangi bölgenin
 * görüneceğini seçer. Çerçevede ne görünüyorsa dosyaya o yazılır; önizleme ile
 * yüklenen görsel arasında fark oluşamaz.
 *
 * Çıktı tuvalden WebP olarak yeniden kodlanır → EXIF (GPS, cihaz) düşer; bu,
 * `image-resize.ts`deki fail-closed gizlilik kuralının aynısıdır.
 */

export interface CropState {
  /** Kullanıcı yakınlaştırması: 1 = çerçeveyi tam dolduran en küçük ölçek. */
  zoom: number;
  /** Görselin sol üst köşesinin çerçeveye göre konumu (px, ≤ 0). */
  x: number;
  y: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** Çerçeveyi dolduran taban ölçek (görsel pikseli → ekran pikseli). */
export function baseScale(imgW: number, imgH: number, frameW: number, frameH: number): number {
  return Math.max(frameW / imgW, frameH / imgH);
}

/** Konumu, görsel çerçevenin dışına boşluk bırakmayacak şekilde sınırlar. */
export function clampOffset(
  state: CropState,
  imgW: number,
  imgH: number,
  frameW: number,
  frameH: number,
): CropState {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.zoom));
  const scale = baseScale(imgW, imgH, frameW, frameH) * zoom;
  const dw = imgW * scale;
  const dh = imgH * scale;
  const x = Math.min(0, Math.max(frameW - dw, state.x));
  const y = Math.min(0, Math.max(frameH - dh, state.y));
  return { zoom, x, y };
}

/** Başlangıç: görsel ortalanmış, çerçeveyi tam dolduruyor. */
export function centeredCrop(imgW: number, imgH: number, frameW: number, frameH: number): CropState {
  const scale = baseScale(imgW, imgH, frameW, frameH);
  return clampOffset(
    { zoom: 1, x: (frameW - imgW * scale) / 2, y: (frameH - imgH * scale) / 2 },
    imgW,
    imgH,
    frameW,
    frameH,
  );
}

/** Yakınlaştırmayı ÇERÇEVE MERKEZİ sabit kalacak şekilde değiştirir. */
export function zoomAroundCenter(
  state: CropState,
  nextZoom: number,
  imgW: number,
  imgH: number,
  frameW: number,
  frameH: number,
): CropState {
  const base = baseScale(imgW, imgH, frameW, frameH);
  const oldScale = base * state.zoom;
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  const newScale = base * zoom;
  // Çerçeve merkezinin görsel koordinatı yakınlaştırmadan önce ve sonra aynı.
  const cx = (frameW / 2 - state.x) / oldScale;
  const cy = (frameH / 2 - state.y) / oldScale;
  return clampOffset(
    { zoom, x: frameW / 2 - cx * newScale, y: frameH / 2 - cy * newScale },
    imgW,
    imgH,
    frameW,
    frameH,
  );
}

/** Çerçevede görünen bölgenin GÖRSEL pikseli cinsinden dikdörtgeni. */
export function cropRect(
  state: CropState,
  imgW: number,
  imgH: number,
  frameW: number,
  frameH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const s = clampOffset(state, imgW, imgH, frameW, frameH);
  const scale = baseScale(imgW, imgH, frameW, frameH) * s.zoom;
  const sw = Math.min(imgW, frameW / scale);
  const sh = Math.min(imgH, frameH / scale);
  const sx = Math.min(imgW - sw, Math.max(0, -s.x / scale));
  const sy = Math.min(imgH - sh, Math.max(0, -s.y / scale));
  return { sx, sy, sw, sh };
}

/**
 * Çıktı boyutu: hedef en-boy oranında, uzun kenar `maxEdge`i ve kırpılan
 * bölgenin kendi çözünürlüğünü aşmaz (küçük görsel büyütülüp bulanıklaşmaz).
 */
export function outputSize(
  rect: { sw: number; sh: number },
  aspect: number,
  maxEdge: number,
): { w: number; h: number } {
  const longest = Math.min(maxEdge, Math.round(Math.max(rect.sw, rect.sh)));
  const w = aspect >= 1 ? longest : Math.round(longest * aspect);
  const h = aspect >= 1 ? Math.round(longest / aspect) : longest;
  return { w: Math.max(1, w), h: Math.max(1, h) };
}

/** Kırpılmış bölgeyi WebP dosyasına yazar (meta veri yeniden kodlamada düşer). */
export async function renderCrop(
  image: CanvasImageSource,
  rect: { sx: number; sy: number; sw: number; sh: number },
  size: { w: number; h: number },
  fileName: string,
  quality = 0.88,
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d");
  // Geliştirici mesajı: tek çağıran (ImageCropDialog) hatayı yutar ve kendi
  // çevrilmiş metnini gösterir — bu dize kullanıcıya hiç ulaşmaz.
  if (!ctx) throw new Error("crop: canvas 2d context unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, size.w, size.h);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (!blob || blob.size === 0) throw new Error("crop: canvas.toBlob produced no data");
  const name = fileName.replace(/\.[a-z0-9]+$/i, "") + ".webp";
  return new File([blob], name, { type: "image/webp", lastModified: Date.now() });
}
