import { LOCALES } from "@rothern/i18n";
import { llmsResponse } from "@/lib/seo/llms-response";

/**
 * /<dil>/llms.txt — kılavuzun dil sürümü (2026-09-27): `/tr/llms.txt`,
 * `/en/llms.txt`, `/ru/llms.txt`. Kök `/llms.txt` İngilizcedir. Uzantılı yol
 * middleware'de next-intl'e girmez; `[locale]` parametresi doğrudan buraya
 * düşer (tanınmayan dil → 404, `dynamicParams = false`).
 */
export const dynamic = "force-static";
export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string }> }): Promise<Response> {
  return llmsResponse((await params).locale);
}
