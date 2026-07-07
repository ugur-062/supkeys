/**
 * JSON-LD'yi `<script>` içine güvenle gömer. `JSON.stringify` `<`/`>`/`&`'i
 * kaçırmaz; firma-kontrollü metin (`aboutText`, `name`) `</script><script>…`
 * içerirse `<script type="application/ld+json">` etiketinden çıkıp XSS olurdu.
 * Bu karakterleri geçerli JSON unicode kaçışlarına çeviririz (anlam korunur).
 * U+2028/U+2029 satır ayırıcıları da kaçırılır (JS bağlamında geçersizdir).
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
