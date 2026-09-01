# Plan — İlgi Motoru: Beyandan Davranışa

> **Durum:** TASLAK — onay bekliyor, kod yazılmadı.
> Talep: "firma çok fazla kategori seçip algoritmayı bozmasın; firmaların
> neye teklif verdiğini, hangi alanlarda ilgili olduğunu bulup ona göre
> karşısına çıkaralım. Bağlantılarda 'önerilen şirketler' olsun. E-ticaret
> sitesine girmiş gibi düşün."

---

## 1. Temel fikir

Bugün eşleşme **yalnız beyana** dayanıyor: firma kutu işaretliyor, sistem
o kutuya bakıyor. Beyan ucuzdur — istismar edilir, bayatlar, hiç güncellenmez.

**Davranış ucuz değildir.** Bir firma bir talebe teklif verdiyse fiyat
hesaplamış, taahhüt üretmiştir. Kazandıysa o işi gerçekten yapabilmiştir.
Bunlar taklit edilemeyen sinyaller.

Kural: **beyan bir ön kabuldür (prior), davranış onu ezer.**

Bu aynı zamanda "çok kategori seçip algoritmayı bozma" sorununun asıl
çözümü: 50 kategori işaretleyen firma, hiçbirinde davranış üretmediği için
üste çıkamaz. Kutu işaretlemek artık bedava bir avantaj değil.

---

## 2. Elimizde ne var

Canlı veritabanı (2026-09-01) — sinyallerin çoğu ZATEN kayıtlı:

| Sinyal | Kayıt | Güç | Not |
|--------|------:|-----|-----|
| **Kazandığı sipariş** | 15 | ★★★★★ | Kanıtlanmış yetkinlik |
| **Verdiği teklif** | 32 | ★★★★ | Para hesaplamış, taahhüt üretmiş |
| **Davet edildiği talep** | 15 | ★★★ | BAŞKASI onu uygun gördü |
| **Kalem kataloğu** | 0 (yeni) | ★★★★ | Firmanın kendi ürün beyanı — kutudan dürüst |
| **Bağlantıları** | 11 | ★★ | Kiminle iş yapıyor |
| **Yayınladığı talep** | 34 | ★★★★ | Alıcı tarafı ilgisi |
| Beyan edilen kategori | — | ★ | Ön kabul |
| Görüntüleme / arama | **YOK** | ★★ | Takip edilmiyor — Faz 3 |

Yani motorun yakıtının çoğu **bugün mevcut**; toplanmayan tek şey görüntüleme.

---

## 3. Firma İlgi Profili (`CompanyAffinity`)

Her firma × kategori için bir skor. Gece işi (cron) ile yeniden hesaplanır —
canlı sorguda ağırlık yaratmaz.

```
skor(firma, kategori) =
    5.0 × kazanılan sipariş sayısı
  + 3.0 × verilen teklif sayısı
  + 2.0 × davet edildiği talep sayısı
  + 2.0 × katalogdaki kalem sayısı
  + 1.5 × yayınladığı talep sayısı        (alıcı yönü)
  + 1.0 × beyan edilen kategori           (ön kabul)
```

Üstüne üç düzeltme:

**Zaman sönümü** — 18 ay yarılanma. İki yıl önce bir kez teklif verdiği alan
bugünkü uzmanlığını temsil etmez.

**Genişlik cezası (asıl istismar freni).** Firmanın toplam skoru sabit bir
bütçeye normalize edilir: 50 kategoriye yayılan firma her birinde zayıf, 3
kategoriye yoğunlaşan güçlü çıkar. Kutu işaretlemek **sıfır toplamlı** hâle
gelir — çok seçmek avantaj değil dezavantaj olur.

**Hiyerarşi sızması** — L4'te kazanılan skorun bir kısmı L3 ve L2 atasına
yayılır. Böylece "M12 civata" tedarikçisi "bağlantı elemanları" talebinde de
görünür; her emtiayı tek tek işaretlemek zorunda kalmaz.

---

## 4. Sıralama = ilgi × uygunluk × çeşitlilik

İlgi tek başına yetmez. Nihai sıra üç çarpandan oluşur:

1. **İlgi** — yukarıdaki skor
2. **Uygunluk** — teklif verebilir mi? (paket, ülke kapsamı, blok, kapalı
   zarf, embargo). Uygun değilse **listeye hiç girmez** — mevcut
   `listing-visibility` tek kaynağı burada da geçerli.
3. **Çeşitlilik / keşif** — sonuçların **%20'si yeni ya da az görünmüş
   firmalara** ayrılır.

Üçüncüsü isteğe bağlı bir süs değil. Salt skorla sıralarsan **zengin daha
zengin olur**: ilk kazanan hep önerilir, hep kazanır, yeni tedarikçi asla
görünmez. Pazar yeri o noktada kapalı bir kulübe döner ve alıcı da kaybeder
(rekabet azalır). Keşif kotası bunu yapısal olarak engeller.

---

## 5. Yüzeyler — "e-ticaret gibi"

| Yüzey | Ne gösterir | Kaynak |
|-------|-------------|--------|
| **Satış panosu → "Size uygun talepler"** | Açık talepler, ilgiye göre sıralı, "neden size gösterildi" ibaresiyle | ilgi × uygunluk |
| **Bağlantılar → "Önerilen firmalar"** | Bugün ham `hasSome` + strong/weak; ilgi skoruna geçer | ilgi + ortak bağlantı |
| **Talep açarken → "Bu talebe uygun tedarikçiler"** | Alıcıya davet önerisi (sihirbaz Davetliler adımı) | talep kategorileri × tedarikçi ilgisi |
| **Bildirim eşiği** | Yüksek ilgi → anlık; düşük → haftalık özet | ilgi skoru |
| **Talep detayı → "Benzer talepler"** | Aynı kategori komşuluğu | kategori mesafesi |

**"Neden gösterildi" her yerde yazılmalı** — *"Bu alanda 4 teklif verdiniz"*,
*"Katalogunuzda benzer kalem var"*. Kara kutu öneri B2B'de güven kaybettirir;
kullanıcı sistemin kendisini neden çağırdığını anlamalı. Ayrıca kendi
profilini düzeltmesi için de en iyi geri bildirim budur.

---

## 6. Bugünkü bildirim gürültüsü

Şu an yeni talep, o segmenti işaretleyen **herkese** bildirim gönderiyor —
38 kova, yani neredeyse rastgele. Kullanıcı 5. alakasız bildirimden sonra
bildirimleri kapatıyor ve ürün orada **sessizce işlevini yitiriyor**.

İlgi skoru bunu doğrudan düzeltir: eşik üstü anlık, altı özet. Bu tek
değişiklik, motorun ilk somut faydası.

---

## 7. Faz sırası

```
Faz 1  Beyanı derinleştir      → firma alt kategorisi (onboarding + profil)
                                  + tavan (50) + genişlik cezasının zemini
Faz 2  CompanyAffinity tablosu → gece cron, mevcut sinyallerden hesap
                                  (sipariş/teklif/davet/katalog/talep)
Faz 3  Sıralama + yüzeyler     → "size uygun talepler", "önerilen firmalar",
                                  bildirim eşiği, "neden gösterildi"
Faz 4  Eksik sinyalleri topla  → görüntüleme + arama izleri (yeni tablo),
                                  sonuçsuz arama kürasyon kuyruğu
```

**Faz 1 + 2 birlikte anlamlı**: derin beyan olmadan davranış sinyali
seyrek kalır; davranış olmadan derin beyan istismara açık.

Faz 4 en sona bırakıldı çünkü görüntüleme takibi yeni veri toplama demek
(KVKK açısından da ayrı düşünülmeli — firma bazında toplanır, kişi bazında
DEĞİL).

---

## 8. Riskler

| Risk | Karşılık |
|------|----------|
| **Zengin daha zengin** | %20 keşif kotası + yeni firmaya başlangıç görünürlüğü |
| Soğuk başlangıç (yeni firma, sıfır davranış) | Beyan ön kabulü + keşif kotası taşır |
| Firma 50 kategori işaretler | Genişlik cezası: toplam skor bütçesi sabit → yayıldıkça zayıflar |
| Skor bayatlar | 18 ay yarılanma + gece yeniden hesap |
| Kara kutu güvensizliği | "Neden gösterildi" her öneride zorunlu |
| Hesap maliyeti | Gece cron + tabloya yaz; canlı sorgu yalnız OKUR |
| KVKK (Faz 4) | Görüntüleme FİRMA bazında toplanır, kullanıcı bazında değil |

---

## 9. Açık sorular

1. Alt kategori tavanı 50 uygun mu?
2. Keşif kotası %20 mi olsun — yoksa daha agresif mi (pazar yeri yeni)?
3. Görüntüleme takibi (Faz 4) isteniyor mu, yoksa mevcut sinyaller yeterli mi?
4. "Size uygun talepler" satış panosunda ayrı bir blok mu, yoksa mevcut
   "Açık Talepler" listesinin sıralaması mı değişsin?


---

## 10. Uygulama durumu (2026-09-01)

| Faz | Durum |
|-----|-------|
| Faz 1 — beyanı derinleştir | ✅ alt kategori (onboarding+profil, tavan 50) + faaliyet tipi ekseni |
| Faz 2 — CompanyAffinity | ✅ tablo + gece cron (03:20) + boot yakalaması (yalnız boşsa) |
| Faz 3 — sıralama + yüzeyler | ✅ bildirim eşiği · açık talepler sıralaması · "neden gösterildi" · önerilen firmalar · %20 keşif kotası |
| Faz 4 — görüntüleme izleri | ⏳ yapılmadı (KVKK ayrı düşünülmeli; mevcut sinyaller yeterli görüldü) |

### Açık soruların cevapları
1. **Alt kategori tavanı 50** — kaldı. Asıl fren tavan değil GENİŞLİK CEZASI:
   skor sabit bütçeye normalize, yayıldıkça zayıflıyor. Tavan yalnız payload
   koruması.
2. **Keşif kotası %20** — planın önerisi uygulandı. Genç pazarda daha agresif
   olabilir; kota tek sabitte (`QUOTA`) durduğu için değiştirmek tek satır.
3. **Görüntüleme takibi** — yapılmadı. Mevcut beş sinyal (sipariş/teklif/davet/
   katalog/ilan) profili doldurmaya yetiyor.
4. **"Size uygun talepler"** — AYRI blok açılmadı; mevcut "Açık Talepler"
   listesinin SIRALAMASI değişti. Gerekçe: kullanıcının zaten baktığı yeri
   düzeltmek, bakmadığı yeni bir blok eklemekten etkili.

### Uygulamada eklenen iki koruma (planda yoktu)
- **Bildirim eşiği KOŞULLU**: eşiği geçen yeterince firma yoksa kimse elenmez.
  Genç pazarda skorların çoğu beyandan gelir; sert eşik duyuruyu tamamen
  susturur ve bu gürültüden kötüdür.
- **İlgi motoru @Optional**: servis yoksa/okunamıyorsa liste ve bildirim eski
  davranışa döner. Bir istatistik katmanı yüzünden iş akışı durmamalı.

### İlgi, merdivenin YERİNE geçmez
Açık talepler sıralamasında öncelik merdiveni (davetli > bağlantılı > kategori)
korundu; ilgi yalnız kategori kademesinin İÇİNDE kırıcı. Aksi hâlde "beni özel
çağıran" bir talep, o kategorideki skorum düşük diye aşağı düşerdi.
İstemci tarafında ilgi KABA KADEMEYE çevrilir (güçlü/ilgili/gerisi) — ham
skorla sıralamak kullanıcının seçtiği sıralamayı (en yeni / kapanışa göre)
tamamen ezerdi.
