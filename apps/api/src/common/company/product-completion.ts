/**
 * Ürün tamamlanma + yayın kapısı — kurallar `@rothern/shared`
 * (`helpers/product-completion.ts`) içinde: web formu aynı kuralları canlı
 * çalıştırır. Bu dosya API içi çağrı yerleri için ince yeniden dışa aktarma.
 */
export {
  MIN_DESCRIPTION,
  MIN_NAME,
  productCompletion,
  productPublishBlockers,
} from "@rothern/shared";
export type {
  CompletionContext,
  CompletionResult,
  ProductLike,
} from "@rothern/shared";
