/**
 * Davet hedefi süzgeci — TEK KAYNAK: create, updateListing ve addInvitations.
 *
 * Kısa koddan çözülen firma kimliklerinden yalnız davet edilebilir olanları
 * tutar: kendi firma değil VE (bağlı VEYA `alsoAllowed` içinde — ör. düzenlemede
 * önceki davetli). Davet tavanı 5000 (`MAX_LISTING_INVITATIONS`); bağlantı
 * listesi dizi olarak `includes` ile taranınca maliyet davet × bağlantı oluyordu
 * (~25M karşılaştırma). Set ile hedef başına sabit maliyet (derin denetim RM-26).
 */
export function connectedInvitees(
  targetIds: readonly string[],
  opts: {
    selfCompanyId: string;
    connected: ReadonlySet<string>;
    alsoAllowed?: ReadonlySet<string>;
  },
): string[] {
  const { selfCompanyId, connected, alsoAllowed } = opts;
  return targetIds.filter(
    (id) =>
      id !== selfCompanyId &&
      (connected.has(id) || (alsoAllowed?.has(id) ?? false)),
  );
}
