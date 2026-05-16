/**
 * V2-6.5 — Kategori temizliği (KOBİ inşaat/elektrik/iskele odaklı).
 *
 * UNSPSC tree'sinden alakasız segment'leri soft-delete (`isActive=false`) eder
 * ve TUT listesindeki segment'lerin `nameTr`'sini Türkçe sadeleştirilmiş
 * şekilde günceller. Idempotent — tekrar çalıştırılabilir.
 *
 * Kullanım:
 *   pnpm --filter @supkeys/db cleanup-categories              # dry-run (varsayılan)
 *   pnpm --filter @supkeys/db cleanup-categories -- --apply   # DB'ye yaz
 *
 * Tasarım kararları:
 * - Hard delete YOK. Mevcut tender/supplier kategori bağlantıları korunur;
 *   `isActive=false` ile UI'da görünmezler (chip listede süzülür).
 * - Sadece Segment (level 1) seviyesinde HIDE kararı verilir. Bir segment
 *   gizlendiğinde tüm descendant'ları (family + class + commodity) otomatik
 *   olarak gizlenir (recursive).
 * - RENAME sadece segment seviyesinde (üst başlık). Alt seviyeler
 *   UNSPSC standardı kalır (referans uyumluluğu).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * KOBİ inşaat / elektrik pano / iskele / metal-elektromekanik imalat
 * dikeylerinde anlamsız olan segment kodları. UNSPSC 2-haneli prefix +
 * "000000" formatında.
 */
const HIDE_SEGMENT_CODES = [
  "10000000", // Canlı Bitki ve Hayvan Materyalleri (tarım)
  "20000000", // Madencilik Makineleri
  "21000000", // Tarım ve Balıkçılık Makineleri
  "42000000", // Tıbbi Ekipmanlar
  "45000000", // Baskı, Fotoğraf, Ses ve Görsel
  "46000000", // Savunma, Kolluk Kuvvetleri Ekipmanları
  "48000000", // Hizmet Sektörü Makineleri (turizm/otel)
  "49000000", // Spor ve Eğlence Ekipmanları
  "50000000", // Gıda, İçecek ve Tütün
  "51000000", // İlaç ve Farmasötik
  "52000000", // Ev Aletleri ve Tüketici Elektroniği
  "54000000", // Saat, Mücevher ve Değerli Taş
  "55000000", // Yayınlanmış Ürünler
  "60000000", // Müzik Aletleri, Oyunlar, Oyuncaklar
  "70000000", // Tarım, Balıkçılık Hizmetleri
  "71000000", // Madencilik ve Petrol/Gaz Hizmetleri
  "80000000", // Yönetim ve İşletme Profesyonelleri (idari hizmetler)
  "82000000", // Editörlük, Tasarım, Grafik
  "83000000", // Kamu Hizmetleri ve Kamu Sektörü
  "84000000", // Finansal ve Sigorta Hizmetleri
  "86000000", // Eğitim ve Öğretim Hizmetleri
  "90000000", // Kafeterya/Seyahat/Konaklama/Eğlence
  "91000000", // Kişisel ve Ev Hizmetleri
  "92000000", // Ulusal Savunma, Kamu Düzeni
  "93000000", // Siyaset ve Sivil İşler
  "94000000", // Organizasyonlar ve Kulüpler
  "95000000", // Arazi, Binalar, Yapılar ve Yollar (emlak)
];

/**
 * Tutulacak segment'lerin Türkçe sadeleştirilmiş isimleri. UNSPSC orijinal
 * isimleri çok uzun ve teknik — KOBİ kullanıcı için kısa ve hedef-odaklı.
 */
const RENAME_MAP: Record<string, string> = {
  "11000000": "Hammadde: Metal, Taş, Tekstil",
  "12000000": "Kimyasallar ve Endüstriyel Gazlar",
  "13000000": "Polimer ve İzolasyon Malzemeleri",
  "14000000": "Kağıt Sarf Malzemeleri",
  "15000000": "Yakıt ve Yağlayıcılar",
  "22000000": "İnşaat Makineleri",
  "23000000": "İmalat Makineleri (Tezgah, Frezeleme, Kaynak)",
  "24000000": "Vinç, Forklift ve Depolama Sistemleri",
  "25000000": "Ticari ve Özel Araçlar",
  "26000000": "Güç Üretim Sistemleri (Jeneratör, Trafo)",
  "27000000": "El Aletleri ve Genel Makineler",
  "30000000": "İnşaat ve Yapı Malzemeleri",
  "31000000": "İmalat Bileşenleri ve Sarf",
  "32000000": "Elektronik Bileşenler",
  "39000000": "Elektrik ve Aydınlatma",
  "40000000": "Tesisat ve HVAC",
  "41000000": "Laboratuvar ve Ölçüm Cihazları",
  "43000000": "Bilgi Teknolojisi ve Telekom",
  "44000000": "Ofis Ekipmanları ve Sarf",
  "47000000": "Temizlik Ekipmanları ve Sarf",
  "53000000": "İş Kıyafetleri ve KKD",
  "56000000": "Mobilya ve Mefruşat",
  "72000000": "İnşaat ve Bakım Hizmetleri",
  "73000000": "Fason Üretim ve İmalat Hizmetleri",
  "76000000": "Endüstriyel Temizlik Hizmetleri",
  "77000000": "Çevre ve Atık Yönetimi Hizmetleri",
  "78000000": "Nakliye ve Lojistik Hizmetleri",
  "81000000": "Mühendislik ve Danışmanlık Hizmetleri",
  "85000000": "OSGB ve Sağlık Hizmetleri",
};

interface CatRow {
  id: string;
  code: string;
  level: number;
  parentId: string | null;
  isActive: boolean;
  nameTr: string;
}

async function main() {
  const isApply = process.argv.includes("--apply");
  console.log(
    isApply
      ? "🔧 APPLY mod — değişiklikler DB'ye yazılacak"
      : "🔍 DRY-RUN mod (DB'ye yazılmıyor — --apply ile uygula)",
  );
  console.log("");

  // Tüm aktif kategorileri tek seferde al, in-memory traverse
  const all: CatRow[] = await prisma.category.findMany({
    select: {
      id: true,
      code: true,
      level: true,
      parentId: true,
      isActive: true,
      nameTr: true,
    },
  });

  // parentId → children mapping (ID listesi)
  const childrenMap = new Map<string, string[]>();
  const byId = new Map<string, CatRow>();
  for (const c of all) {
    byId.set(c.id, c);
    if (c.parentId) {
      const list = childrenMap.get(c.parentId);
      if (list) list.push(c.id);
      else childrenMap.set(c.parentId, [c.id]);
    }
  }

  function collectDescendantIds(rootId: string): string[] {
    const result: string[] = [rootId];
    const queue: string[] = [rootId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const kids = childrenMap.get(cur);
      if (!kids) continue;
      for (const k of kids) {
        result.push(k);
        queue.push(k);
      }
    }
    return result;
  }

  // 1) HIDE: segment + tüm descendant'ları isActive=false
  console.log(`[1/2] Gizlenecek segment'ler:`);
  let totalHidden = 0;
  let totalHideTouched = 0;
  for (const code of HIDE_SEGMENT_CODES) {
    const segment = all.find((c) => c.code === code && c.level === 1);
    if (!segment) {
      console.warn(`  ⚠️  segment kodu bulunamadı: ${code}`);
      continue;
    }
    const ids = collectDescendantIds(segment.id);
    const activeIds = ids.filter((id) => byId.get(id)?.isActive);
    totalHideTouched += ids.length;
    totalHidden += activeIds.length;

    if (isApply && activeIds.length > 0) {
      await prisma.category.updateMany({
        where: { id: { in: activeIds } },
        data: { isActive: false },
      });
    }
    const namePreview =
      segment.nameTr.length > 50
        ? segment.nameTr.slice(0, 47) + "..."
        : segment.nameTr;
    console.log(
      `  ⛔ ${code}  ${namePreview.padEnd(52, " ")}  ${activeIds.length}/${ids.length} kayıt`,
    );
  }

  // 2) RENAME: segment nameTr update
  console.log(`\n[2/2] Yeniden adlandırılacak segment'ler:`);
  let totalRenamed = 0;
  for (const [code, newName] of Object.entries(RENAME_MAP)) {
    const segment = all.find((c) => c.code === code && c.level === 1);
    if (!segment) {
      console.warn(`  ⚠️  RENAME segment kodu bulunamadı: ${code}`);
      continue;
    }
    if (segment.nameTr === newName) continue;
    console.log(
      `  ✏️  ${code}  "${segment.nameTr.slice(0, 40)}…" → "${newName}"`,
    );
    if (isApply) {
      await prisma.category.update({
        where: { id: segment.id },
        data: { nameTr: newName },
      });
    }
    totalRenamed++;
  }

  // Özet
  console.log(`\n📊 Özet:`);
  console.log(
    `   HIDE — ${HIDE_SEGMENT_CODES.length} segment, ${totalHideTouched} toplam kayıt (descendant dahil)`,
  );
  console.log(`   Şu anda aktif → gizlenecek: ${totalHidden} kayıt`);
  console.log(`   RENAME — ${totalRenamed} segment ismi güncellenecek`);
  console.log("");

  const activeBefore = all.filter((c) => c.isActive).length;
  const activeAfter = activeBefore - totalHidden;
  console.log(
    `   Aktif kategori: ${activeBefore} → ${activeAfter} (${Math.round(((activeBefore - activeAfter) / activeBefore) * 100)}% azalma)`,
  );

  if (!isApply) {
    console.log("\n💡 Uygulamak için: pnpm --filter @supkeys/db cleanup-categories -- --apply");
  } else {
    console.log("\n✅ APPLY tamamlandı");
  }
}

main()
  .catch((e) => {
    console.error("❌ cleanup-categories hatası:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
