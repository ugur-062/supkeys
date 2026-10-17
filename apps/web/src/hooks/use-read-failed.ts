"use client";

import { useCallback, useState } from "react";

/**
 * "LİSTE OKUNAMADI" DURUMU — yoklanan (15 sn) listeler için KALICI
 * (son canlı kontrol 2026-10-10, OUTF-1).
 *
 * TanStack Query verisi OLMAYAN bir sorguyu her yeniden çekişte baştan başlatır:
 * `status` "pending"e döner, `error` silinir (`fetchState`). Yoklanan listede bu
 * her 15 saniyede bir olur — kesinti boyunca hata kartı 13–15 sn duruyor, yeniden
 * denemeler sürerken 5–7 sn iskelete dönüyor, sonra geri geliyordu; "Tekrar dene"
 * düğmesi sürenin üçte birinde ekranda yoktu. Uyuyan API'de (istek asılı kalır)
 * liste hata kartına neredeyse hiç ulaşmıyordu.
 *
 * Kural: liste bir kez okunamadıysa hata kartı, VERİ gelene kadar durur —
 * arka plandaki yoklama ekranı iskelete çevirmez. Kullanıcının kendi istediği
 * yeniden deneme (`retry`) ise görünür: o istek sonuçlanana dek iskelet çizilir
 * (düğme "çalışmıyor" gibi durmasın).
 *
 * Görünüm dalları bu sırayla okunur:
 *   `failed` → hata kartı · `isPending` → iskelet · aksi hâlde veri.
 * `failed` yalnız veri YOKKEN doğrudur; verisi olan listenin arka plan
 * yenilemesi düşerse satırlar kalır (LİSTE DURUMLARI kuralı değişmedi).
 *
 * YER TUTUCU VERİ "OKUNDU" DEĞİLDİR (gözden geçirme REV-OUTF-1). Sorgu
 * `keepPreviousData` kullanıyorsa (Tekliflerim), verisi olmayan sorgu yeniden
 * çekilirken `data` ÖNCEKİ süzgecin sayfasıdır. Yalnız `data`ya bakılırsa
 * kesintide süzgeç değiştiren kullanıcıda kart her yoklamada kaybolur ve yerine
 * BAŞKA süzgecin satırları çizilir. Kart, bu süzgecin kendi verisi gelene dek
 * durur; hata bilinmiyorken (sıradan süzgeç değişimi) yer tutucu satırlar
 * eskisi gibi ekranda kalır.
 */
export function useReadFailed(query: {
  data: unknown;
  isError: boolean;
  /** TanStack `isPlaceholderData`: `data` bu sorgunun kendi yanıtı değil. */
  isPlaceholderData?: boolean;
  refetch: () => unknown;
}): { failed: boolean; retry: () => void } {
  const [known, setKnown] = useState(false);
  const read = query.data !== undefined && !query.isPlaceholderData;
  const failed = read ? false : query.isError ? true : known;
  // Önceki çizimden bilgi taşıma (React'in "render sırasında durum güncelle"
  // kalıbı): efekt beklenseydi yoklama başladığı çizimde bir kare iskelet çıkardı.
  if (failed !== known) setKnown(failed);

  const { refetch } = query;
  const retry = useCallback(() => {
    setKnown(false);
    void refetch();
  }, [refetch]);

  return { failed, retry };
}
