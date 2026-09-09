import { serializeJsonLd } from "@/lib/json-ld";

/**
 * JSON-LD script etiketi — tek sarmalayıcı. Kaçış `serializeJsonLd`de
 * (firma-kontrollü metin `</script>` içerebilir).
 */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
