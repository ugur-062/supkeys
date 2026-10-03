import AuthedLoading from "../loading";

/**
 * Ayarlar alt bölümleri için Suspense sınırı (arayüz testi O-126): hub'dan
 * kendi `layout.tsx` kapısı olan bölüme (adresler, banka-hesaplari,
 * kullanicilar, aktivite, ai-kullanim, dogrulama, firma) geçişte tıklamaların
 * bir kısmı ekranı değiştirmiyor, gezinme ancak sonraki yeniden çizimde
 * tamamlanıyordu. Üst `(authed)/loading.tsx` sınırı paylaşılan `ayarlar`
 * bölümünün ÜSTÜNDE kaldığı için bu geçişleri kapsamıyordu; buradaki sınır
 * geçişi hemen iskeletle işler, içerik inince yerine koyar.
 */
export default function AyarlarLoading() {
  return <AuthedLoading />;
}
