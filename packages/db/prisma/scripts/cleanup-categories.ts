/**
 * V2-6.5 — Kategori temizliği (KOBİ inşaat/elektrik/iskele odaklı).
 *
 * UNSPSC tree'sinden alakasız segment'leri soft-delete (`isActive=false`) eder
 * ve TUT listesindeki segment'lerin `nameTr`'sini Türkçe sadeleştirilmiş
 * şekilde günceller. Idempotent — tekrar çalıştırılabilir.
 *
 * Kullanım:
 *   pnpm --filter @rothern/db cleanup-categories              # dry-run (varsayılan)
 *   pnpm --filter @rothern/db cleanup-categories -- --apply   # DB'ye yaz
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
/**
 * V2-6.5 fix — Geniş KOBİ kapsamı için 7 segment HIDE'dan çıkarıldı:
 * baskı (45), gıda (50), ev aletleri (52), yönetim/muhasebe (80),
 * tasarım (82), sigorta (84), eğitim (86). KOBİ bu hizmetleri ihale ile
 * alabilir veya bu sektörde imalat yapabilir.
 */
const HIDE_SEGMENT_CODES = [
  "10000000", // Canlı Bitki ve Hayvan Materyalleri (tarım, KOBİ değil)
  "20000000", // Madencilik Makineleri
  "21000000", // Tarım ve Balıkçılık Makineleri
  "42000000", // Tıbbi Ekipmanlar (sağlık dışı KOBİ değil)
  "46000000", // Savunma, Kolluk Kuvvetleri Ekipmanları
  "48000000", // Hizmet Sektörü Makineleri (turizm/otel)
  "49000000", // Spor ve Eğlence Ekipmanları
  "51000000", // İlaç ve Farmasötik (regülasyonlu)
  "54000000", // Saat, Mücevher ve Değerli Taş
  "55000000", // Yayınlanmış Ürünler (kitap/dergi)
  "60000000", // Müzik Aletleri, Oyunlar, Oyuncaklar
  "70000000", // Tarım, Balıkçılık Hizmetleri
  "71000000", // Madencilik ve Petrol/Gaz Hizmetleri
  "83000000", // Kamu Hizmetleri (kamu ihalesi ayrı domain)
  "90000000", // Kafeterya/Seyahat/Konaklama/Eğlence
  "91000000", // Kişisel ve Ev Hizmetleri
  "92000000", // Ulusal Savunma, Kamu Düzeni
  "93000000", // Siyaset ve Sivil İşler
  "94000000", // Organizasyonlar ve Kulüpler
  "95000000", // Arazi, Binalar, Yapılar ve Yollar (emlak)
];

/**
 * AİLE (L2) seviyesinde gizlenenler — 2026-09-01.
 *
 * Segment tutuluyor ama içindeki bir aile platformda satın alınabilir hiçbir
 * şeye karşılık gelmiyorsa, o aile ağaçta ÇIKMAZ SOKAK olur: kullanıcı tıklar,
 * altında hiçbir şey bulamaz. İki dürüst çözüm var — doldurmak ya da gizlemek.
 * Aşağıdakiler ICD tarzı TIBBİ KODLAMA artığı: "OSGB ve Sağlık Hizmetleri"
 * segmenti işyeri hekimliği/muayene hizmetleri için duruyor, teşhis kodları
 * için değil. Bunlara sınıf uydurmak taksonomiyi kirletirdi.
 */
const HIDE_FAMILY_CODES = [
  "85270000", // Ruhsal ve davranışsal bozukluk tanıları
  "85400000", // Doğuştan malformasyon ve kromozomal anormallik tanıları
  "85700000", // Alt kemiklerin cerrahi müdahaleleri
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
  "45000000": "Baskı, Etiket ve Dijital Baskı",
  "47000000": "Temizlik Ekipmanları ve Sarf",
  "50000000": "Gıda, İçecek ve Tütün",
  "52000000": "Ev Aletleri ve Tüketici Elektroniği",
  "53000000": "İş Kıyafetleri ve KKD",
  "56000000": "Mobilya ve Mefruşat",
  "72000000": "İnşaat ve Bakım Hizmetleri",
  "73000000": "Fason Üretim ve İmalat Hizmetleri",
  "76000000": "Endüstriyel Temizlik Hizmetleri",
  "77000000": "Çevre ve Atık Yönetimi Hizmetleri",
  "78000000": "Nakliye ve Lojistik Hizmetleri",
  "80000000": "Muhasebe, Hukuk ve Yönetim Hizmetleri",
  "81000000": "Mühendislik ve Danışmanlık Hizmetleri",
  "82000000": "Grafik Tasarım ve Editörlük",
  "84000000": "Finansal ve Sigorta Hizmetleri",
  "85000000": "OSGB ve Sağlık Hizmetleri",
  "86000000": "Eğitim ve Sertifika Hizmetleri",
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

  // 1) Çift-yönlü senkronizasyon: HIDE listesindekiler false, diğerleri true.
  // Geri açma da dahil — eğer bir segment HIDE'dan çıkarıldıysa, önceden
  // isActive=false yapılmış descendant'ları geri aktive eder.
  const hideSet = new Set(HIDE_SEGMENT_CODES);
  const allSegments = all.filter((c) => c.level === 1);

  console.log(`[1/2] Segment aktiflik senkronizasyonu:`);
  let totalHidden = 0;
  let totalReactivated = 0;
  for (const segment of allSegments) {
    const shouldHide = hideSet.has(segment.code);
    const targetActive = !shouldHide;
    const ids = collectDescendantIds(segment.id);
    // Yanlış state'teki kayıtları bul
    const wrongState = ids.filter((id) => {
      const cat = byId.get(id);
      return cat && cat.isActive !== targetActive;
    });
    if (wrongState.length === 0) continue;

    if (isApply) {
      await prisma.category.updateMany({
        where: { id: { in: wrongState } },
        data: { isActive: targetActive },
      });
    }

    const namePreview =
      segment.nameTr.length > 50
        ? segment.nameTr.slice(0, 47) + "..."
        : segment.nameTr;
    const icon = shouldHide ? "⛔" : "✅";
    const action = shouldHide ? "gizlenecek" : "aktive edilecek";
    console.log(
      `  ${icon} ${segment.code}  ${namePreview.padEnd(52, " ")}  ${wrongState.length}/${ids.length} ${action}`,
    );
    if (shouldHide) totalHidden += wrongState.length;
    else totalReactivated += wrongState.length;
  }

  // 1b) AİLE seviyesinde gizleme — SEGMENT DÖNGÜSÜNDEN SONRA koşmak ZORUNDA.
  // Yukarıdaki döngü, gizlenmemiş bir segmentin TÜM alt kayıtlarını aktive
  // ediyor; aile gizlemesi önce yapılsaydı hemen geri açılırdı.
  console.log(`\n[1b] Aile seviyesinde gizleme (çıkmaz sokak temizliği):`);
  let familyHidden = 0;
  for (const code of HIDE_FAMILY_CODES) {
    const fam = all.find((c) => c.code === code && c.level === 2);
    if (!fam) {
      console.warn(`  ⚠️  ${code} bulunamadı (aile değil ya da silinmiş)`);
      continue;
    }
    const ids = collectDescendantIds(fam.id);
    const wrongState = ids.filter((id) => byId.get(id)?.isActive === true);
    if (wrongState.length === 0) continue;
    if (isApply) {
      await prisma.category.updateMany({
        where: { id: { in: wrongState } },
        data: { isActive: false },
      });
    }
    familyHidden += wrongState.length;
    console.log(
      `  ⛔ ${code}  ${fam.nameTr.slice(0, 50).padEnd(52, " ")}  ${wrongState.length} gizlenecek`,
    );
  }
  if (familyHidden === 0) console.log("  (yapılacak iş yok)");
  totalHidden += familyHidden;

  // 2) RENAME: segment nameTr güncelleme
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
    `   HIDE listesi: ${HIDE_SEGMENT_CODES.length} segment (gizli kalmalı)`,
  );
  console.log(`   Gizlenecek (yeni): ${totalHidden} kayıt`);
  console.log(`   Aktive edilecek (yeniden açılan): ${totalReactivated} kayıt`);
  console.log(`   RENAME: ${totalRenamed} segment ismi güncellenecek`);
  console.log("");

  const activeBefore = all.filter((c) => c.isActive).length;
  const activeAfter = activeBefore - totalHidden + totalReactivated;
  const delta = activeAfter - activeBefore;
  console.log(
    `   Aktif kategori: ${activeBefore} → ${activeAfter} (${delta >= 0 ? "+" : ""}${delta})`,
  );

  if (!isApply) {
    console.log("\n💡 Uygulamak için: pnpm --filter @rothern/db cleanup-categories -- --apply");
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
