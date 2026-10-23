/**
 * KİMLİK BELİRTECİ — talep numarası (ROT-000846), sipariş numarası
 * (ORD-2026-0001) ve Rothern ID (RC5M-2N5T) TEK kuralla çizilir (mobil
 * denetim 2026-10, beşinci tur).
 *
 * Inter'in tabular rakam takımında tire de rakam genişliğinde bir kutu alır ve
 * glif kutunun sağına yaslanır: `tabular-nums` altında numara "ROT -000846",
 * Rothern ID "RC5M - 2N5T" okunuyordu (kullanıcının karşı tarafa okuduğu ve
 * kopyaladığı kod). Belirteç bu yüzden her zaman orantılı rakamla
 * (`normal-nums` — atadan `tabular-nums` gelse de), harf aralığı eklenmeden
 * (`tracking-normal` — atadan `tracking-wide` gelse de) ve bölünmeden
 * (`whitespace-nowrap`) çizilir. Hizalı sayı sütunları (tutar, miktar, sayaç)
 * `tabular-nums` KALIR; bu sınıf yalnız tireli kimliklere verilir. Rothern ID
 * alfabesi Crockford (O harfi yok) olduğu için çizgili sıfır da gerekmez.
 *
 * Kilit: `lib/__tests__/id-token.test.ts` kaynak ağacını tarar — tabular /
 * harf aralıklı bir öğenin doğrudan çizdiği numara ya da Rothern ID kırmızıdır.
 */
export const ID_TOKEN_CLASS = "normal-nums tracking-normal whitespace-nowrap";
