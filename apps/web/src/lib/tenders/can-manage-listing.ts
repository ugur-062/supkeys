/**
 * İlan yönetim (kazandır / ele / iptal / yayın) buton kapısı — backend
 * `assertListingManageRole` ile BİREBİR (F7): `buy|sell:listing:manage` izni VE
 * (ilanı OLUŞTURAN kişi VEYA firma SAHİBİ). İzinsiz operatöre buton gösterip 403
 * yedirmek yerine UI aynı kapıyı uygular.
 */
export function canManageListing(opts: {
  hasManagePermission: boolean;
  /** Kullanıcı firma SAHİBİ mi (backend user.isOwner). */
  isOwner: boolean;
  /** İlanı oluşturan kullanıcı id'si. */
  createdById?: string | null;
  /** Mevcut kullanıcı id'si. */
  userId?: string | null;
}): boolean {
  const isCreatorOrOwner =
    opts.isOwner ||
    (!!opts.createdById && !!opts.userId && opts.createdById === opts.userId);
  return opts.hasManagePermission && isCreatorOrOwner;
}
