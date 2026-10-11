import type { ReactNode } from "react";

/**
 * `/dev/*` public rota DEĞİL: nonce'lı CSP alır, bu yüzden dinamik render
 * ZORUNLU (`public-routes.test` değişmezi — statik üretilirse canlıda
 * bootstrap script'leri bloke olur). Üretimde sayfalar zaten 404 döner.
 */
export const dynamic = "force-dynamic";

export default function DevLayout({ children }: { children: ReactNode }) {
  return children;
}
