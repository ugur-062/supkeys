/**
 * Tarayıcıda görsel küçültme + META VERİ TEMİZLİĞİ (profil editörü).
 *
 * Telefon fotoğrafı (3-8 MB, 4000px) olduğu gibi yüklenmesin — kenar ≤
 * maxEdge'e indirilir ve WebP'ye çevrilir (kalite 0.85).
 *
 * DALGA B-5 (denetim P5) — GİZLİLİK: bu fonksiyonun asıl işlevlerinden biri
 * canvas'tan yeniden kodlayarak EXIF'i (GPS koordinatı, çekim zamanı, cihaz
 * seri no) DÜŞÜRMEK, ama üç kaçış deliği vardı ve hepsi ORİJİNAL dosyayı
 * döndürüyordu:
 *   (a) "zaten küçük" kısayolu — `scale === 1 && size <= 300KB`: küçük çekilmiş
 *       ya da mesajlaşmadan gelmiş bir fotoğraf HİÇ dokunulmadan geçiyordu;
 *   (b) `catch { return file }` — çözümleme hatasında orijinal yükleniyordu;
 *   (c) "yeniden kodlama büyüttü" dalı.
 * Profil görselleri PUBLIC CDN'den servis edildiği için bu, kullanıcının ev/
 * şantiye konumunun herkese açık yayınlanması demekti.
 *
 * Yeni kural FAIL-CLOSED: desteklenen bir görsel türü her zaman canvas'tan
 * geçer; geçemezse dosya YÜKLENMEZ, hata fırlatılır (çağıran zaten toast
 * gösteriyor). "Biraz daha büyük dosya" kabul edilebilir, "sessizce sızan
 * konum" değil.
 */
export class ImageProcessingError extends Error {
  constructor() {
    super(
      "Görsel işlenemedi — konum/EXIF bilgisini temizleyemediğimiz için yüklenmedi. Ekran görüntüsü alıp yeniden deneyin.",
    );
    this.name = "ImageProcessingError";
  }
}

export async function resizeImageFile(
  file: File,
  opts: { maxEdge: number; quality?: number },
): Promise<File> {
  const quality = opts.quality ?? 0.85;
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new ImageProcessingError();
  }
  // Desteklenmeyen tür buraya gelmemeli (çağıran MIME süzüyor); gelirse geçme.
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new ImageProcessingError();
  }
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    throw new ImageProcessingError();
  }
  try {
    const { width, height } = bitmap;
    // scale === 1 olsa bile yeniden kodlanır — meta veri temizliği bu adımda.
    const scale = Math.min(1, opts.maxEdge / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageProcessingError();
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    if (!blob || blob.size === 0) throw new ImageProcessingError();
    const name = file.name.replace(/\.[a-z0-9]+$/i, "") + ".webp";
    return new File([blob], name, { type: "image/webp", lastModified: Date.now() });
  } finally {
    release(bitmap);
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
