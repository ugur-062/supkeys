/**
 * Tekliflerim (`/company/satis/tekliflerim`) drill-down adresleri — Şirketim ve
 * İş Analizi KPI kartları buraya bağlanır. Liste süzgeci URL'deki durum
 * kümesini OLDUĞU GİBİ geri yükler (arayüz testi D-120), bu yüzden "kısmi
 * kazanım dahil" sayan KPI iki kodu da açıkça taşır; yalnız `?status=WON`
 * kullanıcının seçtiği "yalnız Kazandı" süzgecidir.
 */
export const MY_BIDS_HREF = "/company/satis/tekliflerim";
export const MY_BIDS_WON_KPI_HREF = `${MY_BIDS_HREF}?status=WON,AWARDED_PARTIAL`;
export const MY_BIDS_PENDING_KPI_HREF = `${MY_BIDS_HREF}?pending=1`;
