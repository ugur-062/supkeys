/**
 * V2-6.5 — KOBİ inşaat/elektrik/iskele için custom Level 2 + Level 3
 * kategori detaylandırma. Mal & Ekipman tarafına eklenir (Hizmetler hariç).
 *
 * Strateji:
 * - UNSPSC standardının boş slot'larına ekleme (XXXX 90+ aralığı).
 * - Idempotent: code unique check, mevcutsa skip.
 * - Yeni Family altında 4-8 Class. Commodity (Level 4) eklenmez —
 *   kullanıcı detay görebilir, ileride domain doğrulaması sonrası
 *   Level 4 eklenir.
 *
 * Kullanım:
 *   pnpm --filter @supkeys/db seed-custom-categories
 *   (Çalıştırma sonrası modal cache temizleyip yenile.)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface CustomCategory {
  code: string;
  level: 2 | 3;
  nameTr: string;
  parentCode: string;
}

/* eslint-disable prettier/prettier */
const CUSTOM_CATEGORIES: CustomCategory[] = [
  // ═══════════════════════════════════════════════════════════════════
  // SEGMENT 22 — İnşaat Makineleri (mevcut 4 satır → çok zayıf)
  // ═══════════════════════════════════════════════════════════════════
  { code: "22900000", level: 2, nameTr: "Toprak İşleme Makineleri", parentCode: "22000000" },
  { code: "22900100", level: 3, nameTr: "Ekskavatör (Paletli)", parentCode: "22900000" },
  { code: "22900200", level: 3, nameTr: "Lastik Tekerlekli Yükleyici (Loader)", parentCode: "22900000" },
  { code: "22900300", level: 3, nameTr: "Mini Ekskavatör", parentCode: "22900000" },
  { code: "22900400", level: 3, nameTr: "Dozer", parentCode: "22900000" },
  { code: "22900500", level: 3, nameTr: "Greyder", parentCode: "22900000" },
  { code: "22900600", level: 3, nameTr: "Beko Loader", parentCode: "22900000" },

  { code: "22910000", level: 2, nameTr: "Yol ve Asfalt Makineleri", parentCode: "22000000" },
  { code: "22910100", level: 3, nameTr: "Silindir (Asfalt/Toprak)", parentCode: "22910000" },
  { code: "22910200", level: 3, nameTr: "Asfalt Finişeri", parentCode: "22910000" },
  { code: "22910300", level: 3, nameTr: "Asfalt Mikseri", parentCode: "22910000" },
  { code: "22910400", level: 3, nameTr: "Yol Çizgi Makinesi", parentCode: "22910000" },

  { code: "22920000", level: 2, nameTr: "Beton Üretim ve Pompalama", parentCode: "22000000" },
  { code: "22920100", level: 3, nameTr: "Beton Mikseri (Sahada)", parentCode: "22920000" },
  { code: "22920200", level: 3, nameTr: "Hazır Beton Kamyonu (Transmikser)", parentCode: "22920000" },
  { code: "22920300", level: 3, nameTr: "Beton Pompası (Mobil)", parentCode: "22920000" },
  { code: "22920400", level: 3, nameTr: "Beton Santrali (Sabit)", parentCode: "22920000" },
  { code: "22920500", level: 3, nameTr: "Beton Vibratörü", parentCode: "22920000" },

  { code: "22930000", level: 2, nameTr: "Vinç ve Kaldırma Ekipmanları", parentCode: "22000000" },
  { code: "22930100", level: 3, nameTr: "Kule Vinç", parentCode: "22930000" },
  { code: "22930200", level: 3, nameTr: "Mobil Vinç (Kamyon Tipi)", parentCode: "22930000" },
  { code: "22930300", level: 3, nameTr: "Paletli Vinç", parentCode: "22930000" },
  { code: "22930400", level: 3, nameTr: "Monoray Vinç", parentCode: "22930000" },
  { code: "22930500", level: 3, nameTr: "Telesik Vinç (Truck Mounted)", parentCode: "22930000" },

  { code: "22940000", level: 2, nameTr: "Kalıp Sistemleri", parentCode: "22000000" },
  { code: "22940100", level: 3, nameTr: "Çelik Kalıp (Modüler)", parentCode: "22940000" },
  { code: "22940200", level: 3, nameTr: "Panel Kalıp (Ahşap/Kompozit)", parentCode: "22940000" },
  { code: "22940300", level: 3, nameTr: "Tünel Kalıp", parentCode: "22940000" },
  { code: "22940400", level: 3, nameTr: "Kayar Kalıp", parentCode: "22940000" },
  { code: "22940500", level: 3, nameTr: "Plywood (Film Kaplı Kalıp Tahtası)", parentCode: "22940000" },

  // ═══════════════════════════════════════════════════════════════════
  // SEGMENT 30 — İnşaat ve Yapı Malzemeleri (mevcut 11 family + ekler)
  // ═══════════════════════════════════════════════════════════════════
  { code: "30900000", level: 2, nameTr: "İskele Sistemleri", parentCode: "30000000" },
  { code: "30900100", level: 3, nameTr: "Cephe İskelesi (Modüler)", parentCode: "30900000" },
  { code: "30900200", level: 3, nameTr: "İç İskele / Kalıp İskelesi", parentCode: "30900000" },
  { code: "30900300", level: 3, nameTr: "Asma İskele", parentCode: "30900000" },
  { code: "30900400", level: 3, nameTr: "Mobil İskele Kulesi", parentCode: "30900000" },
  { code: "30900500", level: 3, nameTr: "İskele Boru, Dirsek ve Klemens", parentCode: "30900000" },
  { code: "30900600", level: 3, nameTr: "İskele Platform Tahta / Kalas", parentCode: "30900000" },
  { code: "30900700", level: 3, nameTr: "Güvenlik Ağı ve Kenar Koruma", parentCode: "30900000" },
  { code: "30900800", level: 3, nameTr: "İskele Merdiveni ve Ayak Plakası", parentCode: "30900000" },

  { code: "30910000", level: 2, nameTr: "Çelik Konstrüksiyon Profilleri", parentCode: "30000000" },
  { code: "30910100", level: 3, nameTr: "HEA / HEB Profil", parentCode: "30910000" },
  { code: "30910200", level: 3, nameTr: "IPE / IPN Profil", parentCode: "30910000" },
  { code: "30910300", level: 3, nameTr: "Köşebent (L Profil)", parentCode: "30910000" },
  { code: "30910400", level: 3, nameTr: "Çelik Boru ve Kutu Profil", parentCode: "30910000" },
  { code: "30910500", level: 3, nameTr: "U Profil ve T Profil", parentCode: "30910000" },
  { code: "30910600", level: 3, nameTr: "Sac (Galvaniz/Siyah/Trapez)", parentCode: "30910000" },
  { code: "30910700", level: 3, nameTr: "Kafes Sistem ve Makas Bileşenleri", parentCode: "30910000" },

  { code: "30920000", level: 2, nameTr: "Beton ve Harç Malzemeleri", parentCode: "30000000" },
  { code: "30920100", level: 3, nameTr: "Hazır Beton (C20/25, C30/37 vb.)", parentCode: "30920000" },
  { code: "30920200", level: 3, nameTr: "Çimento (CEM I, CEM II, CEM III)", parentCode: "30920000" },
  { code: "30920300", level: 3, nameTr: "Kireç ve Alçı", parentCode: "30920000" },
  { code: "30920400", level: 3, nameTr: "Harç (Yapıştırıcı, Tamir, Şap)", parentCode: "30920000" },
  { code: "30920500", level: 3, nameTr: "Beton Katkı Malzemeleri", parentCode: "30920000" },
  { code: "30920600", level: 3, nameTr: "Donatı Çeliği (Nervürlü Demir)", parentCode: "30920000" },
  { code: "30920700", level: 3, nameTr: "Hasır Çelik", parentCode: "30920000" },

  { code: "30930000", level: 2, nameTr: "Yangın Güvenliği Ekipmanları", parentCode: "30000000" },
  { code: "30930100", level: 3, nameTr: "Yangın Söndürücü Cihaz", parentCode: "30930000" },
  { code: "30930200", level: 3, nameTr: "Yangın Algılama Sistemleri", parentCode: "30930000" },
  { code: "30930300", level: 3, nameTr: "Sprinkler ve Yangın Pompası", parentCode: "30930000" },
  { code: "30930400", level: 3, nameTr: "Yangın Kapısı ve Dolabı", parentCode: "30930000" },
  { code: "30930500", level: 3, nameTr: "Yangın Hortumu ve Lansı", parentCode: "30930000" },

  // ═══════════════════════════════════════════════════════════════════
  // SEGMENT 39 — Elektrik ve Aydınlatma (mevcut 4 family → çok zayıf)
  // ═══════════════════════════════════════════════════════════════════
  { code: "39900000", level: 2, nameTr: "Pano ve Dağıtım Sistemleri", parentCode: "39000000" },
  { code: "39900100", level: 3, nameTr: "AG (Alçak Gerilim) Panosu", parentCode: "39900000" },
  { code: "39900200", level: 3, nameTr: "OG (Orta Gerilim) Panosu", parentCode: "39900000" },
  { code: "39900300", level: 3, nameTr: "MCC (Motor Kontrol) Panosu", parentCode: "39900000" },
  { code: "39900400", level: 3, nameTr: "Sayaç ve Ölçü Panosu", parentCode: "39900000" },
  { code: "39900500", level: 3, nameTr: "Outdoor Pano (IP65+, Saha)", parentCode: "39900000" },
  { code: "39900600", level: 3, nameTr: "ATS (Otomatik Transfer) Panosu", parentCode: "39900000" },
  { code: "39900700", level: 3, nameTr: "UPS / Kesintisiz Güç Panosu", parentCode: "39900000" },

  { code: "39910000", level: 2, nameTr: "Şalt ve Koruma Elemanları", parentCode: "39000000" },
  { code: "39910100", level: 3, nameTr: "MCCB (Kompakt Güç Şalteri)", parentCode: "39910000" },
  { code: "39910200", level: 3, nameTr: "MCB (Mini Otomatik Şalter)", parentCode: "39910000" },
  { code: "39910300", level: 3, nameTr: "Kaçak Akım Rölesi (RCD/RCBO)", parentCode: "39910000" },
  { code: "39910400", level: 3, nameTr: "Kontaktör", parentCode: "39910000" },
  { code: "39910500", level: 3, nameTr: "Termik Aşırı Yük Rölesi", parentCode: "39910000" },
  { code: "39910600", level: 3, nameTr: "Faz Koruma Rölesi", parentCode: "39910000" },
  { code: "39910700", level: 3, nameTr: "Parafudr (Ani Akım Koruma)", parentCode: "39910000" },
  { code: "39910800", level: 3, nameTr: "Sigorta Otomatı (Bıçaklı/NH)", parentCode: "39910000" },

  { code: "39920000", level: 2, nameTr: "Otomasyon ve Kontrol Sistemleri", parentCode: "39000000" },
  { code: "39920100", level: 3, nameTr: "PLC Modülü ve Genişleme Kartı", parentCode: "39920000" },
  { code: "39920200", level: 3, nameTr: "HMI Panel (Dokunmatik)", parentCode: "39920000" },
  { code: "39920300", level: 3, nameTr: "Frekans İnverter (VFD)", parentCode: "39920000" },
  { code: "39920400", level: 3, nameTr: "Servo / Step Motor Sürücü", parentCode: "39920000" },
  { code: "39920500", level: 3, nameTr: "Soft Starter (Yumuşak Yol Verici)", parentCode: "39920000" },
  { code: "39920600", level: 3, nameTr: "Zaman Rölesi ve Sayıcı", parentCode: "39920000" },
  { code: "39920700", level: 3, nameTr: "SCADA Uzaktan İzleme Modülü", parentCode: "39920000" },

  { code: "39930000", level: 2, nameTr: "Reaktif Güç Kompanzasyon", parentCode: "39000000" },
  { code: "39930100", level: 3, nameTr: "Kompanzasyon Rölesi", parentCode: "39930000" },
  { code: "39930200", level: 3, nameTr: "Şönt Kapasitör (Reaktif)", parentCode: "39930000" },
  { code: "39930300", level: 3, nameTr: "Harmonik Filtre", parentCode: "39930000" },
  { code: "39930400", level: 3, nameTr: "Reaktif Şönt Bobin", parentCode: "39930000" },

  { code: "39940000", level: 2, nameTr: "Ölçü Trafoları ve Sayaçlar", parentCode: "39000000" },
  { code: "39940100", level: 3, nameTr: "Akım Transformatörü (AT)", parentCode: "39940000" },
  { code: "39940200", level: 3, nameTr: "Gerilim Transformatörü (GT)", parentCode: "39940000" },
  { code: "39940300", level: 3, nameTr: "Enerji Analizörü (Network Analyzer)", parentCode: "39940000" },
  { code: "39940400", level: 3, nameTr: "Elektronik Sayaç (Üç Fazlı)", parentCode: "39940000" },
  { code: "39940500", level: 3, nameTr: "Ampermetre ve Voltmetre (Analog)", parentCode: "39940000" },

  { code: "39950000", level: 2, nameTr: "Topraklama ve Yıldırım Koruma", parentCode: "39000000" },
  { code: "39950100", level: 3, nameTr: "Bakır Topraklama Şeridi", parentCode: "39950000" },
  { code: "39950200", level: 3, nameTr: "Topraklama Çubuğu (Kovan/Bakır)", parentCode: "39950000" },
  { code: "39950300", level: 3, nameTr: "Paratoner ve İndirme İletkeni", parentCode: "39950000" },
  { code: "39950400", level: 3, nameTr: "Eşpotansiyel Bara", parentCode: "39950000" },
  { code: "39950500", level: 3, nameTr: "Topraklama Direnci Ölçüm Cihazı", parentCode: "39950000" },

  // ═══════════════════════════════════════════════════════════════════
  // SEGMENT 32 — Elektronik Bileşenler (mevcut 23 satır + sensör ek)
  // ═══════════════════════════════════════════════════════════════════
  { code: "32900000", level: 2, nameTr: "Sensörler ve Algılayıcılar", parentCode: "32000000" },
  { code: "32900100", level: 3, nameTr: "Yaklaşım Sensörü (İndüktif/Kapasitif)", parentCode: "32900000" },
  { code: "32900200", level: 3, nameTr: "Sıcaklık Sensörü (PT100, NTC, K-Tipi)", parentCode: "32900000" },
  { code: "32900300", level: 3, nameTr: "Basınç Sensörü", parentCode: "32900000" },
  { code: "32900400", level: 3, nameTr: "Optik Sensör / Fotoselektör", parentCode: "32900000" },
  { code: "32900500", level: 3, nameTr: "Encoder (Mutlak/Artımlı)", parentCode: "32900000" },
  { code: "32900600", level: 3, nameTr: "Limit Switch (Sınır Anahtarı)", parentCode: "32900000" },
];
/* eslint-enable prettier/prettier */

async function main() {
  console.log(
    `🌱 Custom kategori seed başlıyor (${CUSTOM_CATEGORIES.length} kayıt)\n`,
  );

  // 1) Parent code'lardan id'leri çek (segment + yeni family'ler)
  const parentCodes = Array.from(
    new Set(CUSTOM_CATEGORIES.map((c) => c.parentCode)),
  );
  const existingParents = await prisma.category.findMany({
    where: { code: { in: parentCodes } },
    select: { id: true, code: true },
  });
  const codeToId = new Map<string, string>();
  for (const p of existingParents) codeToId.set(p.code, p.id);

  // 2) Custom kategorilerin kendileri de parent olabilir (Level 2 family →
  //    Level 3 class). Önce Level 2'leri ekle, sonra Level 3'ler.
  const families = CUSTOM_CATEGORIES.filter((c) => c.level === 2);
  const classes = CUSTOM_CATEGORIES.filter((c) => c.level === 3);

  let inserted = 0;
  let skipped = 0;

  // 3) Family'leri insert (idempotent)
  console.log(`[1/2] Family (Level 2) ekleniyor: ${families.length} adet`);
  for (const fam of families) {
    const existing = await prisma.category.findUnique({
      where: { code: fam.code },
    });
    if (existing) {
      codeToId.set(fam.code, existing.id);
      skipped++;
      continue;
    }
    const parentId = codeToId.get(fam.parentCode);
    if (!parentId) {
      console.warn(`  ⚠️  Parent bulunamadı: ${fam.parentCode} (atlandı: ${fam.code})`);
      continue;
    }
    // sortOrder: 90+ ile başlat ki mevcut family'lerin sonuna eklensin
    const sortOrder = 900 + parseInt(fam.code.slice(2, 4), 10);
    const created = await prisma.category.create({
      data: {
        code: fam.code,
        nameTr: fam.nameTr,
        level: 2,
        parentId,
        sortOrder,
        isActive: true,
      },
    });
    codeToId.set(fam.code, created.id);
    inserted++;
    console.log(`  ✅ ${fam.code}  ${fam.nameTr}`);
  }

  // 4) Class'ları insert (idempotent)
  console.log(`\n[2/2] Class (Level 3) ekleniyor: ${classes.length} adet`);
  let classInserted = 0;
  let classSkipped = 0;
  for (const cls of classes) {
    const existing = await prisma.category.findUnique({
      where: { code: cls.code },
    });
    if (existing) {
      classSkipped++;
      continue;
    }
    const parentId = codeToId.get(cls.parentCode);
    if (!parentId) {
      console.warn(`  ⚠️  Parent bulunamadı: ${cls.parentCode} (atlandı: ${cls.code})`);
      continue;
    }
    const sortOrder = parseInt(cls.code.slice(6, 8), 10);
    await prisma.category.create({
      data: {
        code: cls.code,
        nameTr: cls.nameTr,
        level: 3,
        parentId,
        sortOrder,
        isActive: true,
      },
    });
    classInserted++;
  }

  console.log(`\n📊 Özet:`);
  console.log(`   Family: ${inserted} eklendi, ${skipped} zaten vardı (atlandı)`);
  console.log(
    `   Class:  ${classInserted} eklendi, ${classSkipped} zaten vardı (atlandı)`,
  );

  const totalActive = await prisma.category.count({ where: { isActive: true } });
  console.log(`\n✅ Toplam aktif kategori: ${totalActive}`);
}

main()
  .catch((e) => {
    console.error("❌ seed-custom-categories hatası:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
