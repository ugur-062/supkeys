/**
 * Üst çubuk açılır panellerinin (zil, mesajlar) konumu — tek kaynak.
 *
 * Mobil denetim 2026-10 (g04): panel `anchor="bottom end"` + `mt-2` ile
 * çiziliyordu. `mt-2` Headless'ın konum hesabının DIŞINDAYDI: panel ekranın
 * altından 8 px taşıyor (alt kenar ve köşeler kesik), sol kenarı ekrana
 * yapışıyordu (x = 0). Boşluk (`gap`, eskisiyle aynı görünür 12 px) ve
 * ekran payı (`padding`, 8 px) hesaba girer → panel ekranın içinde kalır.
 */
export const POPOVER_ANCHOR = { to: "bottom end" as const, gap: 12, padding: 8 };

/**
 * Panelin yükseklik tavanı (Headless satır içi `max-height`i
 * `min(var(--anchor-max-height), kalan alan)` olarak yazar; sınıf ezilirdi).
 *
 * Doğrulama turu (safe-area-shell#new1): Headless'ın `padding`i tek sayıdır,
 * ana ekran çizgisi payını (`--safe-bottom`) bilmez → yatay telefonda
 * (844×390, alt pay 21 px) zil ve mesajlar paneli alttaki 14 px'iyle, "Tüm
 * bildirimleri gör" satırının alt yarısı dahil, ana ekran çizgisi bandına
 * giriyordu. Tavan üst çubuk (`--topbar-h`, üst pay dahil) + düğme–panel
 * boşluğu + 8 px ekran payı (1rem) + alt payı düşer. Dikey telefonda ve
 * masaüstünde 30rem yine daha küçük kalır (görünüm aynı); yalnız bu kadar
 * alçak bir ekranda devreye girer. Tek bir padding sayısına alt payı eklemek
 * paneli dikey telefonda yanlardan da daraltırdı.
 */
export const POPOVER_MAX_HEIGHT_CLASS =
  "[--anchor-max-height:min(30rem,calc(100dvh-var(--topbar-h)-var(--safe-bottom)-1rem))]";
