import { DEFAULT_FORM_VALUES, type TenderFormData } from "./form-schema";

/**
 * ÜRÜN → SATIN ALMA TALEBİ TOHUMU.
 *
 * Köprünün gerekçesi: bir tedarikçinin vitrinini beğenen alıcı bugün ya tek
 * firmaya bilgi talebi gönderiyor ya da her şeyi sıfırdan yazıp talep açıyor.
 * Ürünü talebin İLK KALEMİ olarak taşımak ikisinin arasını bağlıyor —
 * Europages'te karşılığı yok; RFQ motoru zaten bizde.
 *
 * ── AI TASLAK YOLUNU KULLANMIYORUZ ────────────────────────────────────────
 * `mapAiDraftToForm` + `aiImport` sayfaya "AI doldurdu" bandını ve alan
 * işaretlerini basar. Burada AI yok: veriyi kullanıcının tıkladığı ürün
 * kaydından birebir alıyoruz. O yolu taklit etmek, kullanıcıya yapılmamış bir
 * çıkarımı yapılmış gibi gösterirdi.
 *
 * Taşınan alan azdır ve bilinçlidir: kalem adı/birim, kategori ön-seçimi ve
 * anahtar kelimeler. MİKTAR taşınmaz (ürünün MOQ'su satıcının tabanıdır,
 * alıcının ihtiyacı değil), FİYAT taşınmaz (talepte hedef fiyat alıcının
 * kendi kararı ve satıcının vitrin fiyatını oraya yazmak müzakereyi
 * baştan çıpalardı).
 */
export interface ProductSeed {
  productName: string;
  unit: string;
  categoryId: string | null;
  keywords: string[];
  /** Ürün sayfasına dönüş için — kullanıcı hangi üründen geldiğini görsün. */
  companyName: string;
}

export function mapProductToForm(seed: ProductSeed): TenderFormData {
  const base = DEFAULT_FORM_VALUES;
  return {
    ...base,
    title: seed.productName.slice(0, 120),
    keywords: seed.keywords.slice(0, 10),
    // Kategori ÖN-SEÇİM: talep/ilan kategorisi en az L3 ve discovery
    // kataloğundan olmak zorunda (backend kapısı). Ürünün kodu bu kapıdan
    // geçmeyebilir — o yüzden kullanıcı 2. adımda onaylar/değiştirir.
    categoryIds: seed.categoryId ? [seed.categoryId] : [],
    items: [
      {
        ...base.items[0]!,
        name: seed.productName.slice(0, 200),
        unit: seed.unit || "adet",
      },
    ],
  };
}

/** Wizard'a taşıma anahtarı — AI taslağının anahtarından AYRI. */
export const PRODUCT_SEED_KEY = "tender-product-seed";
