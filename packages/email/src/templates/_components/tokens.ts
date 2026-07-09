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
  slate500: "#71717A",
  slate600: "#52525B",
  slate700: "#3F3F46",
  slate900: "#18181B",

  surfaceSubtle: "#FAFAFA",
  surfaceMuted: "#F4F4F5",
  surfaceBorder: "#E4E4E7",
} as const;

export const FONTS = {
  sans: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  display:
    '"Plus Jakarta Sans", "Inter", -apple-system, BlinkMacSystemFont, sans-serif',
} as const;
