/**
 * AI Asistan düğmesinin (FAB) sağ-alt sütunu için sağ pay — ekranın altına
 * yaklaşabilen satır içi birincil düğmeler (bilgi talebi "Yanıtla" vb.) bu
 * payla düğmenin altından çekilir.
 *
 * Geometri `assistant-launcher.tsx` ile bağlı: tam boy düğme `bottom-8
 * right-8 h-14 w-14` (ekranın sağından 32 + 56 px). Kartın kendi kenar payı
 * (telefonda sayfa 16 + kart 20 px) düşülünce telefonda ≥ 60 px gerekir →
 * `pr-16` (64). `sm:pr-14` geniş ekran ölçümüyle (arayüz testi son tur
 * S-SELL). Arayüz testi kapanış S-SELL NEW-2: eskiden yalnız `sm:pr-14`
 * vardı; 390 px'te yanıt kutusu ekranın altına yaklaşınca düğme "Yanıtla"nın
 * sağ yarısını örtüyor, oraya dokunmak asistanı açıyordu.
 *
 * Mobil denetim 2026-10: telefonda (sm altı) düğme artık 44 px ve köşeden
 * 12 px (ekranın sağından 56 px); `pr-16` fazlasıyla yeter. Ayrıca düğme
 * durduğu yerde bir kontrolün (telefonda bir metnin de) üstüne düşerse her
 * genişlikte kendiliğinden çekilir (`fab-suppression.ts`) — bu pay düğmenin
 * GÖRÜNÜR kalmasını sağlar.
 */
export const FAB_CLEARANCE_CLASS = "pr-16 sm:pr-14";

/**
 * YALNIZ sm VE ÜSTÜ sağ pay (mobil denetim 2026-10, masaüstü 1280 ölçümleri):
 * telefon yerleşimi değişmemesi gereken yerlerde — telefonda düğme örtüşmede
 * zaten kendiliğinden çekilir (`fab-suppression.ts`). Ölçülen örtüşmeler:
 * Ürünlerim satır ⋮ düğmesi (1192-1228) küçük düğmenin (1212-1256) altında,
 * liste sonu "Sonraki sayfa" ve yeni talepte "Varsayılan yap" tam boy düğmenin
 * (1192-1248) altında kalıyordu; düğme 35 durağan konumun 34'ünde çekiliyordu.
 *
 * Geometri: içerik sütununun sağ kenarı ekranın sağından kabuğun iç payı kadar
 * içeride (`shell.tsx` `#icerik`: sm 24 · lg 32 · xl 40 px; daha geniş ekranda
 * sütun 1320 px'te ortalanır, pay büyür). Tam boy düğmenin sol kenarı ekranın
 * sağından 32 + 56 = 88 px, küçük düğmeninki 24 + 44 = 68 px. Pay + iç pay her
 * kırılımda 96 px → içerik kenarına dayanan öğedeki kontrol tam boy düğmenin
 * 8 px solunda biter. Sözleşme `fab-clearance.test.ts` (kaynaktan ölçer).
 */
export const FAB_CLEARANCE_SM_CLASS = "sm:pr-18 lg:pr-16 xl:pr-14";

/**
 * Aynı pay, kenarı içerik kenarına dayanan ve `px-5` (20 px) iç paylı bir
 * kartın İÇİNDEKİ satır için (mobil denetim 2026-10, üçüncü tur: yeni talepte
 * Ticari şartlar satırlarının "değiştir" düğmeleri 1280'de 1166-1228'e
 * uzanıyor, tam boy düğme ilk açılışta çekiliyordu). Kartın 20 px'i + bu pay =
 * `FAB_CLEARANCE_SM_CLASS`; satırın geri kalanı (değer metni) tam genişlikte kalır.
 */
export const FAB_CLEARANCE_SM_IN_PX5_CLASS = "sm:pr-13 lg:pr-11 xl:pr-9";

/**
 * Aynı pay, iç payı 12 px (`px-3`) olan kartın içindeki satır için — talep
 * satırının (`ListingCard row`) alt çizgisindeki "Teklif ver" 1280'de
 * 1111-1228'de, AI Asistan düğmesinin sütununda duruyor; masaüstü Açık
 * Talepler'de düğme 20 durağan konumun 5'inde çekiliyordu (ölçüm 2026-10-15).
 */
export const FAB_CLEARANCE_SM_IN_PX3_CLASS = "sm:pr-15 lg:pr-13 xl:pr-11";

/**
 * Aynı pay, içerik kenarından `right-*` ile konumlanan bir kontrol için (öneri
 * şeridinin "İleri kaydır" oku): okun sağ kenarı ekranın sağından 96 px.
 */
export const FAB_CLEARANCE_SM_RIGHT_CLASS = "sm:right-18 lg:right-16 xl:right-14";
