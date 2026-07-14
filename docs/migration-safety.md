# Güvenli Migration Kontrol Listesi

Bu dosya, `packages/db/prisma/migrations/` altına eklenen HER yeni migration'dan
önce okunmalıdır. Amaç: veri kaybı, deploy-kırılması ve prod'da downtime/kilit
yaratan desenleri en baştan önlemek.

Kaynak: 2026-07-14 migration-güvenlik denetimi (21 migration + şema taraması).

---

## Önce iki temel not

### Not 1 — Lossy drop örneği (kabul edildi, ama ders somut)
`20260713150000_payment_plan_model/migration.sql:25-26` — `paymentTerm` kolonu ve
`ListingPaymentTerm` enum'ı kalıcı silindi; backfill kayıplı (`CASH + AFTER_DELIVERY
→ OPEN_ACCOUNT`, "Peşin'e eşlenemez").

**Bu veri kaybı iş açısından KABUL EDİLDİ — sorun değil.** Listede kalma sebebi:
"gelecekte lossy drop'u **expand→migrate→contract** ile böl" dersinin somut
örneği olması. Yani ileride benzer bir kalıcı silme gerektiğinde, silmeyi aynı
migration'da yapmak yerine ayrı bir sonraki adıma ertele (aşağıdaki "Yıkıcı
işlemler" bölümü).

### Not 2 — Rollback stratejisi = PITR + snapshot (KURAL)
Migration'lar tek yönlüdür (`down.sql` yok, Prisma default). **Çözüm ayrı `down.sql`
yazmak DEĞİLDİR.**

**KURAL:** Rollback güvencesi Supabase **PITR (Point-in-Time Recovery)** + her prod
migration'ından ÖNCE alınan **snapshot** ile sağlanır. Hatalı/yıkıcı bir migration
sonrası dönüş yolu bu snapshot'tır.

- [ ] Prod'da PITR aktif olduğunu teyit et.
- [ ] Her prod `migrate deploy` ÖNCESİ snapshot al (özellikle DROP / tip-değişimi /
      durum-taşıma içeren migration'larda zorunlu).

---

## Kontrol listesi

### Yıkıcı işlemler (DROP / rename / lossy)
- [ ] DROP COLUMN/TYPE'ı **expand→migrate→contract** ile böl: önce yeni kolon +
      backfill (bir sürüm), silmeyi **sonraki** migration'a ertele. (Bkz. Not 1.)
- [ ] Silmeden önce eski değeri arşivle (`_legacy_*` kolon) veya snapshot al; lossy
      eşlemeyi migration yorumunda açıkça belgele.
- [ ] Kolon **rename** için drop+add değil, `RENAME COLUMN` kullan (veri korunur).

### NOT NULL / tip değişimi
- [ ] NOT NULL eklerken **daima** default ver veya önce backfill + `NOT VALID` CHECK.
- [ ] Tip daraltma/enum cast öncesi **ön-doğrulama sorgusu** çalıştır (geçersiz
      değer = 0 mı?). Örn. TEXT→enum cast tek geçersiz değerde tüm migration'ı
      patlatır (`20260709122237_order_currency_enum` deseni).

### Kilit / downtime
- [ ] Dolu tabloda index → `CREATE INDEX CONCURRENTLY` (ayrı, tx-dışı migration).
- [ ] UNIQUE index öncesi **dedup** adımı — aksi halde mevcut çift kayıt CREATE'i
      patlatır (`20260709122505_connection_unordered_unique` bunu düzeltirken tam
      da o veriye takılabilir).
- [ ] Büyük tabloda FK/CHECK → `ADD ... NOT VALID` + ayrı `VALIDATE CONSTRAINT`
      (kilit süresini kısaltır).
- [ ] Tablo-rewrite eden işlemler (enum cast, tip değişimi) için downtime penceresi
      planla.

### Enum
- [ ] `ALTER TYPE ... ADD VALUE`'yu, o değeri KULLANAN DML'den (`UPDATE`/`DEFAULT`)
      **ayrı migration'a** koy — aynı dosyada kullanım Prisma'nın tx-sarmalaması
      nedeniyle her PG sürümünde fail eder.
- [ ] Enum değeri **silme** — yapma (legacy olarak bırak); PG'de riskli.

### Genel süreç
- [ ] Rollback güvencesi = PITR + prod-öncesi snapshot (Not 2 — ayrı `down.sql`
      değil).
- [ ] Raw-SQL-only index/constraint eklerken **test şeması drift'ini** kapat:
      fonksiyonel index Prisma şemasında ifade edilemez → `db push` ile kurulan
      test şemasında YER ALMAZ; aynı DDL'i uygulayan bir post-`db push` setup
      script'i ekle (aksi halde invariant yalnız prod'da doğrulanır).
- [ ] Prod'da `migrate deploy` öncesi staging'de **gerçek veri kopyasıyla** dene.

---

## Güvenli sayılan desenler (teyit — engel değil)

Aşağıdakiler denetimde güvenli bulundu, tekrar sorgulamaya gerek yok:

- **NOT NULL + sabit DEFAULT** ekleme (PG11+): metadata-only, tablo rewrite/kilit
  yok.
- **Yeni (boş) tabloya CREATE INDEX**: kilit yok.
- **Backfill'in drop/kullanımdan ÖNCE** yazılması: doğru sıra.
- **FK yön düzeltmesi** CASCADE→RESTRICT: finansal kaydı korur, veri kaybı yok.
- **Enum `ADD VALUE`** (değeri aynı migration'da kullanmadan): PG12+/Supabase'de
  sorunsuz.
