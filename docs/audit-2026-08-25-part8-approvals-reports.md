# Denetim 2026-08-25 — Parça 8: Onay Akışı, Raporlar, Pano, Şablonlar, Kategori

> **Terminoloji notu (2026-09-01):** Bu rapor yazıldığında ürün dilinde
> "ihale" kullanılıyordu. Sonradan kullanıcı-yüzü dil **"satın alma talebi"**
> (satış tarafında "ilan") olarak değiştirildi. Rapor metni BİLİNÇLİ olarak
> güncellenmedi: o tarihteki kodu ve dizeleri anlatıyor, bugünkü sözcükle
> yeniden yazılırsa okuyucu git geçmişinde başka bir şey bulur. Kod adları
> (`IhaleListView`, `ihaleler-view.tsx` vb.) zaten değişmedi. Bkz. CLAUDE.md
> § Ürün Dili.



Yöntem: 7 mercek paralel bulgu toplama (76 ham bulgu) → tekilleştirme →
12 bağımsız çürütücü → LOW/INFO elle. Bu turda çürütücüler sayısal iddiaları
canlı probe ile ölçtü (ör. 3,7 MB CSV, %300 yanıt oranı, 40 kat kur sapması).

## DOĞRULANAN

| # | Şiddet | Bulgu | Kanıt | Düzeltme |
|---|--------|-------|-------|----------|
| 1 | **HIGH** | **Rapor/analitikte KARIŞIK BAZ:** teklif TOPLAMLARI `bidTry()` ile TRY'ye çevrilirken KALEM satırları ham okunuyordu — hedef/taban birim fiyatı İLANIN biriminde, kazanan birim fiyatı TEKLİFİN (hatta kalemin) biriminde. Ölçülen: TRY ilan + 30 USD/adet kazanan → rapor "₺97.000 tasarruf" derken gerçekte ₺20.000 **aşım** var; "önerilen kazanan" pahalı tedarikçiyi seçiyor; aynı ekranda "Kazanan Toplam ₺3.000" ile tablo "₺120.000" çelişiyor. UI dipnotu ("teklif anındaki TCMB kuruyla toplanır") iki cümlesinde de yanlıştı | `company-reports.service.ts` savings/bidComparison kalem hesapları; `dashboard-analytics.service.ts` `savingsOf` | yeni tek kaynak `common/company/report-currency.ts` (`bidRateToTry`/`itemUnitPriceTry`/`listingAmountTry`); kalem kıyası ve referans TRY bazında, kur damgası yoksa satır hesaba **katılmaz** (fail-closed) |
| 2 | **HIGH** | **Ödeme KPI'ları COMPLETED siparişleri evrenden atıyordu.** Madde 17 ile "Teslim Aldım" siparişi doğrudan COMPLETED yaptığından "vadesi geçmiş ödeme" kritik satırı pratikte hiç ateşlenmiyordu — oysa iş kuralı açık: "COMPLETED = operasyonel bitiş, borç AYRI izlenir" | `action-center.service.ts` (satinalma sipariş evreni + `paymentWindow`), `dashboard-analytics.service.ts` `openOrdersAll` | ödeme evreni `notIn: [REJECTED, CANCELLED, DISPUTED]` (COMPLETED dahil); `paymentWindow` DELIVERED **veya** COMPLETED; operasyonel satırlar kendi durum filtrelerini korur |
| 3 | MED | **Faz O tedarikçi-adı maskesi cache üzerinden baypas ediliyordu:** analitik cache anahtarı `maskSupplierNames` bayrağını taşımıyordu → tam-okuma yetkili bir kullanıcı cache'i ısıttığında dar bağlamlı üye 5 dakika boyunca AÇIK tedarikçi adlarını alıyordu (P4 maskesinin regresyonu) | `dashboard-analytics.service.ts:139` | anahtar `…:${maskKey}` |
| 4 | MED | **İlan tipi doğrulaması İSTEMCİDEN okunuyordu:** `updateListing` her yerde `existing.type` kullanırken tarih doğrulamasına `dto.type` geçiyordu → AÇIK bir ALIM ihalesi `type:"SATIS"` + `closesAt:null` gönderilerek **kapanışsız** bırakılabiliyordu (auto-close cron `closesAt <= now` filtresi null'ı hiç yakalamaz → ihale süresiz açık) | `company-listings.service.ts` updateListing | doğrulamaya `existing.type` geçilir |
| 5 | MED | **"Tek aktif onay akışı" invariantı yalnız `setStatus`'ta uygulanıyordu:** `updateFlow` akışın `type`/`listingType`'ını değiştirirken passivasyonu yeniden çalıştırmıyor, DB'de kısmi unique index de yok → örtüşen iki ACTIVE akış kalıyor ve `findMatchingFlow` `createdAt asc` ile EN ESKİSİNİ seçiyor (daha gevşek eşik → adım SKIPPED → kazandırma **onaysız**) | `company-approvals.service.ts` updateFlow/setStatus/findMatchingFlow | `updateFlow` ACTIVE akışta passivasyonu aynı tx'te tekrar çalıştırır |
| 6 | MED | **Onay akışı konfigürasyonu izsizdi:** create/update/setStatus/delete audit bırakmıyordu → `approvals:manage` izinli bir yönetici aktif akışı pasifleştirip/silip kazandırma onay kapısını **izsiz** kaldırabiliyordu (onay KARARLARI audit'liydi, konfigürasyon değil) | `company-approvals.service.ts` | `approval_flow.updated` / `.status_changed` / `.deleted` (critical) audit |
| 7 | MED | **Onay bildirimi e-postası pasifleştirilmiş onaycıya gidiyordu** (in-app primitifi `isActive/deletedAt` kapısını uyguluyor, e-posta kolu okumuyordu) → INV-SD-1 ihlali; ihale başlığı+numarası eski çalışana ulaşıyordu | `company-approvals.service.ts` `notifyApproverInner` | alıcı `isActive`/`deletedAt` kontrolü |
| 8 | MED | **Rapor metrikleri:** (a) "Yanıt Oranı"nın paydası yalnız davet sayısıydı → davetsiz teklif alan ilanlarda **%300** gibi oranlar (canlı probe); (b) Tasarruf–Kazanç raporu aralığı `createdAt`'e uygulanıyor ama `awardedAt`'e göre sıralanıyor ve UI "bu aralıkta kazandırılmış" diyordu; (c) elenmiş (LOST) teklifler karşılaştırma raporunda "Önerilen Kazanan" olarak öneriliyordu | `company-reports.service.ts` | (a) pay = davetli yanıtları; (b) aralık `awardedAt`'e (legacy `awardedAt=null` için `createdAt` yedeği); (c) `LOST` öneriden çıkarıldı |
| 9 | MED | **Analitik evreni `createdAt >= from` ile sınırlıydı** ama serilerin çoğu `awardedAt`'e göre gruplanıyor → pencereden ÖNCE açılıp pencere İÇİNDE kazandırılan ihale hiçbir grafikte görünmüyordu (uzun süren ihalelerde sistematik eksik) | `dashboard-analytics.service.ts` | evren `OR: [createdAt >= from, awardedAt >= from]` |

## ÇÜRÜTÜLEN / DARALTILAN

- **Kalem-bazlı kazandırmada onay isteği "0 TRY"** → CONFIRMED ama **LOW**: onay kapısı `forceRequireApproval` ile kapalı kalıyor ve yürütme payload'dan gidiyor; kusur yalnız onaycıya gösterilen tutar ve kalıcı snapshot (award ile asimetri) → Dalga B.
- **Şablon/`templates:manage` UI paritesi ve şablon adet tavanı** → LOW; `updateListing` tip kaçağı bu turda kapatıldı.
- **Kategori kuralları** → LOW: firma ana kategorisi 1-3 kuralı yalnız onboarding'de (PATCH profilde adet kontrolü yok); pasif kategori "Firma Bilgileri" kaydını kilitliyor; public kategori uçları önbelleksiz → Dalga B.
- **Pano "bekleyen onay" satırının portal filtresi** → LOW: satırın hedefi bilinçli portal-nötr `/company/onaylar` ve kullanıcı-scope'lu sidebar rozeti doğru çalışıyor; yine de sayı firma-geneli → Dalga B.
- **Kısmi kazandırma (AWARDED_PARTIAL) raporlarda** → PARTIAL/MED: raporun kalem tarafı doğru, "Kazanan Toplam" kısmi kazananların TAM teklif tutarını topluyor; pano ALIM Tasarruf/Tedarikçi KPI'ları AWARDED_PARTIAL'ı hiç görmüyor → Dalga B (P4'te de kayıtlı).

## DALGA B (doğrulanan LOW/MED)

- Kısmi kazandırma: rapor "Kazanan Toplam"ı ve pano Tasarruf/Tedarikçi KPI'ları.
- Kalem-bazlı kazandırmada onay isteği tutarı (0 TRY yerine ham tutar + kendi para birimi, award ile simetrik).
- Onaycı **rolü** sonradan alınınca zincir tıkanıyor (fallback yalnız `isActive/deletedAt`'e bakıyor); `fallbackInactiveApprovers` `take:100`'ü filtrelemeden önce uyguluyor.
- Rapor tavanına dayanan sonuç sessiz kesiliyor: `general`'in `truncated` bayrağı UI'da okunmuyor, `savings`'te bayrak hiç yok.
- Raporlar hub özeti TASLAK/İPTAL ihaleleri sayıyor ve SATIS tarafında teklifleri ilan tipine göre süzmüyor.
- Firma ana kategorisi adet kuralı yalnız onboarding'de; pasif kategori profil kaydını kilitliyor; public kategori uçları önbelleksiz.
- Pano "bekleyen onay" sayısı portal/kullanıcı kapsamsız; satış analitiğinde Faz O maskesi yok.
- Tasarruf sekmesi kazandırma tarihi olarak `updatedAt` kullanıyor (`awardedAt` olmalı).
- Onay akışı için DB tarafında kısmi unique index (`companyId, type, coalesce(listingType,'ALL')` WHERE status='ACTIVE`) — kod tarafı hizalandı, şema garantisi yok.

## DURUM

- **Dalga A UYGULANDI (2026-08-25):** #1-#9.
- Yeni tek-kaynak: `common/company/report-currency.ts`.
- Testler: `test/integration/audit-part8-dalga-a.spec.ts` (6) + mevcut reports/approvals/dashboard spec'leri yeşil.
