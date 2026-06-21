import { resolveApiBaseUrl } from "../resolve-api-url";

export interface PublicTenantProfile {
  name: string;
  slug: string;
  industry: string | null;
  city: string | null;
  aboutText: string | null;
  website: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  services: string[];
  foundedYear: number | null;
  employeeCount: string | null;
  certifications: string[];
}

/**
 * Server-side fetch — `/firma/[slug]` SSR sayfasında kullanılır.
 * 404 → null (notFound). publicEnabled değilse backend 404 döner.
 * ISR: 5sn (editörden değişiklik en geç 5sn'de public sayfaya yansır).
 */
export async function fetchPublicTenant(
  slug: string,
): Promise<PublicTenantProfile | null> {
  const apiBase = resolveApiBaseUrl();
  if (!apiBase) return null;

  const res = await fetch(
    `${apiBase}/public/tenants/${encodeURIComponent(slug)}`,
    { next: { revalidate: 5 } },
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Public alıcı profil API ${res.status}`);

  return (await res.json()) as PublicTenantProfile;
}
