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
 */
export const FAB_CLEARANCE_CLASS = "pr-16 sm:pr-14";
