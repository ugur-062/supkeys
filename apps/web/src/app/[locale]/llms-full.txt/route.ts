import { LOCALES } from "@rothern/i18n";
import { llmsFullResponse } from "@/lib/seo/llms-response";

/**
 * /<dil>/llms-full.txt — envanter kılavuzunun dil sürümü (2026-09-27):
 * kategori/şehir/ülke adları, SSS ve adresler o dilde. Kök `/llms-full.txt`
 * İngilizcedir. Bkz. `[locale]/llms.txt/route.ts`.
 */
export const dynamic = "force-static";
export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string }> }): Promise<Response> {
  return llmsFullResponse((await params).locale);
}
