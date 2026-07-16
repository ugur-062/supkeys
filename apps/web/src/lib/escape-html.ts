/**
 * HTML-escape — ham string enterpolasyonuyla HTML üreten yerler için (ör.
 * yazdır/PDF `document.write`). Kullanıcı/karşı-taraf kontrollü değerler bir
 * HTML string'ine gömülürken XSS'i engeller: `<img src=x onerror=...>` gibi
 * yükler metne dönüşür, çalışmaz.
 *
 * React JSX'te BUNA GEREK YOK (JSX zaten escape eder) — yalnız elle HTML string
 * kurulan sınırlarda kullan.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] as string,
  );
}
