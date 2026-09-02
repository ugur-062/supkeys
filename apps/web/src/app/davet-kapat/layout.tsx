/**
 * Public bir sayfa DEĞİL (SEO'ya kapalı, nonce'lı CSP alır) ve `page.tsx` bir
 * client component olduğu için rota yapılandırmasını taşıyamaz → dinamik render
 * bu sunucu layout'undan zorlanır. Bkz. `@/lib/public-routes`.
 */
export const dynamic = "force-dynamic";

export default function DavetKapatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
