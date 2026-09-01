# Denetim 2026-08-24 — Parça 6: AI Katmanı

> **Terminoloji notu (2026-09-01):** Bu rapor yazıldığında ürün dilinde
> "ihale" kullanılıyordu. Sonradan kullanıcı-yüzü dil **"satın alma talebi"**
> (satış tarafında "ilan") olarak değiştirildi. Rapor metni BİLİNÇLİ olarak
> güncellenmedi: o tarihteki kodu ve dizeleri anlatıyor, bugünkü sözcükle
> yeniden yazılırsa okuyucu git geçmişinde başka bir şey bulur. Kod adları
> (`IhaleListView`, `ihaleler-view.tsx` vb.) zaten değişmedi. Bkz. CLAUDE.md
> § Ürün Dili.



Yöntem: 8 mercek paralel bulgu toplama (57 ham bulgu: bütçe/maliyet, asistan
okuma yetkisi, aksiyon çerçevesi, prompt injection, belge hattı, fiyat çıkarma,
veri/kötüye kullanım, AI ön yüzü) → tekilleştirme (aynı kök nedeni 4-5 mercek
birden bulmuştu) → 13 bağımsız çürütücü → LOW/INFO elle.

## DOĞRULANAN

| # | Şiddet | Bulgu | Kanıt | Düzeltme |
|---|--------|-------|-------|----------|
| 1 | **HIGH** | **AI belge hattında otoritatif boyut doğrulaması yok → tek istekle OOM (platform kesintisi):** presigned PUT `ContentLength` koşulsuz imzalanıyor, `fileSize` DTO'da opsiyonel (birinci taraf istemci bile göndermiyor) ve nesneler 15 MB tavanı uygulanmadan ÖNCE `Promise.all` ile **paralel ve tamamen** belleğe indiriliyor (`transformToByteArray` + `Buffer.from` = 2× tepe). Kardeş modüllerin tek-kaynak kapısı `assertUploadedObjectValid` (HEAD) bu hatta **hiç** çağrılmıyor — `checkExists`'in repoda tek çağıranı o helper. Kötü niyet gerekmiyor: 20×15 MB'lık tamamen kurallara uygun istek de 512 MB'lık üretim konteynerinde ölümcül | `tender-extract.service.ts:80-133`, `bid-price-extract.service.ts:51-70`, `storage.service.ts:228-239, 304-314`, `ai-extract-router.ts:74-80` | tek-kaynak `downloadAiInputs`: HEAD ile boyut → **seri** indirme → toplam bayt tavanı (40 MB) |
| 2 | MED | **PDF sayfa tavanı TÜM sayfalar ayrıştırıldıktan SONRA uygulanıyor** — çürütücünün ölçümü: 1,87 MB'lık sayfa-bombası tek istekte **111 sn CPU** yakıyor (15 MB ile dakikalarca); tek süreçte tüm kiracılar yavaşlıyor | `ai-extract-router.ts:258-284` | `getInfo()` ile sayfa sayısı **metin çıkarmadan** okunur, tavan orada uygulanır (reddi `catch` yutmasın diye BadRequest yeniden fırlatılır) |
| 3 | MED | **profile-enrich'in tek freni yapısal olarak zayıf:** bütçe dışı olması bilinçli (BRONZ'un havuzu yok) ama "günlük 3" sayacı (a) yalnız BAŞARIDA, çağrıdan SONRA, hata yutan `void audit.log` ile artıyor → başarısız/pahalı denemeler bedava; (b) oku-yaz arasında kilit yok → eşzamanlı isteklerin hepsi aynı sayacı görüyor; (c) daha pahalı grounding yolu gövdedeki `website` ile deterministik seçilebiliyor | `profile-enrich.service.ts:91-152, 186-200` | sayım+kayıt AYNI tx'te, firma satırı `FOR UPDATE`, kayıt çağrıdan ÖNCE (`company.profile_enrich_attempt` = DENEME sayacı) |
| 4 | MED | **Grounding ücreti maliyet modelinde ifade edilemiyor:** `AiModelPricing` yalnız 3 token oranı, `costFromUsage` token-dışı hiçbir terim eklemiyor → Google Search grounding'in istek-başı bileşeni firmanın USD havuzuna **hiç** yansımıyor | `ai.config.ts:18-25`, `ai-budget.service.ts:72-84` | `GROUNDED_REQUEST_USD` + `costFromUsage(..., { grounded })`; hem rezervasyon tahmini hem `settle` grounded bayrağını taşır |
| 5 | MED | **AI teklif yolu DTO doğrulamasını atlıyor:** confirm ucu gövde ALMAZ; yürütülecek DTO `pendingAction` JSON'undan okunup `as PlaceBidDto` ile servise veriliyor — bu yalnız derleme-zamanı iddia, ValidationPipe devrede değil. 2 ondalıktan fazla birim fiyat böyle geçip **kazandırılamayan** teklif üretebiliyor | `assistant-actions.service.ts:303-311, 583-589`; `assistant.controller.ts` confirm | `validatePendingDto` (aynı DTO sınıfı, `class-validator`) — `place_bid` ve `publish_tender` yürütmeden önce doğrulanır |
| 6 | MED | **"AI ile düzelt" (refine) formu SIFIRLIYOR:** `mapAiDraftToForm` tabanı `DEFAULT_FORM_VALUES` olduğu için teslimat/fatura adresi, görünürlük, davetliler, kalem soruları, açılış tarihi ve SATIS taban/hemen-al fiyatları uyarısız siliniyor; bant tüm adımlarda (Davetliler/Özet dahil) görünür | `ai-flags-banner.tsx:131-146`, `map-ai-draft-to-form.ts:16-24` | taban artık formun O ANKİ değerleri (`current`) — AI'nın dokunmadığı alanlar korunur |
| 7 | MED | **İçe aktarma, kalem para birimini YASAK olduğu ilanlarda da yazıyor** (SATIS / pazarlık / hemen-al): form `multiCurrency`'ye bakıyor, backend ise `canItemCurrency` kuralını (kapalı zarf ALIM + çok birimli) zorluyor → teklif gönderilemez hâle geliyor | `teklif-ver/page.tsx:651-664` vs `company-listings.service.ts:3408-3421` | form da `canItemCurrency` kullanır (tek kural) |
| 8 | LOW | **Model çıktısına TR binlik sezgisi uygulanıyor:** `sanitizeRows`, Excel/CSV için yazılmış `parseLocaleNumber`'ı ("tam 3 hane = binlik") modelin STRING sayılarına da uyguluyor; oysa prompt binlik ayracını YASAKLIYOR ve 3 ondalığa izin veriyor → "1.875" → 1875 (1000×). Etki sınırlı: uç yazmaz (önizleme), hata hep YUKARI | `bid-price-extract.service.ts:186-189`, `bid-price-extract.prompts.ts:18` | model çıktısı için ayrı `parseModelNumber` (nokta ondalık; TR biçimi yine tolere edilir, semboller atılır) |
| 9 | LOW | **Onay kartı bağlayıcı alanları göstermiyordu:** ödeme planı (kategori/vade/peşin %), açıklama ve şartname serbest metinleri, kalem miktar/birimi kartta yokken tek tıkla canlı ilana yazılıyordu — belge kaynaklı (düşman olabilecek) içerik kullanıcı görmeden yayınlanabilirdi | `assistant-actions.service.ts:176-187` | kart ödeme/teslim/açıklama/şartname önizlemesi + kalem miktarlarını gösterir; "metinler belgeden geldi — okuyun" uyarısı |
| 10 | LOW | **KVKK silme/anonimleştirme `ai_chat_sessions`'a dokunmuyor** (FK yok → cascade ulaşmaz): serbest metin sohbet içeriği talepten sonra 90 günlük TTL cron'una kadar duruyor | `admin-companies.service.ts:1623-1670` | her iki kolda da `aiChatSession.deleteMany`; `ai_usage` bilinçli KALIR (append-only ölçüm, serbest metin yok) |
| 11 | LOW | **AI ile doldurulan SATIŞ ilanında görünürlük PUBLIC yerine PRIVATE'a düşüyor** (Madde 25 varsayılanı atlanıyor). Zararı sınırlı: backend PRIVATE + 0 davetli yayını reddediyor ve kullanıcı üç yerde görüp değiştirebiliyor | `map-ai-draft-to-form.ts` | taban değerlerde SATIS → PUBLIC (kullanıcı seçimi varsa korunur) |
| 12 | LOW | **CSV/görsel kaynak tavanları:** ExcelJS `csv.read` ≤15 MB'ı tamamen Row nesnelerine açıyor (satır tavanı ancak parse sonrası); sharp'a piksel bütçesi verilmemiş | `ai-extract-router.ts:170-172, 330` | CSV'ye 2 MB ayrı tavan; `sharp(..., { limitInputPixels: 60 MP })` |

## ÇÜRÜTÜLEN / BİLİNÇLİ TASARIM

- **Araç sonuçları modele alan-redaksiyonu olmadan gidiyor** → DESIGN_DECISION: araçlar controller'larla AYNI servis metotlarını aynı kapılarla çağırıyor; model kullanıcının zaten ekranında gördüğü payload'ı görüyor (yetki sızıntısı yok). Sağlayıcıya veri gitmesi KVKK aydınlatmasında Google adıyla ilan edilmiş. "İç notlar" iddiası yanlış (sipariş notları iki taraflı).
- **Asistan araç döngüsü sınırsız** → REFUTED: 4 iterasyon + kapanış çağrısı + 90 sn tur deadline'ı var; gerçek usage tüm çağrılardan toplanıp tek `settle` ile yazılıyor.
- **CSV'de "hiçbir ön-kontrol yok"** → kısmen yanlış: 15 MB'lık `MAX_FILE_BYTES` CSV'ye de uygulanıyordu; zip guard'ın yalnız xlsx'e koşullu olması doğru (CSV zip değil). Kalan gerçek risk #12'ye indirgendi.
- **Belge para birimi sessizce düşüyor** → büyük ölçüde REFUTED: satır uyarısı + belge notice'ı + şablon yolunda ERROR var. Kalan dar artık: belge-düzeyi `docCurrency` satır-başı fallback olarak kullanılmıyor (Dalga B).

## DALGA B (doğrulanan LOW/INFO)

- Asistan oturumu bütçe reddinden ÖNCE yaratılıyor (yetim "0 yazışma" satırı); `budget.fail` timeout'ta `keepEstimate` vermiyor ve settle sonrası hata gerçek maliyeti sıfırlıyor.
- Bir model turundaki paralel araç çağrısı ADEDİNİN sayısal tavanı yok (salt-okuma, boyut kapaklı).
- Belge metni asistanın sistem talimatına etiketsiz ekleniyor (tender-extract yolunda `<belge>` sınırı var, asistan yolunda yok).
- `docCurrency` satır-başı fallback + izinli birimde yüzeye çıkmaması.
- `ai_usage`/`ai_chat_sessions` RLS kapsamı dışında (RLS backstop listesinde kayıtlı).
- AI uçlarında uç-bazlı `@Throttle` yok (yalnız global 100/dk/IP) — bütçe dışı uçlar (profile-enrich) için ek fren.
- `GROUNDED_REQUEST_USD` sağlayıcı fiyat listesine göre doğrulanmalı (bugün fail-closed tahmin).

## DURUM

- **Dalga A UYGULANDI (2026-08-24):** #1-#12.
- Yeni tek-kaynaklar: `ai/tender-extract/download-ai-inputs.ts`, `ai/assistant/validate-pending-dto.ts`, `parseModelNumber`, `GROUNDED_REQUEST_USD`.
- Testler: `test/unit/audit-part6-dalga-a.spec.ts` (8) + mevcut AI spec'leri (ai-tender-extract 14, ai-assistant, ai-budget) yeşil; `FakeStorage` rig'ine `checkExists` eklendi (yeni HEAD kapısı).
