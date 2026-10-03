import { getUnit, normalizeUnit } from "@rothern/shared";
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
  /** Kanonik birim kodu (ürün kaydında varsa); yoksa `unit` metninden türetilir. */
  unitCode?: string | null;
  categoryId: string | null;
  keywords: string[];
  /** Ürün sayfasına dönüş için — kullanıcı hangi üründen geldiğini görsün. */
  companyName: string;
}

export function mapProductToForm(seed: ProductSeed): TenderFormData {
  const base = DEFAULT_FORM_VALUES;
  // Birim adı ve KODU birlikte taşınır (arayüz testi O-085): yalnız ad
  // değişip varsayılan `unitCode: 'PCE'` kalınca seçici kodu önceliklendirip
  // "metre"yi "adet" gösteriyor, kayıt {unit:'metre', unitCode:'PCE'} gibi
  // çelişkili yazılıyordu. Tanınmayan birim "listede yok" (kod null) olur.
  const rawUnit = seed.unit?.trim() || "adet";
  const known = getUnit(seed.unitCode) ?? getUnit(normalizeUnit(rawUnit));
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
        unit: known?.nameTr ?? rawUnit.slice(0, 20),
        unitCode: known?.code ?? null,
      },
    ],
  };
}

/**
 * ARAMA TERİMİ → TALEP TOHUMU. Ürün sayfası/dizini "Talep aç" CTA'ları
 * `?q=` ile gelir (ürün adı ya da arama terimi); serbest metin kutusu
 * kalktığından (2026-09-10) okunmuyordu ve form boş açılıyordu (derin
 * denetim S078). Terim ilk kalemin adıdır; miktar/birim alıcının. Başlık
 * TOHUMLANMAZ (LU-30 gözden geçirme): kısa terim ("M6") başlığı doldurup
 * 3 karakter kuralına takılıyor ve kalemlerden türetmeyi engelliyordu —
 * boş başlığı hızlı kart yayında kalemlerden türetir.
 */
export function mapSearchTermToForm(term: string): TenderFormData | null {
  const name = term.trim();
  if (!name) return null;
  const base = DEFAULT_FORM_VALUES;
  return {
    ...base,
    items: [{ ...base.items[0]!, name: name.slice(0, 200) }],
  };
}

/** Wizard'a taşıma anahtarı — AI taslağının anahtarından AYRI. */
export const PRODUCT_SEED_KEY = "tender-product-seed";
