import { resolveApiBaseUrl } from "../resolve-api-url";
import type { PublicSupplierProfile } from "./types";

/**
 * Server-side fetch — `/t/[slug]` SSR sayfasında kullanılır.
 * 404 → null (notFound() çağrılır), diğer hata → throw.
 *
 * ISR: 5 saniyede bir yeniden üret. Editörden değişiklik yapıldığında
 * en geç 5sn içinde public sayfa güncellenir (kullanıcı "kaydettim ama
 * eski görünüyor" şikâyetini önler). Production'da 60+ saniyeye çıkarılabilir.
 */
export async function fetchPublicSupplierProfile(
  slug: string,
): Promise<PublicSupplierProfile | null> {
  const apiBase = resolveApiBaseUrl();
  if (!apiBase) return null;

  const res = await fetch(`${apiBase}/public/suppliers/${encodeURIComponent(slug)}`, {
    next: { revalidate: 5 },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Public profil API ${res.status}`);
  }

  return (await res.json()) as PublicSupplierProfile;
}
