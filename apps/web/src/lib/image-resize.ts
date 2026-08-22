/**
 * Tarayıcıda görsel küçültme (2026-08-22, profil editörü): telefon fotoğrafı
 * (3-8 MB, 4000px) olduğu gibi yüklenmesin — kenar ≤ maxEdge'e indirilir,
 * WebP'ye çevrilir (kalite 0.85). Küçültme başarısız olursa (SVG, bozuk dosya,
 * canvas yok) ORİJİNAL dosya döner — yükleme hiçbir zaman bu yüzden kırılmaz.
 * Zaten küçük (boyut ve piksel) dosyaya dokunulmaz.
 */
export async function resizeImageFile(
  file: File,
  opts: { maxEdge: number; quality?: number; skipUnderBytes?: number },
): Promise<File> {
  const quality = opts.quality ?? 0.85;
  const skipUnder = opts.skipUnderBytes ?? 300 * 1024;
  if (typeof window === "undefined" || typeof document === "undefined") return file;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await loadBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, opts.maxEdge / Math.max(width, height));
    if (scale === 1 && file.size <= skipUnder) {
      release(bitmap);
      return file;
    }
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      release(bitmap);
      return file;
    }
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
    release(bitmap);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    if (!blob || blob.size === 0) return file;
    // Küçültme büyütmüşse (nadir: zaten sıkı sıkıştırılmış küçük PNG) orijinali kullan.
    if (blob.size >= file.size && scale === 1) return file;
    const name = file.name.replace(/\.[a-z0-9]+$/i, "") + ".webp";
    return new File([blob], name, { type: "image/webp", lastModified: Date.now() });
  } catch {
    return file;
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // EXIF yönelimi: modern tarayıcılar varsayılan "from-image" ile doğru döndürür.
      return await createImageBitmap(file);
    } catch {
      /* aşağıdaki <img> yoluna düş */
    }
  }
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image decode failed"));
    };
    img.src = url;
  });
}

function release(b: ImageBitmap | HTMLImageElement) {
  if ("close" in b && typeof b.close === "function") b.close();
}

/** Tür bazlı varsayılanlar — editör tek yerden okur. */
export const PROFILE_IMAGE_LIMITS = {
  logo: { maxEdge: 512, maxBytes: 2 * 1024 * 1024 },
  cover: { maxEdge: 1600, maxBytes: 5 * 1024 * 1024 },
  gallery: { maxEdge: 1600, maxBytes: 5 * 1024 * 1024 },
} as const;
