import { androidAssetLinks, appLinkResponse } from "@/lib/mobile-app-links";

// Env çalışma anında okunur (parmak izi derlemeden sonra girilebilir).
export const dynamic = "force-dynamic";

/** Android App Links doğrulaması — bkz. `lib/mobile-app-links.ts`. */
export function GET() {
  return appLinkResponse(androidAssetLinks(process.env));
}
