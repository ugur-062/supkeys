/**
 * İlan yönetim (kazandır / ele / iptal / yayın) buton kapısı — backend
 * `assertListingManageRole` ile BİREBİR (F7): `buy|sell:listing:manage` izni VE
 * ilanı OLUŞTURAN kişi. SAHİP istisnası YOK — Kurucu ihaleler üzerinde
 * salt-gözlemcidir (ürün kararı, 2026-07-23). İzinsiz operatöre buton gösterip
 * 403 yedirmek yerine UI aynı kapıyı uygular.
 */
export function canManageListing(opts: {
  hasManagePermission: boolean;
  /** İlanı oluşturan kullanıcı id'si. */
  createdById?: string | null;
  /** Mevcut kullanıcı id'si. */
  userId?: string | null;
}): boolean {
  const isCreator =
    !!opts.createdById && !!opts.userId && opts.createdById === opts.userId;
  return opts.hasManagePermission && isCreator;
}
