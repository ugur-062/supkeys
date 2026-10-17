import { getTranslations } from "next-intl/server";
import type { Locale } from "@rothern/i18n";
import type { Metadata } from "next";

/**
 * 404 metasının TEK kaynağı (arayüz testi D-081): başlık sayfanın dilinde
 * ("Sayfa bulunamadı · Rothern"), `robots: null` kök düzenin `index, follow`
 * (+ googlebot) yönergesini SIFIRLAR — Next 404 yanıtına zaten tek `noindex`
 * basar (NonIndex); ikisi birlikte çelişen iki robots etiketi oluyordu.
 *
 * İki yerde kullanılır ve İKİSİ DE gerekir:
 *  · `[locale]/not-found.tsx` — sunucu HTML'inin hata kabuğu bu metayı yazar.
 *  · `[locale]/[...rest]/page.tsx` — tarayıcı hidrasyondan sonra metayı RSC
 *    ağacından (sayfa + düzenler) yeniden kurar; not-found sınırının metası o
 *    ağaçta YOK. Sayfa kendi metasını vermezse JS açıkken başlık kök yedeğe
 *    ("Rothern") ve robots `index, follow | noindex`e dönüyordu (yeniden
 *    doğrulama). `notFound()` çağıran her sayfa bu yüzden kendi
 *    `generateMetadata`sında "bulunamadı" durumunu da karşılamalı.
 */
export async function notFoundMetadata(locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "web.marketplace.pages" });
  return { title: t("notFoundTitle"), robots: null };
}
