/**
 * TELEFONDA EKRANA SIĞAN FORM PENCERESİ (mobil denetim 2026-10 g11).
 *
 * Catalyst `Dialog` telefonda alttan açılan bir sayfa; uzun formda (yetki
 * tablosu, adres, banka hesabı) sayfa ekrandan uzun oluyordu: Kaydet/Vazgeç
 * ekranın altında kalıyor, gövdenin kendi kaydırması (`max-h-[70vh]`) dış
 * kaydırmayla yarışıyordu — yetki listesinin sonuna dek kaydırmadan düğmeye
 * ulaşılamıyordu. Telefonda panel dinamik görünüm yüksekliğine (`100dvh`;
 * ekran klavyesi açılınca küçülür) sınırlanır ve sütun olur: başlık üstte,
 * eylemler altta SABİT, yalnız gövde kayar. 1.5rem + üst güvenli pay = Dialog
 * kabının telefon üst boşluğu (`pt-[calc(1.5rem+var(--safe-top))]`; ikisi
 * birlikte değişir). `sm` ve üstü değişmez; `dvh` tanımayan tarayıcıda sınır
 * düşer, pencere eskisi gibi dış kapla kayar.
 */
export const SHEET_PANEL =
  "max-sm:flex max-sm:max-h-[calc(100dvh-1.5rem-var(--safe-top))] max-sm:flex-col";

/** Panel ile gövde arasında `<form>` varsa: o da sütun olur ve küçülebilir. */
export const SHEET_FORM = "max-sm:flex max-sm:min-h-0 max-sm:flex-col";

/**
 * Kayan tek alan; kaydırma arkadaki sayfaya taşmaz. Kaydırma kabı içeriği
 * kenarında KIRPAR: dış halka (koltuk seçimi satırının `ring-1/2`si, telefon
 * alanının odak halkası, onay kutusunun odak çizgisi) 4 px'lik iç payla
 * görünür kalır; eksi kenar boşlukları (`-mx-1`, `mt-5` + `p-1` = eski
 * `mt-6`, `-mb-1`) içeriğin yerini ve aralıkları değiştirmez.
 */
export const SHEET_BODY =
  "max-sm:-mx-1 max-sm:mt-5 max-sm:-mb-1 max-sm:min-h-0 max-sm:overflow-y-auto max-sm:overscroll-contain max-sm:p-1";

/** Altta sabit eylem şeridi; ince çizgi gövdenin altında içerik olduğunu belli eder. */
export const SHEET_ACTIONS = "max-sm:mt-4 max-sm:shrink-0 max-sm:border-t max-sm:border-zinc-950/5 max-sm:pt-4";
