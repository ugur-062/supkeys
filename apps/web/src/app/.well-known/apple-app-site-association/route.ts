import { appLinkResponse, appleAppSiteAssociation } from "@/lib/mobile-app-links";

// Env çalışma anında okunur (takım kimliği derlemeden sonra girilebilir).
export const dynamic = "force-dynamic";

/**
 * iOS Universal Links doğrulaması — bkz. `lib/mobile-app-links.ts`. Dosyanın
 * uzantısı yok; `public/` altında dursa `application/json` ile servis edilmezdi.
 */
export function GET() {
  return appLinkResponse(appleAppSiteAssociation(process.env));
}
