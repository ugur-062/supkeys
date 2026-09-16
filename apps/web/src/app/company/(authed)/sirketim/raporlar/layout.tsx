/**
 * Raporlar kökü ARTIK KAPI TAŞIMAZ (2026-09-17, kullanıcı kararı: "genel bakış
 * ve raporlar satınalma/satışa göre değişmeli, biri diğerini görmemeli").
 *
 * Eskiden bu düzen Gold + "Satınalma raporları" kapısını BÜTÜN alt sayfalara
 * uyguluyordu — oysa İş Analizi SATIŞ tarafının raporu (Silver+, "Ziyaret
 * edenler ve iş analizi" izni). Satış kullanıcısı kendi raporuna giremiyor,
 * satınalma raporu yetkisi olan ise satış raporunu görüyordu. Kapılar artık
 * her rapor türünün KENDİ düzeninde; hub yalnız yetkili olduğun kartları çizer.
 */
export default function RaporlarLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
