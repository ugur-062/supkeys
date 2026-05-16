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
  level: 2 | 3 | 4;
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

  // ═══════════════════════════════════════════════════════════════════
  // LEVEL 4 COMMODITY — Her Class altında ürün varyantları
  // ═══════════════════════════════════════════════════════════════════

  // ─── 22900100 Ekskavatör (Paletli) ───
  { code: "22900101", level: 4, nameTr: "Mini Ekskavatör (1-5 ton)", parentCode: "22900100" },
  { code: "22900102", level: 4, nameTr: "Orta Sınıf Ekskavatör (5-15 ton)", parentCode: "22900100" },
  { code: "22900103", level: 4, nameTr: "Büyük Ekskavatör (15-30 ton)", parentCode: "22900100" },
  { code: "22900104", level: 4, nameTr: "Endüstriyel Ekskavatör (30+ ton)", parentCode: "22900100" },
  // ─── 22900200 Yükleyici ───
  { code: "22900201", level: 4, nameTr: "Mini Yükleyici (Skid Steer)", parentCode: "22900200" },
  { code: "22900202", level: 4, nameTr: "Kompakt Lastik Yükleyici", parentCode: "22900200" },
  { code: "22900203", level: 4, nameTr: "Orta Boy Lastik Yükleyici", parentCode: "22900200" },
  { code: "22900204", level: 4, nameTr: "Ağır İş Yükleyici", parentCode: "22900200" },
  // ─── 22920100 Beton Mikseri (Sahada) ───
  { code: "22920101", level: 4, nameTr: "150 L Sahada Mikser", parentCode: "22920100" },
  { code: "22920102", level: 4, nameTr: "350 L Sahada Mikser", parentCode: "22920100" },
  { code: "22920103", level: 4, nameTr: "500 L+ Sahada Mikser", parentCode: "22920100" },
  // ─── 22920200 Transmikser ───
  { code: "22920201", level: 4, nameTr: "6 m³ Transmikser", parentCode: "22920200" },
  { code: "22920202", level: 4, nameTr: "8 m³ Transmikser", parentCode: "22920200" },
  { code: "22920203", level: 4, nameTr: "10 m³ Transmikser", parentCode: "22920200" },
  { code: "22920204", level: 4, nameTr: "12 m³ Transmikser", parentCode: "22920200" },
  // ─── 22920300 Beton Pompası ───
  { code: "22920301", level: 4, nameTr: "24 m Bom Beton Pompası", parentCode: "22920300" },
  { code: "22920302", level: 4, nameTr: "32 m Bom Beton Pompası", parentCode: "22920300" },
  { code: "22920303", level: 4, nameTr: "42 m+ Bom Beton Pompası", parentCode: "22920300" },
  { code: "22920304", level: 4, nameTr: "Sabit Beton Pompası (Stationary)", parentCode: "22920300" },
  // ─── 22930100 Kule Vinç ───
  { code: "22930101", level: 4, nameTr: "Üst Döner Kule Vinç", parentCode: "22930100" },
  { code: "22930102", level: 4, nameTr: "Alt Döner Kule Vinç", parentCode: "22930100" },
  { code: "22930103", level: 4, nameTr: "Self-Erecting (Self-Kurulan) Vinç", parentCode: "22930100" },
  // ─── 22930200 Mobil Vinç ───
  { code: "22930201", level: 4, nameTr: "25 ton Mobil Vinç", parentCode: "22930200" },
  { code: "22930202", level: 4, nameTr: "50 ton Mobil Vinç", parentCode: "22930200" },
  { code: "22930203", level: 4, nameTr: "100 ton+ Mobil Vinç", parentCode: "22930200" },
  { code: "22930204", level: 4, nameTr: "All-Terrain (Tüm Arazi) Vinç", parentCode: "22930200" },

  // ─── 30900100 Cephe İskelesi ───
  { code: "30900101", level: 4, nameTr: "Çerçeve (Frame) Tipi İskele", parentCode: "30900100" },
  { code: "30900102", level: 4, nameTr: "Ringlock İskele Sistemi", parentCode: "30900100" },
  { code: "30900103", level: 4, nameTr: "Cuplock İskele Sistemi", parentCode: "30900100" },
  { code: "30900104", level: 4, nameTr: "H Tip Cephe İskelesi", parentCode: "30900100" },
  // ─── 30900400 Mobil İskele Kulesi ───
  { code: "30900401", level: 4, nameTr: "2-4 m Mobil İskele Kulesi", parentCode: "30900400" },
  { code: "30900402", level: 4, nameTr: "4-6 m Mobil İskele Kulesi", parentCode: "30900400" },
  { code: "30900403", level: 4, nameTr: "6-8 m Mobil İskele Kulesi", parentCode: "30900400" },
  { code: "30900404", level: 4, nameTr: "8 m+ Mobil İskele Kulesi", parentCode: "30900400" },
  // ─── 30910100 HEA / HEB Profil ───
  { code: "30910101", level: 4, nameTr: "HEA 100", parentCode: "30910100" },
  { code: "30910102", level: 4, nameTr: "HEA 120", parentCode: "30910100" },
  { code: "30910103", level: 4, nameTr: "HEA 140", parentCode: "30910100" },
  { code: "30910104", level: 4, nameTr: "HEA 160", parentCode: "30910100" },
  { code: "30910105", level: 4, nameTr: "HEA 180", parentCode: "30910100" },
  { code: "30910106", level: 4, nameTr: "HEA 200", parentCode: "30910100" },
  { code: "30910107", level: 4, nameTr: "HEA 220", parentCode: "30910100" },
  { code: "30910108", level: 4, nameTr: "HEA 240", parentCode: "30910100" },
  { code: "30910109", level: 4, nameTr: "HEA 260", parentCode: "30910100" },
  { code: "30910110", level: 4, nameTr: "HEA 280", parentCode: "30910100" },
  { code: "30910111", level: 4, nameTr: "HEA 300", parentCode: "30910100" },
  { code: "30910112", level: 4, nameTr: "HEA 320+", parentCode: "30910100" },
  { code: "30910113", level: 4, nameTr: "HEB 100", parentCode: "30910100" },
  { code: "30910114", level: 4, nameTr: "HEB 140", parentCode: "30910100" },
  { code: "30910115", level: 4, nameTr: "HEB 180", parentCode: "30910100" },
  { code: "30910116", level: 4, nameTr: "HEB 200", parentCode: "30910100" },
  { code: "30910117", level: 4, nameTr: "HEB 240", parentCode: "30910100" },
  { code: "30910118", level: 4, nameTr: "HEB 280+", parentCode: "30910100" },
  // ─── 30910200 IPE / IPN Profil ───
  { code: "30910201", level: 4, nameTr: "IPE 80", parentCode: "30910200" },
  { code: "30910202", level: 4, nameTr: "IPE 100", parentCode: "30910200" },
  { code: "30910203", level: 4, nameTr: "IPE 120", parentCode: "30910200" },
  { code: "30910204", level: 4, nameTr: "IPE 140", parentCode: "30910200" },
  { code: "30910205", level: 4, nameTr: "IPE 160", parentCode: "30910200" },
  { code: "30910206", level: 4, nameTr: "IPE 180", parentCode: "30910200" },
  { code: "30910207", level: 4, nameTr: "IPE 200", parentCode: "30910200" },
  { code: "30910208", level: 4, nameTr: "IPE 220+", parentCode: "30910200" },
  { code: "30910209", level: 4, nameTr: "IPN 80-200", parentCode: "30910200" },
  // ─── 30910300 Köşebent (L Profil) ───
  { code: "30910301", level: 4, nameTr: "L 20×20", parentCode: "30910300" },
  { code: "30910302", level: 4, nameTr: "L 30×30", parentCode: "30910300" },
  { code: "30910303", level: 4, nameTr: "L 40×40", parentCode: "30910300" },
  { code: "30910304", level: 4, nameTr: "L 50×50", parentCode: "30910300" },
  { code: "30910305", level: 4, nameTr: "L 60×60", parentCode: "30910300" },
  { code: "30910306", level: 4, nameTr: "L 80×80", parentCode: "30910300" },
  { code: "30910307", level: 4, nameTr: "L 100×100+", parentCode: "30910300" },
  // ─── 30910400 Çelik Boru ve Kutu Profil ───
  { code: "30910401", level: 4, nameTr: "Kare Kutu Profil 20×20", parentCode: "30910400" },
  { code: "30910402", level: 4, nameTr: "Kare Kutu Profil 30×30", parentCode: "30910400" },
  { code: "30910403", level: 4, nameTr: "Kare Kutu Profil 40×40", parentCode: "30910400" },
  { code: "30910404", level: 4, nameTr: "Kare Kutu Profil 50×50", parentCode: "30910400" },
  { code: "30910405", level: 4, nameTr: "Kare Kutu Profil 60×60+", parentCode: "30910400" },
  { code: "30910406", level: 4, nameTr: "Dikdörtgen Kutu Profil 40×20", parentCode: "30910400" },
  { code: "30910407", level: 4, nameTr: "Dikdörtgen Kutu Profil 60×40", parentCode: "30910400" },
  { code: "30910408", level: 4, nameTr: "Dikiş li Çelik Boru (Galvaniz)", parentCode: "30910400" },
  { code: "30910409", level: 4, nameTr: "Dikiş siz Çelik Boru", parentCode: "30910400" },
  // ─── 30910600 Sac ───
  { code: "30910601", level: 4, nameTr: "Siyah Sac 1-3 mm", parentCode: "30910600" },
  { code: "30910602", level: 4, nameTr: "Siyah Sac 4-8 mm", parentCode: "30910600" },
  { code: "30910603", level: 4, nameTr: "Galvanizli Sac (DKP)", parentCode: "30910600" },
  { code: "30910604", level: 4, nameTr: "Trapez Sac (Çatı Kaplama)", parentCode: "30910600" },
  { code: "30910605", level: 4, nameTr: "Sandviç Panel (Çatı/Cephe)", parentCode: "30910600" },
  { code: "30910606", level: 4, nameTr: "Baklava Desenli Sac", parentCode: "30910600" },
  // ─── 30920100 Hazır Beton ───
  { code: "30920101", level: 4, nameTr: "C20/25 Hazır Beton", parentCode: "30920100" },
  { code: "30920102", level: 4, nameTr: "C25/30 Hazır Beton", parentCode: "30920100" },
  { code: "30920103", level: 4, nameTr: "C30/37 Hazır Beton", parentCode: "30920100" },
  { code: "30920104", level: 4, nameTr: "C35/45 Hazır Beton", parentCode: "30920100" },
  { code: "30920105", level: 4, nameTr: "C40/50+ Hazır Beton", parentCode: "30920100" },
  // ─── 30920200 Çimento ───
  { code: "30920201", level: 4, nameTr: "CEM I 42.5 R (Portland)", parentCode: "30920200" },
  { code: "30920202", level: 4, nameTr: "CEM I 52.5 R (Yüksek Mukavemet)", parentCode: "30920200" },
  { code: "30920203", level: 4, nameTr: "CEM II 32.5 (Portland Kompoze)", parentCode: "30920200" },
  { code: "30920204", level: 4, nameTr: "CEM III (Yüksek Fırın Cürufu)", parentCode: "30920200" },
  { code: "30920205", level: 4, nameTr: "CEM IV (Puzolanik)", parentCode: "30920200" },
  { code: "30920206", level: 4, nameTr: "Beyaz Çimento", parentCode: "30920200" },
  // ─── 30920600 Donatı Çeliği ───
  { code: "30920601", level: 4, nameTr: "Ø 8 mm Nervürlü Demir", parentCode: "30920600" },
  { code: "30920602", level: 4, nameTr: "Ø 10 mm Nervürlü Demir", parentCode: "30920600" },
  { code: "30920603", level: 4, nameTr: "Ø 12 mm Nervürlü Demir", parentCode: "30920600" },
  { code: "30920604", level: 4, nameTr: "Ø 14 mm Nervürlü Demir", parentCode: "30920600" },
  { code: "30920605", level: 4, nameTr: "Ø 16 mm Nervürlü Demir", parentCode: "30920600" },
  { code: "30920606", level: 4, nameTr: "Ø 20 mm Nervürlü Demir", parentCode: "30920600" },
  { code: "30920607", level: 4, nameTr: "Ø 25 mm Nervürlü Demir", parentCode: "30920600" },
  { code: "30920608", level: 4, nameTr: "Ø 32 mm+ Nervürlü Demir", parentCode: "30920600" },
  // ─── 30930100 Yangın Söndürücü ───
  { code: "30930101", level: 4, nameTr: "Kuru Tozlu Yangın Söndürücü (6 kg)", parentCode: "30930100" },
  { code: "30930102", level: 4, nameTr: "Kuru Tozlu Yangın Söndürücü (12 kg)", parentCode: "30930100" },
  { code: "30930103", level: 4, nameTr: "CO₂ Yangın Söndürücü", parentCode: "30930100" },
  { code: "30930104", level: 4, nameTr: "Köpüklü Yangın Söndürücü", parentCode: "30930100" },
  { code: "30930105", level: 4, nameTr: "Mutfak Yangın Söndürücü (F Sınıfı)", parentCode: "30930100" },

  // ─── 39900100 AG Panosu ───
  { code: "39900101", level: 4, nameTr: "AG Pano 250A", parentCode: "39900100" },
  { code: "39900102", level: 4, nameTr: "AG Pano 400A", parentCode: "39900100" },
  { code: "39900103", level: 4, nameTr: "AG Pano 630A", parentCode: "39900100" },
  { code: "39900104", level: 4, nameTr: "AG Pano 800A", parentCode: "39900100" },
  { code: "39900105", level: 4, nameTr: "AG Pano 1000A", parentCode: "39900100" },
  { code: "39900106", level: 4, nameTr: "AG Pano 1250A", parentCode: "39900100" },
  { code: "39900107", level: 4, nameTr: "AG Pano 1600A", parentCode: "39900100" },
  { code: "39900108", level: 4, nameTr: "AG Pano 2000A", parentCode: "39900100" },
  { code: "39900109", level: 4, nameTr: "AG Pano 2500A", parentCode: "39900100" },
  { code: "39900110", level: 4, nameTr: "AG Pano 3200A+", parentCode: "39900100" },
  // ─── 39900200 OG Panosu ───
  { code: "39900201", level: 4, nameTr: "OG Pano 12 kV (Hücre)", parentCode: "39900200" },
  { code: "39900202", level: 4, nameTr: "OG Pano 17.5 kV", parentCode: "39900200" },
  { code: "39900203", level: 4, nameTr: "OG Pano 24 kV", parentCode: "39900200" },
  { code: "39900204", level: 4, nameTr: "OG Pano 36 kV", parentCode: "39900200" },
  { code: "39900205", level: 4, nameTr: "Gaz İzolelilik (GIS) OG Pano", parentCode: "39900200" },
  // ─── 39900300 MCC Panosu ───
  { code: "39900301", level: 4, nameTr: "MCC Konvansiyonel (Tek Cer)", parentCode: "39900300" },
  { code: "39900302", level: 4, nameTr: "MCC Plug-in (Çıkarılabilir Cer)", parentCode: "39900300" },
  { code: "39900303", level: 4, nameTr: "MCC Akıllı (Profibus/Modbus)", parentCode: "39900300" },
  // ─── 39900700 UPS Panosu ───
  { code: "39900701", level: 4, nameTr: "UPS 1-10 kVA Tek Faz", parentCode: "39900700" },
  { code: "39900702", level: 4, nameTr: "UPS 10-40 kVA 3 Faz", parentCode: "39900700" },
  { code: "39900703", level: 4, nameTr: "UPS 40-200 kVA 3 Faz", parentCode: "39900700" },
  { code: "39900704", level: 4, nameTr: "UPS 200+ kVA Endüstriyel", parentCode: "39900700" },

  // ─── 39910100 MCCB ───
  { code: "39910101", level: 4, nameTr: "MCCB 25-100 A", parentCode: "39910100" },
  { code: "39910102", level: 4, nameTr: "MCCB 100-250 A", parentCode: "39910100" },
  { code: "39910103", level: 4, nameTr: "MCCB 250-630 A", parentCode: "39910100" },
  { code: "39910104", level: 4, nameTr: "MCCB 630-1600 A", parentCode: "39910100" },
  { code: "39910105", level: 4, nameTr: "Air Circuit Breaker (ACB) 1600-6300 A", parentCode: "39910100" },
  // ─── 39910200 MCB ───
  { code: "39910201", level: 4, nameTr: "MCB 1P B Tipi 6-63 A", parentCode: "39910200" },
  { code: "39910202", level: 4, nameTr: "MCB 1P C Tipi 6-63 A", parentCode: "39910200" },
  { code: "39910203", level: 4, nameTr: "MCB 1P D Tipi (Motor) 6-63 A", parentCode: "39910200" },
  { code: "39910204", level: 4, nameTr: "MCB 3P B Tipi 6-63 A", parentCode: "39910200" },
  { code: "39910205", level: 4, nameTr: "MCB 3P C Tipi 6-63 A", parentCode: "39910200" },
  { code: "39910206", level: 4, nameTr: "MCB 4P (3F+N) 6-63 A", parentCode: "39910200" },
  // ─── 39910300 RCD/RCBO ───
  { code: "39910301", level: 4, nameTr: "RCD 2P 30 mA Kaçak", parentCode: "39910300" },
  { code: "39910302", level: 4, nameTr: "RCD 4P 30 mA Kaçak", parentCode: "39910300" },
  { code: "39910303", level: 4, nameTr: "RCD 4P 300 mA Yangın Koruma", parentCode: "39910300" },
  { code: "39910304", level: 4, nameTr: "RCBO Kombo (MCB + RCD)", parentCode: "39910300" },
  // ─── 39910400 Kontaktör ───
  { code: "39910401", level: 4, nameTr: "Kontaktör 9-12 A (AC3)", parentCode: "39910400" },
  { code: "39910402", level: 4, nameTr: "Kontaktör 18-25 A", parentCode: "39910400" },
  { code: "39910403", level: 4, nameTr: "Kontaktör 32-40 A", parentCode: "39910400" },
  { code: "39910404", level: 4, nameTr: "Kontaktör 50-80 A", parentCode: "39910400" },
  { code: "39910405", level: 4, nameTr: "Kontaktör 95-150 A", parentCode: "39910400" },
  { code: "39910406", level: 4, nameTr: "Kontaktör 185-400 A", parentCode: "39910400" },
  { code: "39910407", level: 4, nameTr: "Kontaktör 500-800 A+", parentCode: "39910400" },
  // ─── 39910500 Termik Röle ───
  { code: "39910501", level: 4, nameTr: "Termik Röle 0.1-1 A", parentCode: "39910500" },
  { code: "39910502", level: 4, nameTr: "Termik Röle 1-10 A", parentCode: "39910500" },
  { code: "39910503", level: 4, nameTr: "Termik Röle 10-25 A", parentCode: "39910500" },
  { code: "39910504", level: 4, nameTr: "Termik Röle 25-100 A", parentCode: "39910500" },
  { code: "39910505", level: 4, nameTr: "Termik Röle 100-630 A", parentCode: "39910500" },
  // ─── 39910700 Parafudr ───
  { code: "39910701", level: 4, nameTr: "Parafudr Tip 1 (Class B)", parentCode: "39910700" },
  { code: "39910702", level: 4, nameTr: "Parafudr Tip 2 (Class C)", parentCode: "39910700" },
  { code: "39910703", level: 4, nameTr: "Parafudr Tip 3 (Class D)", parentCode: "39910700" },
  { code: "39910704", level: 4, nameTr: "Kombi Parafudr Tip 1+2", parentCode: "39910700" },

  // ─── 39920100 PLC ───
  { code: "39920101", level: 4, nameTr: "Siemens S7-1200", parentCode: "39920100" },
  { code: "39920102", level: 4, nameTr: "Siemens S7-1500", parentCode: "39920100" },
  { code: "39920103", level: 4, nameTr: "Siemens LOGO!", parentCode: "39920100" },
  { code: "39920104", level: 4, nameTr: "Schneider M221 / M241", parentCode: "39920100" },
  { code: "39920105", level: 4, nameTr: "Schneider M340 / M580", parentCode: "39920100" },
  { code: "39920106", level: 4, nameTr: "Mitsubishi FX / Q Serisi", parentCode: "39920100" },
  { code: "39920107", level: 4, nameTr: "Allen-Bradley (Rockwell) PLC", parentCode: "39920100" },
  { code: "39920108", level: 4, nameTr: "Omron CP / CJ Serisi PLC", parentCode: "39920100" },
  { code: "39920109", level: 4, nameTr: "Delta DVP / AS Serisi PLC", parentCode: "39920100" },
  // ─── 39920200 HMI ───
  { code: "39920201", level: 4, nameTr: "HMI 4 inç", parentCode: "39920200" },
  { code: "39920202", level: 4, nameTr: "HMI 7 inç", parentCode: "39920200" },
  { code: "39920203", level: 4, nameTr: "HMI 10 inç", parentCode: "39920200" },
  { code: "39920204", level: 4, nameTr: "HMI 12-15 inç", parentCode: "39920200" },
  { code: "39920205", level: 4, nameTr: "Endüstriyel PC Panel", parentCode: "39920200" },
  // ─── 39920300 VFD ───
  { code: "39920301", level: 4, nameTr: "VFD 0.4-2.2 kW", parentCode: "39920300" },
  { code: "39920302", level: 4, nameTr: "VFD 2.2-7.5 kW", parentCode: "39920300" },
  { code: "39920303", level: 4, nameTr: "VFD 7.5-22 kW", parentCode: "39920300" },
  { code: "39920304", level: 4, nameTr: "VFD 22-75 kW", parentCode: "39920300" },
  { code: "39920305", level: 4, nameTr: "VFD 75-160 kW", parentCode: "39920300" },
  { code: "39920306", level: 4, nameTr: "VFD 160-450 kW+", parentCode: "39920300" },

  // ─── 39930200 Şönt Kapasitör ───
  { code: "39930201", level: 4, nameTr: "Şönt Kapasitör 2.5-12.5 kVAr", parentCode: "39930200" },
  { code: "39930202", level: 4, nameTr: "Şönt Kapasitör 12.5-25 kVAr", parentCode: "39930200" },
  { code: "39930203", level: 4, nameTr: "Şönt Kapasitör 25-50 kVAr", parentCode: "39930200" },
  { code: "39930204", level: 4, nameTr: "Şönt Kapasitör 50-100 kVAr+", parentCode: "39930200" },

  // ─── 39940100 Akım Trafosu (AT) ───
  { code: "39940101", level: 4, nameTr: "AT 100/5 A", parentCode: "39940100" },
  { code: "39940102", level: 4, nameTr: "AT 200/5 A", parentCode: "39940100" },
  { code: "39940103", level: 4, nameTr: "AT 400/5 A", parentCode: "39940100" },
  { code: "39940104", level: 4, nameTr: "AT 800/5 A", parentCode: "39940100" },
  { code: "39940105", level: 4, nameTr: "AT 1600/5 A", parentCode: "39940100" },
  { code: "39940106", level: 4, nameTr: "AT 2500/5 A+", parentCode: "39940100" },
  { code: "39940107", level: 4, nameTr: "Geçmeli (Toroid) AT", parentCode: "39940100" },

  // ─── 32900100 Yaklaşım Sensörü ───
  { code: "32900101", level: 4, nameTr: "İndüktif M8 / M12 / M18 / M30", parentCode: "32900100" },
  { code: "32900102", level: 4, nameTr: "Kapasitif Yaklaşım Sensörü", parentCode: "32900100" },
  { code: "32900103", level: 4, nameTr: "Manyetik Yaklaşım Sensörü (Reed)", parentCode: "32900100" },
  { code: "32900104", level: 4, nameTr: "Ultrasonik Yaklaşım Sensörü", parentCode: "32900100" },
  // ─── 32900200 Sıcaklık Sensörü ───
  { code: "32900201", level: 4, nameTr: "PT100 Sıcaklık Sensörü", parentCode: "32900200" },
  { code: "32900202", level: 4, nameTr: "PT1000 Sıcaklık Sensörü", parentCode: "32900200" },
  { code: "32900203", level: 4, nameTr: "NTC / PTC Termistör", parentCode: "32900200" },
  { code: "32900204", level: 4, nameTr: "K-Tipi Termokupl", parentCode: "32900200" },
  { code: "32900205", level: 4, nameTr: "J/T/N/S-Tipi Termokupl", parentCode: "32900200" },
  { code: "32900206", level: 4, nameTr: "Kızılötesi (IR) Sıcaklık Sensörü", parentCode: "32900200" },
  // ─── 32900300 Basınç Sensörü ───
  { code: "32900301", level: 4, nameTr: "Basınç Sensörü 0-10 bar (4-20 mA)", parentCode: "32900300" },
  { code: "32900302", level: 4, nameTr: "Basınç Sensörü 0-100 bar", parentCode: "32900300" },
  { code: "32900303", level: 4, nameTr: "Basınç Sensörü 0-400 bar (Hidrolik)", parentCode: "32900300" },
  { code: "32900304", level: 4, nameTr: "Diferansiyel Basınç Transmitteri", parentCode: "32900300" },
  { code: "32900305", level: 4, nameTr: "Basınç Anahtarı (Pressostat)", parentCode: "32900300" },

  // ═══════════════════════════════════════════════════════════════════
  // V2-6.5 — Elektrik / İnşaat / İskele DETAYLANDIRMA II
  // Bu üç sektör KOBİ için kritik; ek family + class + commodity.
  // ═══════════════════════════════════════════════════════════════════

  // ─── 39960000 Aydınlatma Armatürleri (Detay) ───
  { code: "39960000", level: 2, nameTr: "Aydınlatma Armatürleri (Detay)", parentCode: "39000000" },
  { code: "39960100", level: 3, nameTr: "İç Mekan LED Panel", parentCode: "39960000" },
  { code: "39960101", level: 4, nameTr: "30×30 cm LED Panel", parentCode: "39960100" },
  { code: "39960102", level: 4, nameTr: "30×60 cm LED Panel", parentCode: "39960100" },
  { code: "39960103", level: 4, nameTr: "60×60 cm LED Panel", parentCode: "39960100" },
  { code: "39960104", level: 4, nameTr: "60×120 cm LED Panel", parentCode: "39960100" },
  { code: "39960200", level: 3, nameTr: "LED Spot / Downlight", parentCode: "39960000" },
  { code: "39960201", level: 4, nameTr: "LED Spot 5-9 W", parentCode: "39960200" },
  { code: "39960202", level: 4, nameTr: "LED Spot 12-18 W", parentCode: "39960200" },
  { code: "39960203", level: 4, nameTr: "LED Spot 24-30 W", parentCode: "39960200" },
  { code: "39960300", level: 3, nameTr: "LED Projektör (Outdoor)", parentCode: "39960000" },
  { code: "39960301", level: 4, nameTr: "LED Projektör 30-50 W", parentCode: "39960300" },
  { code: "39960302", level: 4, nameTr: "LED Projektör 100-150 W", parentCode: "39960300" },
  { code: "39960303", level: 4, nameTr: "LED Projektör 200-300 W+", parentCode: "39960300" },
  { code: "39960400", level: 3, nameTr: "Sokak Aydınlatma Armatürü", parentCode: "39960000" },
  { code: "39960401", level: 4, nameTr: "Sokak LED 60-100 W", parentCode: "39960400" },
  { code: "39960402", level: 4, nameTr: "Sokak LED 100-150 W", parentCode: "39960400" },
  { code: "39960403", level: 4, nameTr: "Sokak LED 150-250 W+", parentCode: "39960400" },
  { code: "39960500", level: 3, nameTr: "Endüstriyel High-Bay", parentCode: "39960000" },
  { code: "39960501", level: 4, nameTr: "High-Bay 100-150 W", parentCode: "39960500" },
  { code: "39960502", level: 4, nameTr: "High-Bay 200-300 W+", parentCode: "39960500" },
  { code: "39960600", level: 3, nameTr: "Acil Aydınlatma", parentCode: "39960000" },
  { code: "39960601", level: 4, nameTr: "Acil Aydınlatma 1-3 saat", parentCode: "39960600" },
  { code: "39960602", level: 4, nameTr: "Acil Aydınlatma Yön Lambası (Exit)", parentCode: "39960600" },
  { code: "39960700", level: 3, nameTr: "Lineer Armatür (T8/T5 Floresan)", parentCode: "39960000" },
  { code: "39960800", level: 3, nameTr: "Avize ve Dekoratif Aydınlatma", parentCode: "39960000" },

  // ─── 39970000 Lamba ve Ampuller ───
  { code: "39970000", level: 2, nameTr: "Lamba ve Ampuller", parentCode: "39000000" },
  { code: "39970100", level: 3, nameTr: "LED Ampul", parentCode: "39970000" },
  { code: "39970101", level: 4, nameTr: "E27 LED 9-11 W", parentCode: "39970100" },
  { code: "39970102", level: 4, nameTr: "E27 LED 13-15 W", parentCode: "39970100" },
  { code: "39970103", level: 4, nameTr: "E14 LED 5-7 W", parentCode: "39970100" },
  { code: "39970104", level: 4, nameTr: "GU10 / MR16 LED", parentCode: "39970100" },
  { code: "39970200", level: 3, nameTr: "Floresan Tüp", parentCode: "39970000" },
  { code: "39970201", level: 4, nameTr: "T8 18 W Floresan", parentCode: "39970200" },
  { code: "39970202", level: 4, nameTr: "T8 36 W Floresan", parentCode: "39970200" },
  { code: "39970203", level: 4, nameTr: "T5 14-28 W Floresan", parentCode: "39970200" },
  { code: "39970300", level: 3, nameTr: "Halojen Ampul", parentCode: "39970000" },
  { code: "39970400", level: 3, nameTr: "Sodyum Buharlı Lamba", parentCode: "39970000" },
  { code: "39970500", level: 3, nameTr: "Metal Halide Lamba", parentCode: "39970000" },

  // ─── 39980000 Elektrik Kabloları ───
  { code: "39980000", level: 2, nameTr: "Elektrik Kabloları", parentCode: "39000000" },
  { code: "39980100", level: 3, nameTr: "NYY / NYY-J Genel Amaçlı", parentCode: "39980000" },
  { code: "39980101", level: 4, nameTr: "NYY 2×1.5 mm²", parentCode: "39980100" },
  { code: "39980102", level: 4, nameTr: "NYY 3×2.5 mm²", parentCode: "39980100" },
  { code: "39980103", level: 4, nameTr: "NYY 4×4 mm²", parentCode: "39980100" },
  { code: "39980104", level: 4, nameTr: "NYY 5×6 mm²", parentCode: "39980100" },
  { code: "39980105", level: 4, nameTr: "NYY 5×10-16 mm²", parentCode: "39980100" },
  { code: "39980106", level: 4, nameTr: "NYY 5×25-50 mm²", parentCode: "39980100" },
  { code: "39980200", level: 3, nameTr: "NYM / NHXMH Bina Tesisat", parentCode: "39980000" },
  { code: "39980201", level: 4, nameTr: "NYM 2×1.5 / 2×2.5 mm²", parentCode: "39980200" },
  { code: "39980202", level: 4, nameTr: "NYM 3×1.5 / 3×2.5 mm²", parentCode: "39980200" },
  { code: "39980300", level: 3, nameTr: "NYAF Esnek Kablo", parentCode: "39980000" },
  { code: "39980301", level: 4, nameTr: "NYAF 1×1.5-2.5 mm²", parentCode: "39980300" },
  { code: "39980302", level: 4, nameTr: "NYAF 1×4-6 mm²", parentCode: "39980300" },
  { code: "39980303", level: 4, nameTr: "NYAF 1×10-16 mm²", parentCode: "39980300" },
  { code: "39980400", level: 3, nameTr: "NHXH Halojen-Free Kablo", parentCode: "39980000" },
  { code: "39980500", level: 3, nameTr: "Antigron (FROR) Yumuşak Kablo", parentCode: "39980000" },
  { code: "39980600", level: 3, nameTr: "Veri Kablosu", parentCode: "39980000" },
  { code: "39980601", level: 4, nameTr: "CAT 5e UTP", parentCode: "39980600" },
  { code: "39980602", level: 4, nameTr: "CAT 6 UTP / FTP", parentCode: "39980600" },
  { code: "39980603", level: 4, nameTr: "CAT 6a / CAT 7", parentCode: "39980600" },
  { code: "39980700", level: 3, nameTr: "Fiber Optik Kablo", parentCode: "39980000" },
  { code: "39980800", level: 3, nameTr: "Kablo Kanal ve Bağlantı Aksesuarları", parentCode: "39980000" },

  // ─── 39990000 Priz, Anahtar ve Buton ───
  { code: "39990000", level: 2, nameTr: "Priz, Anahtar ve Buton", parentCode: "39000000" },
  { code: "39990100", level: 3, nameTr: "Standart Schuko Priz", parentCode: "39990000" },
  { code: "39990101", level: 4, nameTr: "Schuko Priz (Sıva Üstü)", parentCode: "39990100" },
  { code: "39990102", level: 4, nameTr: "Schuko Priz (Sıva Altı)", parentCode: "39990100" },
  { code: "39990103", level: 4, nameTr: "Çoklu Priz Grubu (3'lü, 6'lı)", parentCode: "39990100" },
  { code: "39990104", level: 4, nameTr: "USB Şarjlı Priz", parentCode: "39990100" },
  { code: "39990200", level: 3, nameTr: "CEE Sanayi Prizi", parentCode: "39990000" },
  { code: "39990201", level: 4, nameTr: "CEE 16A 3P+N+E", parentCode: "39990200" },
  { code: "39990202", level: 4, nameTr: "CEE 32A 3P+N+E", parentCode: "39990200" },
  { code: "39990203", level: 4, nameTr: "CEE 63A 3P+N+E", parentCode: "39990200" },
  { code: "39990204", level: 4, nameTr: "CEE 125A 3P+N+E", parentCode: "39990200" },
  { code: "39990300", level: 3, nameTr: "Anahtar (Komütatör)", parentCode: "39990000" },
  { code: "39990301", level: 4, nameTr: "Tekli Anahtar", parentCode: "39990300" },
  { code: "39990302", level: 4, nameTr: "Vavien Anahtar", parentCode: "39990300" },
  { code: "39990303", level: 4, nameTr: "Komütatör (İki Yön)", parentCode: "39990300" },
  { code: "39990400", level: 3, nameTr: "Sinyal Lambası ve Buton", parentCode: "39990000" },
  { code: "39990401", level: 4, nameTr: "LED Sinyal Lambası 22mm", parentCode: "39990400" },
  { code: "39990402", level: 4, nameTr: "Start/Stop Butonu", parentCode: "39990400" },
  { code: "39990403", level: 4, nameTr: "Acil Stop (Mantar) Butonu", parentCode: "39990400" },
  { code: "39990404", level: 4, nameTr: "Selektör (3 Konumlu) Anahtar", parentCode: "39990400" },

  // ─── 30940000 İzolasyon Malzemeleri ───
  { code: "30940000", level: 2, nameTr: "İzolasyon Malzemeleri", parentCode: "30000000" },
  { code: "30940100", level: 3, nameTr: "XPS Ekstrüde Polistiren", parentCode: "30940000" },
  { code: "30940101", level: 4, nameTr: "XPS 2-3 cm", parentCode: "30940100" },
  { code: "30940102", level: 4, nameTr: "XPS 4-5 cm", parentCode: "30940100" },
  { code: "30940103", level: 4, nameTr: "XPS 6-10 cm", parentCode: "30940100" },
  { code: "30940200", level: 3, nameTr: "EPS Genleştirilmiş Polistiren", parentCode: "30940000" },
  { code: "30940201", level: 4, nameTr: "EPS 2-3 cm", parentCode: "30940200" },
  { code: "30940202", level: 4, nameTr: "EPS 4-6 cm", parentCode: "30940200" },
  { code: "30940300", level: 3, nameTr: "Taş Yünü", parentCode: "30940000" },
  { code: "30940301", level: 4, nameTr: "Taş Yünü Levha", parentCode: "30940300" },
  { code: "30940302", level: 4, nameTr: "Taş Yünü Şilte (Rulo)", parentCode: "30940300" },
  { code: "30940400", level: 3, nameTr: "Cam Yünü", parentCode: "30940000" },
  { code: "30940500", level: 3, nameTr: "Poliüretan (PU) Köpük", parentCode: "30940000" },

  // ─── 30950000 Su Yalıtım Malzemeleri ───
  { code: "30950000", level: 2, nameTr: "Su Yalıtım Malzemeleri", parentCode: "30000000" },
  { code: "30950100", level: 3, nameTr: "Bitümlü Membran", parentCode: "30950000" },
  { code: "30950101", level: 4, nameTr: "Bitümlü Membran 3 mm", parentCode: "30950100" },
  { code: "30950102", level: 4, nameTr: "Bitümlü Membran 4 mm", parentCode: "30950100" },
  { code: "30950103", level: 4, nameTr: "Bitümlü Membran 5 mm", parentCode: "30950100" },
  { code: "30950200", level: 3, nameTr: "PVC / TPO Membran", parentCode: "30950000" },
  { code: "30950300", level: 3, nameTr: "Sürme Yalıtım (Akrilik/Bitüm)", parentCode: "30950000" },
  { code: "30950400", level: 3, nameTr: "Kristalize Yalıtım Malzemeleri", parentCode: "30950000" },
  { code: "30950500", level: 3, nameTr: "Geomembran (HDPE/LLDPE)", parentCode: "30950000" },

  // ─── 30960000 Boya ve Kaplama ───
  { code: "30960000", level: 2, nameTr: "Boya ve Kaplama", parentCode: "30000000" },
  { code: "30960100", level: 3, nameTr: "Akrilik Boya (İç-Dış Cephe)", parentCode: "30960000" },
  { code: "30960200", level: 3, nameTr: "Silikon Boya (Dış Cephe)", parentCode: "30960000" },
  { code: "30960300", level: 3, nameTr: "Su Bazlı Plastik Boya", parentCode: "30960000" },
  { code: "30960400", level: 3, nameTr: "Yağlı Boya (Sentetik)", parentCode: "30960000" },
  { code: "30960500", level: 3, nameTr: "Epoksi Zemin Boyası", parentCode: "30960000" },
  { code: "30960600", level: 3, nameTr: "Antikorrozif Boya (Metal)", parentCode: "30960000" },
  { code: "30960700", level: 3, nameTr: "Yangına Dayanıklı Boya", parentCode: "30960000" },
  { code: "30960800", level: 3, nameTr: "Astar / Vernik / İncelti", parentCode: "30960000" },

  // ─── 30970000 Cam ve Doğrama ───
  { code: "30970000", level: 2, nameTr: "Cam ve Doğrama", parentCode: "30000000" },
  { code: "30970100", level: 3, nameTr: "Çift Cam (Isıcam)", parentCode: "30970000" },
  { code: "30970101", level: 4, nameTr: "4+12+4 Standart Isıcam", parentCode: "30970100" },
  { code: "30970102", level: 4, nameTr: "4+12+4 Low-E Isıcam", parentCode: "30970100" },
  { code: "30970103", level: 4, nameTr: "Triple (Üçlü) Isıcam", parentCode: "30970100" },
  { code: "30970200", level: 3, nameTr: "Lamine Güvenlik Camı", parentCode: "30970000" },
  { code: "30970300", level: 3, nameTr: "Temperli Cam", parentCode: "30970000" },
  { code: "30970400", level: 3, nameTr: "PVC Doğrama", parentCode: "30970000" },
  { code: "30970500", level: 3, nameTr: "Alüminyum Doğrama", parentCode: "30970000" },
  { code: "30970600", level: 3, nameTr: "Çelik Kasa / Kapı", parentCode: "30970000" },

  // ─── 30980000 Çatı Malzemeleri ───
  { code: "30980000", level: 2, nameTr: "Çatı Malzemeleri", parentCode: "30000000" },
  { code: "30980100", level: 3, nameTr: "Kiremit", parentCode: "30980000" },
  { code: "30980101", level: 4, nameTr: "Marsilya Kiremit", parentCode: "30980100" },
  { code: "30980102", level: 4, nameTr: "Akdeniz Kiremit", parentCode: "30980100" },
  { code: "30980103", level: 4, nameTr: "Beton Kiremit", parentCode: "30980100" },
  { code: "30980200", level: 3, nameTr: "OSB / Çatı Tahtası", parentCode: "30980000" },
  { code: "30980300", level: 3, nameTr: "Çatı Membran (Şingıl)", parentCode: "30980000" },
  { code: "30980400", level: 3, nameTr: "Oluk ve İndirme Borusu (PVC/Metal)", parentCode: "30980000" },
  { code: "30980500", level: 3, nameTr: "Çatı Pencereleri (Velux Tipi)", parentCode: "30980000" },

  // ─── 30990000 İç Kaplama ───
  { code: "30990000", level: 2, nameTr: "İç Kaplama Malzemeleri", parentCode: "30000000" },
  { code: "30990100", level: 3, nameTr: "Seramik", parentCode: "30990000" },
  { code: "30990101", level: 4, nameTr: "Banyo/WC Seramik (Duvar)", parentCode: "30990100" },
  { code: "30990102", level: 4, nameTr: "Yer Seramik (Granit)", parentCode: "30990100" },
  { code: "30990103", level: 4, nameTr: "Porselen Karo", parentCode: "30990100" },
  { code: "30990200", level: 3, nameTr: "Mermer ve Granit", parentCode: "30990000" },
  { code: "30990300", level: 3, nameTr: "Parke", parentCode: "30990000" },
  { code: "30990301", level: 4, nameTr: "Laminant Parke", parentCode: "30990300" },
  { code: "30990302", level: 4, nameTr: "Masif Parke", parentCode: "30990300" },
  { code: "30990303", level: 4, nameTr: "Vinil Parke (LVT)", parentCode: "30990300" },
  { code: "30990400", level: 3, nameTr: "Alçıpan (Plaster Karton)", parentCode: "30990000" },
  { code: "30990401", level: 4, nameTr: "Standart Alçıpan (Beyaz)", parentCode: "30990400" },
  { code: "30990402", level: 4, nameTr: "Yeşil Alçıpan (Nemli Bölge)", parentCode: "30990400" },
  { code: "30990403", level: 4, nameTr: "Pembe Alçıpan (Yangına Dayanıklı)", parentCode: "30990400" },
  { code: "30990500", level: 3, nameTr: "Asma Tavan Plakası", parentCode: "30990000" },

  // ─── 30900100 ek (Cephe iskelesi materyal tipi) ───
  // (cephe iskelesi mevcut, alttaki çelik/alüminyum varyantları zaten 30900101-04'te var)
  // ─── 30900500 ek (Kelepçe ve aksesuar detayları) ───
  { code: "30900501", level: 4, nameTr: "İskele Borusu Ø 48 mm", parentCode: "30900500" },
  { code: "30900502", level: 4, nameTr: "Sabit Kelepçe (Klemens)", parentCode: "30900500" },
  { code: "30900503", level: 4, nameTr: "Döner Kelepçe (Swivel)", parentCode: "30900500" },
  { code: "30900504", level: 4, nameTr: "Geçmeli Kelepçe (Putlog)", parentCode: "30900500" },
  { code: "30900505", level: 4, nameTr: "Tabanlık ve Ayar Kovanı", parentCode: "30900500" },
  { code: "30900506", level: 4, nameTr: "Diyagonal Eleman", parentCode: "30900500" },
  // ─── 30900700 ek (Güvenlik ağ ve kenar koruma detay) ───
  { code: "30900701", level: 4, nameTr: "Güvenlik Ağı (Düşmeye Karşı)", parentCode: "30900700" },
  { code: "30900702", level: 4, nameTr: "Kenar Koruma Korkuluğu", parentCode: "30900700" },
  { code: "30900703", level: 4, nameTr: "Süpürgelik Tahtası", parentCode: "30900700" },
  { code: "30900704", level: 4, nameTr: "Geçiş Köprüsü ve Sahanlık", parentCode: "30900700" },
  { code: "30900705", level: 4, nameTr: "Emniyet Kemeri (Harness)", parentCode: "30900700" },
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

  // 2) Custom kategorilerin kendileri de parent olabilir:
  //    Level 2 family → Level 3 class → Level 4 commodity. Sırayla ekle.
  const families = CUSTOM_CATEGORIES.filter((c) => c.level === 2);
  const classes = CUSTOM_CATEGORIES.filter((c) => c.level === 3);
  const commodities = CUSTOM_CATEGORIES.filter((c) => c.level === 4);

  let inserted = 0;
  let skipped = 0;

  // 3) Family'leri insert (idempotent)
  console.log(`[1/3] Family (Level 2) ekleniyor: ${families.length} adet`);
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
  console.log(`\n[2/3] Class (Level 3) ekleniyor: ${classes.length} adet`);
  let classInserted = 0;
  let classSkipped = 0;
  for (const cls of classes) {
    const existing = await prisma.category.findUnique({
      where: { code: cls.code },
    });
    if (existing) {
      codeToId.set(cls.code, existing.id);
      classSkipped++;
      continue;
    }
    const parentId = codeToId.get(cls.parentCode);
    if (!parentId) {
      console.warn(`  ⚠️  Parent bulunamadı: ${cls.parentCode} (atlandı: ${cls.code})`);
      continue;
    }
    const sortOrder = parseInt(cls.code.slice(6, 8), 10);
    const created = await prisma.category.create({
      data: {
        code: cls.code,
        nameTr: cls.nameTr,
        level: 3,
        parentId,
        sortOrder,
        isActive: true,
      },
    });
    codeToId.set(cls.code, created.id);
    classInserted++;
  }

  // 5) Commodity'leri insert (Level 4 — ürün varyantları)
  console.log(`\n[3/3] Commodity (Level 4) ekleniyor: ${commodities.length} adet`);
  let comInserted = 0;
  let comSkipped = 0;
  // Class parent kodları DB'den (mevcut UNSPSC class'lar da olabilir parent)
  const commodityParentCodes = Array.from(
    new Set(commodities.map((c) => c.parentCode)),
  );
  const missingParents = commodityParentCodes.filter((c) => !codeToId.has(c));
  if (missingParents.length > 0) {
    const fetched = await prisma.category.findMany({
      where: { code: { in: missingParents } },
      select: { id: true, code: true },
    });
    for (const p of fetched) codeToId.set(p.code, p.id);
  }
  for (const com of commodities) {
    const existing = await prisma.category.findUnique({
      where: { code: com.code },
    });
    if (existing) {
      comSkipped++;
      continue;
    }
    const parentId = codeToId.get(com.parentCode);
    if (!parentId) {
      console.warn(`  ⚠️  Parent bulunamadı: ${com.parentCode} (atlandı: ${com.code})`);
      continue;
    }
    // Commodity sortOrder: son 2 hane (01-99 arası)
    const sortOrder = parseInt(com.code.slice(6, 8), 10);
    await prisma.category.create({
      data: {
        code: com.code,
        nameTr: com.nameTr,
        level: 4,
        parentId,
        sortOrder,
        isActive: true,
      },
    });
    comInserted++;
  }

  console.log(`\n📊 Özet:`);
  console.log(`   Family:    ${inserted} eklendi, ${skipped} zaten vardı`);
  console.log(`   Class:     ${classInserted} eklendi, ${classSkipped} zaten vardı`);
  console.log(`   Commodity: ${comInserted} eklendi, ${comSkipped} zaten vardı`);

  const totalActive = await prisma.category.count({ where: { isActive: true } });
  console.log(`\n✅ Toplam aktif kategori: ${totalActive}`);
}

main()
  .catch((e) => {
    console.error("❌ seed-custom-categories hatası:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
