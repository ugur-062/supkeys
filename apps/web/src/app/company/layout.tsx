/**
 * Panel rotalarının tamamı (`/company/*`) DİNAMİK render edilir.
 *
 * Zorunlu: middleware bu rotalara nonce'lı (strict-dynamic) CSP verir; statik
 * prerender edilen HTML per-request nonce taşıyamaz, framework script'leri
 * bloke olur ve sayfa — giriş ekranı dahil — ölür. Bu dosya kaldırılırsa
 * `/company/login` sessizce statik üretilir ve canlıda kırılır.
 *
 * `(authed)/layout.tsx` bir client component olduğu için rota segmenti
 * yapılandırmasını taşıyamaz; ayrıca `/company/login`, `/company/kayit`,
 * `/company/onboarding` o grubun DIŞINDA. Bu sunucu layout'u üçünü de kapsar.
 * Tek kaynak: `@/lib/public-routes`.
 */
export const dynamic = "force-dynamic";

export default function CompanySegmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
