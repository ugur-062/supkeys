// Tamamen monokrom (zinc) palet — app'in Catalyst siyah-beyaz temasıyla aynı.
// Hiç mavi/renk yok; buton = siyah, metin = near-black, kutular = açık gri.
export const COLORS = {
  brand50: "#F4F4F5", // açık kutu zemini (zinc-100)
  brand100: "#E4E4E7", // kutu kenarı (zinc-200)
  brand500: "#52525B", // orta aksan (zinc-600)
  brand600: "#18181B", // primary / buton zemini (zinc-900 = siyah)
  brand700: "#09090B", // hover / link (zinc-950)
  brand900: "#18181B", // koyu başlık / metin (zinc-900)

  slate100: "#F4F4F5",
  slate400: "#A1A1AA",
  slate500: "#71717A",
  slate600: "#52525B",
  slate700: "#3F3F46",
  slate900: "#18181B",

  /** Sayfa zemini (kartın çevresi) — kart beyazından ayrışacak kadar gri. */
  page: "#F4F4F5",
  card: "#FFFFFF",
  surfaceSubtle: "#FAFAFA",
  surfaceMuted: "#F4F4F5",
  surfaceBorder: "#E4E4E7",
} as const;

// Uzak yazı tipi YÜKLENMEZ (e-posta istemcileri çoğunlukla engeller, Outlook
// yok sayar): marka fontu Inter yüklüyse o, değilse sistem yığını. Mono font
// YOK (kullanıcı kararı 2026-09-10, "kod" dahil) — kod rakamları tabular-nums.
const SANS = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const FONTS = {
  sans: SANS,
  display: SANS,
} as const;
