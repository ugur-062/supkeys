# Rothern — Geliştirme Yol Haritası (33 madde)

> Oluşturulma: 2026-06-17 · Kaynak: ürün sahibi backlog
> Son denetim: 2026-06-21 · Durum: 33 maddenin çoğu ✅ (aşağıdaki tablo).
>
> ⚠️ **2026-06-24 — Faz/sürüm ayrımı KALDIRILDI.** Artık V1.5/V2/V2.7/V3 ya da
> "Faz 1…7 sırasıyla" diye kademe/erteleme yok — kalan her şey **tek backlog**,
> sıraya göre yapılır. Aşağıdaki "Faz" / "Grup" başlıkları yalnızca **konu/çalışma
> alanı** referansı olarak (aynı koda iki kez girmemek için) bırakıldı, öncelik
> kademesi değil. Güncel düz backlog için: `CLAUDE.md → Bekleyen / Yapılacaklar`.

## İlerleme (kodla denetlendi — 2026-06-21)

| Faz | Madde | Durum |
|---|---|---|
| 1 | 8 (teslim süresi zorunlu) | ✅ |
| 1 | 9 (zorunlu soru bug) | ✅ |
| 1 | 10 (geçerlilik süresi) | ✅ |
| 1 | 18 (tedarikçi satın alma talepleri liste) | ✅ (zaten `flex-col` liste) |
| 1 | 24 (bekleyen onay filtre) | ✅ (`pendingForMe` doğru) |
| 1 | 25 (sıralı çift onay) | ✅ (tek PENDING step) |
| 1 | 26 (ISO belge upload) | ✅ |
| 1 | 13 (alıcı sipariş iptal kaldır) | ✅ (2026-06-21) |
| 2 | 22 (satın alma talebi onayı kaldır) | ✅ |
| 2 | 23 (onay ekranı netleştir) | ✅ |
| G5 | 11 (fatura kesim tarihi kaldır) | ✅ (2026-06-21 · invoiceDate kolonu drop) |
| G5 | 15 (PDF indirme fix) | ✅ kod (2026-06-21) — zarif 503 + net hata mesajı. **Kök neden: dev'de Chromium sistem kütüphaneleri eksik (`libnspr4.so`); prod Docker'da çalışır.** |
| G5 | 12/14 (fatura no — "Gönderildi"ye geçişte zorunlu) | ✅ (2026-06-21 · `invoiceNumber` kolonu + zorunlu DTO + modal input + timeline + PDF) |
| G5 | 19/21 (sipariş Dosyalar: proforma/teknik/fatura/**Teslimat Evrakları**) | ✅ (2026-06-21) — kategori bazlı belge paneli; tedarikçi yükler, alıcı görür; statüye göre kademeli; COMPLETED'de teslimat evrakı boşsa uyarı |
| 3 | 16 (direkt ödeme — nakit/çek handshake) | ✅ (2026-06-21) — OrderPayment modeli + state machine (Teslim Aldım → DELIVERED → tam ödeme onayında otomatik COMPLETED) + ödeme dekontu + popup |
| 3 | 20 (Kayıtlı Bankalarım + tek yönetici) | ✅ — `supplier-banks` modülü + ayarlar/bankalar UI; sipariş onayında bankadan seçim |
| 3 | 6 (Rothern ID + Alıcı Havuzu) | ✅ (2026-06-21) — kalıcı rothernId (alıcı+tedarikçi) + çift yönlü ekleme; Alıcı Havuzu (tedarikçi paneli) ad/ID arama + public profil |
| 4 | Açık Satın Alma Talebi (PUBLIC görünürlük) + premium erişim | ✅ (2026-06-21) — Tender.visibility PRIVATE/PUBLIC; premium tedarikçi PUBLIC+OPEN satın alma taleplerini davetsiz görür/teklif verir (ilk teklifte davet otomatik); standart 2 bağlantı limiti |
| 3 | 33 (teminat mektubu) | ✅ (2026-06-21) — nakit (paymentTerm=CASH) satın alma talebinde kazanan tedarikçi siparişi ONAYLARKEN teminat mektubu yüklemek ZORUNDA (hard block); ORDER_GUARANTEE_LETTER scope; wizard uyarı + accept modal upload + belge panelinde kategori. **Faz 3 TAM bitti.** |
| 4 | 27 (KYC ek belgeler) | ✅ — ticari sicil + imza sirküleri + banka onaylı IBAN (connect-kyc-uploads) |
| 4 | 7 (satın alma talebi şablonları) | ✅ — kalem sorusu + tedarikçi şablonu + Satın Alma Talebini Kopyala |
| 4 | 28 (tasarruf raporu) | ✅ (2026-06-21) — karar: **tasarruf = en yüksek teklif − kazanan toplam** (rekabet tasarrufu). Rapor + Excel + genel rapor satırı güncellendi. |
| 4 | 3 (Proje Haber arama) | ⛔ BLOKLU — harici veri kaynağı; Proje Haber API/erişim bilgisi olmadan kurulamaz. **Faz 4 (3 hariç) bitti.** |

### G5 kilitli kararlar (2026-06-21 ürün sahibi cevapları)
- **Fatura no:** Tedarikçi siparişi **"Gönderildi"ye geçirmek için fatura no girmek ZORUNDA** (kargo no değil).
- **Belge modeli:** proforma+teknik baştan; gönderim sonrası fatura + alıcı imzalı irsaliye.
- **İmzalı irsaliye:** "Tamamlandı"yı **bloklamaz**; eksikse küçük uyarı gösterilir ("opsiyonel" yazısı yok).
- **Belge kategori adı:** "İmzalı İrsaliye" değil → **"Teslimat Evrakları"** (2026-06-21).

**Sonuç:** Faz 1 ✅ · G5 ✅ · **Faz 3 kodlanabilir kısmı ✅ (16 + 20)**. Faz 3 kalan: **33 (teminat mektubu)** ve **6 (Rothern ID)** — ikisi de açık ürün sorusu bekliyor (bkz. Açık sorular 6 + 11). **Faz 5 (Açık Eksiltme) planlardan çıkarıldı (2026-06-21).** Kalan büyük fazlar: **Faz 6 (Uluslararası: 29, 30, 5)** ve **Faz 7 (Escrow)**.

## Alınan Kararlar (kilitli)

| Konu | Karar |
|---|---|
| Güvenli ödeme (escrow, 31-32) | **Hem kart hem havale.** Kart = ödeme geçidi (Iyzico/Stripe), havale = admin onaylı manuel. **%3 komisyon.** |
| Öncelik | ~~Faz sırasıyla~~ → **Kademe yok (2026-06-24).** Kalan her şey tek backlog, sıraya göre yapılır. |
| Tedarikçi rolü (20) | **Tek "yönetici"** kişi. Sadece o, banka/hesap bilgilerini ekler/düzenler. Genel RBAC yok. |
| Açık eksiltme (4+17) | ~~Yapılacak~~ → **PLANLARDAN ÇIKARILDI (2026-06-21).** Zaten kurulu: İngiliz Usulü tipi + ayarlar (görünürlük, min fiyat azaltma oranı, auto-extend), canlı kart, teklif oran-enforcement, scheduler. Ek genişletme yapılmayacak. |

## Açık Eksiltme nedir? (madde 4 + 17 birlikte)

> ❌ **PLANLARDAN ÇIKARILDI (2026-06-21).** Bu özellik **zaten kurulu** —
> İngiliz Usulü tipi + ayarlar (görünürlük, min fiyat azaltma oranı, auto-extend),
> canlı kart, teklif oran-enforcement, scheduler mevcut. Ek genişletme yapılmayacak.
> Bölüm tarihsel referans için bırakıldı.

Satın Alma Talebinde iki mod olacak; alıcı satın alma talebi açarken seçer:

- **Kapalı zarf (mevcut V1):** Tedarikçiler birbirini hiç görmez, tek teklif verir. Alıcı hepsini görür.
- **Açık eksiltme (yeni):** Tedarikçiler **canlı yarışır**:
  - Tedarikçi fiyat **vermeden** diğerlerinin fiyatını göremez.
  - Fiyat **verdikten sonra** sistem geri bildirim verir: *"en iyi tekliften %X daha pahalı/ucuzsun"* → tedarikçi daha düşük teklif verebilir.
  - **Firma isimleri tedarikçilere asla görünmez** (anonim).
  - Süre dolarken yeni en iyi teklif gelirse satın alma talebi **otomatik uzar**; **uzama süresini alıcı belirler** (madde 17 — sniping engeli).

Yani **madde 4 = anonimlik + % gösterge**, **madde 17 = otomatik uzatma**. İkisi birlikte "açık eksiltme" modunu oluşturur.

> ❓ Açık nokta: madde 4'te "% göstergesi **alıcıya** gösterilir" yazıyor. Ama yarışın işlemesi için bu **tedarikçiye** gösterilmeli (alıcı zaten tüm fiyatları görüyor). Teyit gerekiyor.

---

## Maddeler — Gruplu

### A. Tasarım & UI
| # | Anladığım | Durum |
|---|---|---|
| 1 | Dashboard "Uber" fontunda. | ❓ Gerçek Uber Move (lisans) mı, benzeri ücretsiz mi? Tüm uygulama mı sadece dashboard mı? Marka Inter+Plus Jakarta değişecek mi? |
| 2 | Dashboard tedarikçi bölümü düzeltilecek. | ❓ Tam olarak ne bozuk? |
| 18 | Tedarikçi tarafında satın alma talepleri **alt alta** (liste). | ✅ |
| 23 | Onay ekranı daha net/anlaşılır. | ✅ (UX) |

### B. Satın Alma Talebi
| # | Anladığım | Durum |
|---|---|---|
| 3 | Satın Alma Talebi arama "Proje Haber"den çekilecek. | ❓ Harici veri kaynağı/servis mi? API var mı? |
| 7 | Satın Alma Talebi şablonları (kaydet/yeniden kullan). | ✅ |
| 9 | Zorunlu soru sormuyor → validasyon bug'ı. | ✅ (bug) |
| 22 | Satın Alma Talebi onayı kaldırılacak (satın alma talepleri onaya düşmeyecek). | ✅ Sipariş onayları kalır. |
| 4+17 | Açık eksiltme (anonim yarış + % gösterge + otomatik uzatma). | ❌ Planlardan çıkarıldı (2026-06-21) — mevcut iskelet yeterli |

### C. Teklif (tedarikçi)
| # | Anladığım | Durum |
|---|---|---|
| 8 | Teklif verilirken **teslim süresi zorunlu**. | ✅ |
| 10 | Tedarikçi **teklif geçerlilik süresi** verecek. | ✅ |

### D. Teslim Şekli
| # | Anladığım | Durum |
|---|---|---|
| 5 | Yurtiçi teslim şekli seçenekleri. | ⚠️ "2 tür" dedin, 3 saydın (nakliye dahil / fabrika-depo / gümrük teslim). Öneri: yurtiçi = (1) Nakliye dahil, (2) Fabrika/Depo teslim; "gümrük teslim" uluslararasıya taşınsın (madde 30). Teyit gerek. |

### E. Sipariş Akışı & Belgeler
| # | Anladığım | Durum |
|---|---|---|
| 11 | Sipariş onayında "hesap sahibi" + "IBAN" **zorunlu**; "fatura kesim tarihi" **kaldır**. | ✅ |
| 12+14 | Fatura no girilecek; tedarikçi onaylayıp **"Hazırlanıyor"a** düşünce **kargo no değil fatura no** (zorunlu). Teslim sonrası **alıcı imzalı irsaliye** zorunlu; alıcı teslimi onaylarsa irsaliye opsiyonel. | ⚠️ 12 ile 14 fatura no için çelişiyor — öneri: **tek yer = "Hazırlanıyor" aşaması (tedarikçi)**. Teyit gerek. |
| 13 | Alıcıda "siparişi iptal et" **kaldır**. | ✅ |
| 15 | Sipariş PDF indirme düzelt. | ❓ Tam olarak ne hatası? |
| 19+21 | Tedarikçi siparişinde **"Dosyalar"** başlığı: (1) proforma, (2) teknik doküman; sipariş gönderildikten sonra **fatura + irsaliye** eklenebilir (opsiyonel ama "opsiyonel" **yazılmaz**); irsaliye **alıcı imzalı**. | ✅ (14 ile aynı belge modeli — birleştirilecek) |

### F. Ödeme
| # | Anladığım | Durum |
|---|---|---|
| 16 | **Direkt ödeme:** alıcı nakit/çek + ödendi/ödenmedi; tedarikçi "ödemeyi/çeki aldım". Teslim **sonrası** ödemeyse → ödeme bölümü sipariş tamamlanınca görünür; teslim **öncesi** ise → tedarikçi onayından sonra **"ödeme bekleniyor"**. | ✅ Mantık net. ❓ Ödeme şartını (önce/sonra) kim/nerede belirliyor? |
| 33 | Yurtiçi **nakit/direkt** ödeme seçilirse, kazanan taraf **teminat mektubu** eklemek zorunda; ödeme şartlarında "teminat mektubu zorunlu olacak" uyarısı çıkar. | ⚠️ Teminat mektubunu **kim** veriyor (kazanan tedarikçi → alıcıyı koruyan teminat) ve **ne zaman** (kazanınca)? Teyit gerek. |

### G. Onay Sistemi
| # | Anladığım | Durum |
|---|---|---|
| 22 | Satın Alma Talebi onayı kaldırılacak. | ✅ |
| 23 | Onay ekranı netleştirilecek. | ✅ |
| 24 | Bekleyen onayda görünmesi gereken görünmüyor; her süreçte görünüyor → filtre bug. | ✅ (bug) |
| 25 | Çift onayda alt kademe onaylamadan üst kademe "onay bekliyor"da **görünmemeli** (sıralı). | ✅ (bug) |

### H. Tedarikçi Profili & KYC
| # | Anladığım | Durum |
|---|---|---|
| 26 | Tedarikçi profiline **ISO belgesi** yükleme. | ✅ |
| 27 | Alıcının açık profilinden gelen tedarikçiden ek belge: **ticari sicil gazetesi, imza sirküleri, banka onaylı IBAN**. Referanslı tedarikçi **premium'a** geçmek isterse de bu belgeler istenir. | ✅ |

### I. Roller, Banka & Kimlik
| # | Anladığım | Durum |
|---|---|---|
| 20 | Tedarikçide **"Kayıtlı Bankalarım"**; sipariş onayında otomatik seçilebilir. Sadece **tek yönetici** ekler/düzenler. | ✅ (karar: tek yönetici) |
| 6 | **Rothern ID** ile taraflar birbirini ekleyebilecek. | ❓ Kim kimi ekliyor (alıcı↔tedarikçi)? Ekleme = bağlantı mı? Referans kodu ile ilişkisi? |

### J. Raporlama
| # | Anladığım | Durum |
|---|---|---|
| 28 | Tasarruf raporu = **en yüksek − en düşük** teklif farkı. | ❓ Tasarruf en düşüğe göre mi, kazanan fiyata göre mi? |

### K. Uluslararası
| # | Anladığım | Durum |
|---|---|---|
| 29 | TR dışı firma kaydı + doğrulama (ülke, ülkeye göre vergi no, state/province, i18n). | ✅ Uluslararası satın alma talebinin ön koşulu. |
| 30 | Satın Alma Talebi açarken **Yurtiçi / Uluslararası** seçimi. Uluslararası: **konşimento** (irsaliye yerine) + farklı (Incoterms) teslim şekilleri. | ✅ |

### L. Güvenli Ödeme / Escrow (komisyonlu)
| # | Anladığım | Durum |
|---|---|---|
| 31 | **Uluslararası escrow:** tedarikçi onayı → alıcıya ödeme ekranı → admin "ödeme alındı" → tedarikçi başlar. **%3 komisyon.** | Faz 7 |
| 32 | **Yurtiçi escrow:** tedarikçi onayı → alıcıdan ödeme alınır → alıcı ürünü kontrol/onay → biz tedarikçiye aktarırız. | Faz 7 |

---

## Çalışma alanları (öncelik kademesi DEĞİL — yalnızca konu referansı)

> Bu tablo eski "faz sırası"ndan kalma; artık kademe/erteleme yok. Boyut tahmini
> ve içerik gruplaması olarak bırakıldı.

| Alan | İçerik | Boyut |
|---|---|---|
| **1 — Hızlı düzeltmeler** | 8, 9, 10, 11, 13, 18, 24, 25, 26 | S |
| **2 — Sipariş, belge & onay netliği** | 12/14, 15, 19/21, 22, 23 | M |
| **3 — Direkt ödeme + roller + kimlik** | 16, 33, 20 (tek yönetici + Kayıtlı Bankalarım), 6 (Rothern ID) | M-L |
| **4 — KYC + rapor + şablon/arama** | 27, 28, 7, 3 | M |
| ~~**5 — Açık eksiltme**~~ | ~~4, 17~~ → ❌ **planlardan çıkarıldı (2026-06-21)** | — |
| **6 — Uluslararası** | 29, 30, 5 | L |
| **7 — Güvenli ödeme / Escrow + %3 komisyon** | 31, 32 (kart + havale, ödeme sağlayıcısı) | XL |
| **UI (yan)** | 1 (font), 2 (dashboard fix) — netleşince araya | S-M |

**Bağımlılıklar:** Escrow (7) ← direkt ödeme modeli (3) + uluslararası (6) + ödeme sağlayıcısı kararı. Uluslararası (6) ← yabancı kayıt (29). 

**Ödeme sağlayıcısı (Faz 7'de karar):** TR için **Iyzico** (kart + alt üye işyeri/escrow + havale), uluslararası (31) için muhtemelen **Stripe**. Sözleşme + KVKK/PCI + payout/komisyon muhasebesi gerekir.

---

## Açık küçük sorular (planı bloklamaz, Faz'lara girerken cevaplanır)

1. **(1)** Uber fontu: gerçek Uber Move mı / benzeri mi? Kapsam (dashboard mı tümü mü)?
2. **(2)** Dashboard tedarikçi kısmında ne bozuk?
3. **(3)** "Proje Haber" nedir, API var mı?
4. **(4)** % gösterge tedarikçiye mi (mantıken evet)?
5. **(5/30)** Yurtiçi teslim kaç seçenek; gümrük teslim uluslararasıya mı?
6. **(6)** Rothern ID — kim kimi ekliyor, ne yapıyor?
7. **(12/14)** Fatura no tek aşama = "Hazırlanıyor" (tedarikçi) onaylanıyor mu?
8. **(15)** PDF indirmede ne hatası?
9. **(16)** Ödeme şartını (önce/sonra) kim belirliyor?
10. **(28)** Tasarruf = (en yüksek − en düşük) mü (en yüksek − kazanan) mı?
11. **(33)** Teminat mektubunu kim/ne zaman veriyor?

---

## Çalışma Grupları (aynı koda iki kez girmemek için — alan bazlı)

> Her grup = tek bir çalışma pass'i. **⟳** = çapraz kesen madde (birden fazla gruba değer; o alanı açınca birlikte yapılır).

### G1 — Görünüm / UI
- 1 (font/dashboard), 2 (dashboard tedarikçi kısmı), 18 (tedarikçi satın alma talepleri alt alta)
- ⟳ 23 (onay ekranı netliği — G7 ile)

### G2 — Satın Alma Talebi oluşturma (wizard + tender model)
- 7 (şablonlar), 5 (yurtiçi teslim şekilleri)
- ⟳ 30 (yurtiçi/uluslararası seçimi + teslim şekli + konşimento alanı — G5/G11 ile)
- ⟳ 4 (kapalı zarf / açık eksiltme **mod seçimi** — G3 ile)
- ⟳ 33 (nakit → teminat mektubu **uyarısı** — G8 ile)
- ⟳ 22 (satın alma talebi onayı kaldır — G7 ile)
- 3 (Proje Haber arama — bağımsız, istersen ayrı)
- 9 (zorunlu soru bug — G4 ile)

### G3 — Açık eksiltme runtime (canlı yarış)
- ⟳ 4 (anonimlik + % gösterge + fiyat görünürlüğü), 17 (uzama süresi alıcı seçer)

### G4 — Teklif verme (tedarikçi teklif formu)
- 8 (teslim süresi zorunlu), 10 (geçerlilik süresi), 9 (zorunlu soru bug)

### G5 — Sipariş ekranı (BÜYÜK — hepsi tek seferde)
- 11 (hesap sahibi/IBAN zorunlu + fatura kesim tarihi kaldır), 12 (fatura no),
  13 (alıcı iptal kaldır), 14 (hazırlanıyor + fatura no + irsaliye),
  15 (PDF indirme), 19 (Dosyalar başlığı), 21 (proforma/teknik/fatura/irsaliye + alıcı imzalı)
- ⟳ 16 (ödeme bölümü gösterimi/sıralama — G8 ile)
- ⟳ 30 (konşimento — uluslararası sipariş belgesi)
- ⟳ 33 (teminat mektubu **enforcement** — G8 ile)
- ⟳ 11 (banka bilgisi — G6 ile)

### G6 — Tedarikçi banka & rol
- 20 (Kayıtlı Bankalarım + tek "yönetici" rolü)
- ⟳ 11 (sipariş onayında bankayı otomatik seçme — G5 ile)

### G7 — Onay sistemi (tek pass)
- 22 (satın alma talebi onayı kaldır), 23 (netleştir), 24 (bekleyen onay bug), 25 (çift onay sıralı bug)

### G8 — Ödeme & Escrow
- 16 (direkt nakit/çek + teslim öncesi/sonrası sıralama), 33 (teminat mektubu enforcement),
  31 (uluslararası escrow %3), 32 (yurtiçi escrow)

### G9 — Tedarikçi profil & KYC belgeleri
- 26 (ISO belgesi), 27 (alıcı profilinden gelen + premium ek belgeler)

### G10 — Kimlik & bağlantı
- 6 (Rothern ID)

### G11 — Uluslararası / kayıt
- 29 (TR dışı kayıt + doğrulama)
- ⟳ 30 (uluslararası satın alma talebi — G2), ⟳ 31 (uluslararası escrow — G8)

### G12 — Raporlama
- 28 (tasarruf raporu)

### Çapraz kesen maddeler (birden çok yerde — birlikte yapılacak)
| Madde | Gruplar |
|---|---|
| 4 | G2 (mod seçimi) + G3 (görünürlük) |
| 11 | G5 (form) + G6 (banka) |
| 16 | G5 (gösterim) + G8 (mantık) |
| 23 | G1 (UI) + G7 (onay) |
| 30 | G2 (satın alma talebi) + G5 (konşimento) + G11 (uluslararası) |
| 33 | G2 (uyarı) + G5/G8 (enforcement) |
