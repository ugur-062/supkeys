/**
 * AÇIK ÇIKIŞ İŞARETİ (arayüz testi 2026-10 login-2).
 *
 * "Çıkış Yap" anlık görüntüyü siler ve düz `/company/login`e gider. Anlık
 * görüntü silinince panel nöbetçisi (`RequireCompanyAuth`) de "oturum yok"
 * dalına girip aynı anda `/company/login?next=<son sayfa>` adresine
 * yönlendiriyor, yarışı o kazanıyordu: aynı tarayıcıda SONRA giriş yapan kişi
 * önceki kullanıcının son sayfasına düşüyordu.
 *
 * Çıkış başlarken işaret konur; nöbetçi işareti görünce yönlendirmeyi çıkış
 * kancasına bırakır. `next` yalnız gerçek "oturumsuz geldi / oturum düştü"
 * durumlarında taşınır. İşaret bellek içidir: çıkış tam sayfa yüklemesiyle
 * bittiği için kendiliğinden sıfırlanır.
 */
let loggingOut = false;

export function markCompanyLoggingOut(): void {
  loggingOut = true;
}

export function isCompanyLoggingOut(): boolean {
  return loggingOut;
}

/** Yalnız testler için. */
export function resetCompanyLoggingOut(): void {
  loggingOut = false;
}
