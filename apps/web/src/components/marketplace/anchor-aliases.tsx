import { anchorAliasIds, type PublicAnchor } from "@/lib/public/anchors";

/**
 * Bölümün öteki dillerdeki çapaları (`lib/public/anchors`): bölümün en başına
 * konan boş, görünmez hedefler. Eski Türkçe parçalı bağlantı EN/RU sayfasında
 * (ya da tersi) tarayıcının kendi çapa kaydırmasıyla ve `useScrollToHash` ile
 * yine bu bölüme iner. Hook kullanmaz; sunucu ve istemci bileşeninde çizilir.
 */
export function AnchorAliases({ anchor, locale }: { anchor: PublicAnchor; locale: string }) {
  return (
    <>
      {anchorAliasIds(anchor, locale).map((id) => (
        <span key={id} id={id} aria-hidden className="block scroll-mt-24" />
      ))}
    </>
  );
}
