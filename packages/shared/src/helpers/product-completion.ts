/**
 * ÜRÜN TAMAMLANMA SKORU + YAYIN KAPISI — TEK KAYNAK (Faz 2).
 *
 * PAYLAŞILAN PAKETTE (2026-09-03): API kayıtta hesaplar ve kapıyı uygular;
 * web formu AYNI kuralları canlı çalıştırır (halka + eksik listesi yazarken
 * güncellenir). Eskiden form sunucunun son kayıttaki anlık görüntüsünü
 * gösteriyordu: yeni üründe %0 halkanın altında "Tüm alanlar dolu" yazıyordu.
 *
 * İki AYRI kavram, bilinçli olarak ayrı:
 *
 *   · `productCompletion` → 0-100 puan + yapılacaklar listesi. ZORLAMAZ,
 *     yönlendirir. Kullanıcıyı zorlamadan veri kalitesini yükselten en ucuz
 *     mekanizma (Europages'in ölçtüğü davranış).
 *   · `productPublishBlockers` → yayımlamayı ENGELLEYEN eksikler. Kısa ve
 *     tartışılmaz bir liste; skorla karıştırılmamalı.
 *
 * Skoru kapı yapmadık: "80 puana ulaşmadan yayımlayamazsın" demek, kullanıcıyı
 * puan toplamak için alanları uydurmaya iter — Europages'in fiyat alanının
 * "1,00 €" ile dolmasının sebebi tam olarak bu tür bir zorlamadır.
 *
 * ── FİYAT PUANI NEDEN CEZASIZ ─────────────────────────────────────────────
 * Üç fiyat modunun ÜÇÜ de tam puan alır — `ON_REQUEST` dahil. Fiyatını açmak
 * istemeyen satıcıyı puanla cezalandırmak, onu sahte bir fiyat girmeye iter
 * ve fiyat süzgecini güvenilmez yapar. Dürüst seçenek bedava olmalı.
 */

export interface ProductLike {
  name: string;
  categoryId: string | null;
  description: string | null;
  images: string[];
  keywords: string[];
  priceMode: "FIXED" | "TIERED" | "ON_REQUEST";
  priceAmount: unknown | null;
  priceTiers: unknown | null;
  moq: unknown | null;
  attributes: Record<string, unknown> | null;
}

/** Yayımlanmış üründe açıklama için asgari uzunluk. */
export const MIN_DESCRIPTION = 100;
/** Başlık için asgari uzunluk. */
export const MIN_NAME = 5;

interface Rule {
  key: string;
  label: string;
  points: number;
  done: (p: ProductLike, ctx: CompletionContext) => boolean;
}

export interface CompletionContext {
  /** Kategori ağacından MİRAS ALINAN zorunlu nitelik anahtarları. */
  requiredAttributeKeys: string[];
}

/** Fiyat modunun kendi zorunlu alanları dolu mu. */
function priceComplete(p: ProductLike): boolean {
  if (p.priceMode === "FIXED") return p.priceAmount != null;
  if (p.priceMode === "TIERED")
    return Array.isArray(p.priceTiers) && p.priceTiers.length > 0;
  return true; // ON_REQUEST — ek alan istemez, tam puan
}

const RULES: Rule[] = [
  {
    key: "name",
    label: "Ürün adı (en az 5 karakter)",
    points: 10,
    done: (p) => p.name.trim().length >= MIN_NAME,
  },
  {
    key: "category",
    label: "Kategori seçimi",
    points: 15,
    done: (p) => !!p.categoryId,
  },
  {
    key: "description",
    label: `Açıklama (en az ${MIN_DESCRIPTION} karakter)`,
    points: 20,
    done: (p) => (p.description ?? "").trim().length >= MIN_DESCRIPTION,
  },
  {
    key: "images",
    label: "En az 1 görsel",
    points: 20,
    done: (p) => p.images.length > 0,
  },
  {
    key: "keywords",
    label: "En az 1 anahtar kelime",
    points: 10,
    done: (p) => p.keywords.length > 0,
  },
  {
    key: "price",
    label: "Fiyat bilgisi (sabit, kademeli veya 'teklif isteyin')",
    points: 10,
    done: priceComplete,
  },
  {
    key: "moq",
    label: "Minimum sipariş miktarı",
    points: 5,
    done: (p) => p.moq != null,
  },
  {
    key: "attributes",
    label: "Kategoriye özel zorunlu nitelikler",
    points: 10,
    // Kategoride zorunlu nitelik TANIMLI DEĞİLSE tam puan: matris henüz o
    // segmente yazılmadı diye kullanıcı puan kaybetmemeli.
    done: (p, ctx) => {
      if (ctx.requiredAttributeKeys.length === 0) return true;
      const a = p.attributes ?? {};
      return ctx.requiredAttributeKeys.every((k) => {
        const v = (a as Record<string, unknown>)[k];
        return Array.isArray(v) ? v.length > 0 : v != null && v !== "";
      });
    },
  },
];

export interface CompletionResult {
  score: number;
  /** Eksik maddeler — formda "puanını artırmak için" listesi. */
  missing: { key: string; label: string; points: number }[];
}

export function productCompletion(
  p: ProductLike,
  ctx: CompletionContext = { requiredAttributeKeys: [] },
): CompletionResult {
  let score = 0;
  const missing: CompletionResult["missing"] = [];
  for (const r of RULES) {
    if (r.done(p, ctx)) score += r.points;
    else missing.push({ key: r.key, label: r.label, points: r.points });
  }
  return { score, missing };
}

/**
 * YAYIN KAPISI — bunlar eksikse ürün vitrine ÇIKAMAZ.
 *
 * Skordan ayrı ve daha dar: ince içerik üretmemek için asgari eşik.
 * Görsel ve açıklama burada çünkü ikisi olmadan sayfa ne ziyaretçiye ne
 * arama motoruna bir şey söyler — yayımlamak alan adına zarar verir.
 *
 * Fiyat ve nitelikler kapıda YOK: ikisi de meşru biçimde bilinmeyebilir.
 */
export function productPublishBlockers(p: ProductLike): string[] {
  const out: string[] = [];
  if (p.name.trim().length < MIN_NAME)
    out.push(`Ürün adı en az ${MIN_NAME} karakter olmalı`);
  if (!p.categoryId) out.push("Kategori seçilmeli");
  if ((p.description ?? "").trim().length < MIN_DESCRIPTION)
    out.push(`Açıklama en az ${MIN_DESCRIPTION} karakter olmalı`);
  if (p.images.length === 0) out.push("En az 1 görsel eklenmeli");
  if (p.keywords.length === 0) out.push("En az 1 anahtar kelime eklenmeli");
  if (!priceComplete(p))
    out.push("Seçilen fiyat modunun alanları doldurulmalı");
  return out;
}
