/**
 * Denetim Kaydı eylem sözlüğü — satır etiketi ve eylem süzgeci.
 *
 * API'nin bugün yazdığı her eylemin burada bir etiketi ve süzgeçte bir öneki
 * olmalı; `__tests__/audit-actions.test.ts` apps/api/src'deki `action: "…"`
 * yazımlarını tarayıp bunu nöbetçi olarak denetler (derin denetim LU-11).
 * Yeni bir audit eylemi eklerken etiketini de buraya yazın.
 */

/**
 * Satırda gösterilen eylem etiketi (tam ad). Bilinmeyen eylem ham adıyla
 * görünür. Eski `supplier.*` / `tenant.*` / `demo.*` etiketleri geçmiş
 * satırlar için duruyor; bugünkü yazım noktaları `company.*` ve `admin.*`
 * kullanır.
 */
export const ACTION_LABELS: Record<string, string> = {
  // Giriş ve oturum
  "auth.login": "Giriş",
  "auth.login_failed": "Başarısız giriş",
  "auth.password_changed": "Şifre değiştirildi",
  "auth.2fa_enabled": "İki adımlı doğrulama açıldı",
  "auth.2fa_disabled": "İki adımlı doğrulama kapatıldı",
  "auth.2fa_recovery_used": "2FA kurtarma kodu kullanıldı",

  // Firma: kayıt ve profil
  "company.signup": "Firma kaydı",
  "company.signup_email_changed": "Kayıt e-postası düzeltildi (doğrulama öncesi)",
  "company.vies_checked": "VIES vergi no sorgusu",
  "company.profile.updated": "Firma profili güncellendi",
  "company.profile_enrich_attempt": "Profil zenginleştirme denemesi",
  "company.profile_enrich_settled": "Profil zenginleştirme denemesi sonuçlandı",
  "company.profile_enriched": "Profil zenginleştirildi",
  "company.request_defaults.updated": "Talep varsayılanları güncellendi",
  "company.address.created": "Adres eklendi",
  "company.address.updated": "Adres güncellendi",
  "company.address.deleted": "Adres silindi",
  "company.bank_account.created": "Banka hesabı eklendi",
  "company.bank_account.updated": "Banka hesabı güncellendi",
  "company.bank_account.deleted": "Banka hesabı silindi",
  "company.docs.uploaded": "Belge yüklendi",
  "company.docs.submitted": "Belgeler incelemeye gönderildi",
  "company.docs.revision_submitted": "Belge güncellemesi gönderildi",

  // Firma: kullanıcı ve rol
  "company.user.invited": "Kullanıcı davet edildi",
  "company.user.invitation_accepted": "Davet kabul edildi",
  "company.user.invitation_cancelled": "Davet iptal edildi",
  "company.user.profile_updated": "Kullanıcı bilgileri güncellendi",
  "company.user.removed": "Kullanıcı çıkarıldı",
  "company.user.active_changed": "Kullanıcı aktiflik durumu değişti",
  "company.user.roles_changed": "Kullanıcı rolleri değişti",
  "company.user.role_change_denied": "Rol değişikliği reddedildi",
  "company.user.permissions_changed": "Kullanıcı izinleri değişti",
  "company.user.permissions_overridden": "Kişiye özel izinler değişti",
  "company.user.last_admin_denied": "Son yönetici işlemi engellendi",
  "company.user.terms_accepted": "Kullanım koşulları kabul edildi",
  "company.ownership.transferred": "Firma sahipliği devredildi",
  "company.seats.selection_applied": "Koltuk seçimi uygulandı",
  "company.membership.self_upgraded": "Paket self-servis yükseltildi",

  // Firma: ilanlar ve teklifler
  "company.listing.published": "İlan yayınlandı",
  "company.listing.awarded": "İlan kazandırıldı",
  "company.listing.award_reverted_on_rejection":
    "Sipariş reddi üzerine kazandırma geri alındı",
  "company.listing.cancelled": "İlan iptal edildi",
  "company.listing.closed_no_award": "İlan kazandırmadan kapatıldı",
  "company.listing.evaluation_started": "Değerlendirme başladı",
  "company.listing.next_round_created": "Yeni tur açıldı",
  "company.listing.ai_member_invited": "Önerilen üye davet edildi",
  "company.listing.manage_denied": "İlan yönetimi reddedildi",
  "company.listing_document.added": "İlan belgesi eklendi",
  "company.listing_document.removed": "İlan belgesi kaldırıldı",
  "company.bid.submitted": "Teklif verildi",
  "company.bid.validity_extended": "Teklif geçerliliği uzatıldı",
  "company.bid_document.added": "Teklif belgesi eklendi",
  "company.bid_document.removed": "Teklif belgesi kaldırıldı",

  // Firma: siparişler
  "company.order.accepted": "Sipariş kabul edildi",
  "company.order.rejected": "Sipariş reddedildi",
  "company.order.lc_opened": "Akreditif açıldı",
  "company.order.lc_accepted": "Akreditif kabul edildi",
  "company.order.payment_confirmed": "Ödeme onaylandı",
  "company.order.payment_rejected": "Ödeme reddedildi",
  "company.order.shipped": "Sipariş sevk edildi",
  "company.order.received": "Sipariş teslim alındı",
  "company.order.completed": "Sipariş tamamlandı",
  "company.order.defect_notified": "Ayıp bildirimi yapıldı",
  "company.order.defect_notice_withdrawn": "Ayıp bildirimi geri çekildi",
  "company.order.disputed": "Siparişe itiraz edildi",
  "company.order.cancel_requested": "Sipariş iptali istendi",
  "company.order.cancel_request_approved": "İptal isteği onaylandı",
  "company.order.cancel_request_withdrawn": "İptal isteği geri çekildi",
  "company.order.cancelled": "Sipariş iptal edildi",

  // Firma: ürünler ve katalog
  "company.product.submitted": "Ürün onaya gönderildi",
  "company.product.updated": "Ürün güncellendi",
  "company.product.unpublished": "Ürün yayından kaldırıldı",
  "company.catalog_item.created": "Katalog kalemi eklendi",
  "company.catalog_item.updated": "Katalog kalemi güncellendi",
  "company.catalog_item.archived": "Katalog kalemi arşivlendi",
  "company.catalog_item.restored": "Katalog kalemi geri alındı",
  "company.catalog_item.bulk_imported": "Katalog toplu içe aktarıldı",

  // Firma: bağlantılar
  "company.connection.requested": "Bağlantı isteği gönderildi",
  "company.connection.accepted": "Bağlantı kabul edildi",
  "company.connection.rejected": "Bağlantı reddedildi",
  "company.connection.auto_created": "Bağlantı otomatik kuruldu",
  "company.connection.disconnected": "Bağlantı kesildi",
  "company.connection.blocked": "Firma engellendi",
  "company.connection.unblocked": "Firma engeli kaldırıldı",
  "connection.external_tender_invite": "Talebe dışarıdan e-postayla davet",

  // Firma: AI asistan
  "ai.action_executed": "AI asistan eylemi yürütüldü",

  // Firma: onay akışları
  "company.approval_flow.created": "Onay akışı oluşturuldu",
  "company.approval_flow.updated": "Onay akışı güncellendi",
  "company.approval_flow.duplicated": "Onay akışı kopyalandı",
  "company.approval_flow.status_changed": "Onay akışı durumu değişti",
  "company.approval_flow.deleted": "Onay akışı silindi",
  "company.approval.step_approved": "Onay adımı onaylandı",
  "company.approval.approved": "Onay tamamlandı",
  "company.approval.rejected": "Onay reddedildi",

  // Admin: firma
  "admin.company.suspended": "Admin: firma askıya alındı",
  "admin.company.unsuspended": "Admin: firma askısı kaldırıldı",
  "admin.company.tier_set": "Admin: paket değişti",
  "admin.company.membership_extended": "Admin: üyelik uzatıldı",
  "admin.company.verification_set": "Admin: doğrulama değişti",
  "admin.company.docs_reviewed": "Admin: belgeler incelendi",
  "admin.company.doc_revision_reviewed": "Admin: belge güncellemesi incelendi",
  "admin.company.profile_updated": "Admin: firma profili güncellendi",
  "admin.company.note_added": "Admin: not eklendi",
  "admin.company.note_deleted": "Admin: not silindi",
  "admin.company.notified": "Admin: firmaya bildirim gönderildi",
  "admin.company.exported": "Admin: firma verisi dışa aktarıldı",
  "admin.company.anonymized": "Admin: firma anonimleştirildi",
  "admin.company.deleted": "Admin: firma silindi",

  // Admin: firma kullanıcıları
  "admin.user.created": "Admin: kullanıcı eklendi",
  "admin.user.deactivated": "Admin: kullanıcı pasifleştirildi",
  "admin.user.activated": "Admin: kullanıcı aktifleştirildi",
  "admin.user.email_changed": "Admin: kullanıcı e-postası değişti",
  "admin.user.password_reset_sent": "Admin: şifre sıfırlama bağlantısı gönderildi",
  "admin.user.verification_resent": "Admin: doğrulama e-postası yeniden gönderildi",
  "admin.user.sessions_dropped": "Admin: kullanıcı oturumları kapatıldı",

  // Admin: davetler
  "admin.connection_invite.revoked": "Admin: bağlantı daveti iptal edildi",
  "admin.referral_invite.revoked": "Admin: referans daveti iptal edildi",

  // Admin: personel ve kendi hesabı
  "admin.staff.created": "Admin: personel eklendi",
  "admin.staff.role_set": "Admin: personel rolü değişti",
  "admin.staff.deactivated": "Admin: personel pasifleştirildi",
  "admin.staff.activated": "Admin: personel aktifleştirildi",
  "admin.staff.password_reset": "Admin: personel şifresi sıfırlandı",
  "admin.self.password_changed": "Admin: kendi şifresini değiştirdi",
  "admin.self.2fa_enabled": "Admin: iki adımlı doğrulamayı açtı",
  "admin.self.2fa_disabled": "Admin: iki adımlı doğrulamayı kapattı",

  // Admin: ürün, ilan, sipariş
  "admin.product.approved": "Admin: ürün onaylandı",
  "admin.product.rejected": "Admin: ürün reddedildi",
  "admin.listing.closed": "Admin: ilan kapatıldı",
  "admin.listing.extended": "Admin: ilan süresi uzatıldı",
  "admin.listing.reopened": "Admin: ilan yeniden açıldı",
  "admin.order.cancelled": "Admin: sipariş iptal edildi",

  // Admin: sistem
  "admin.system.rates_refreshed": "Admin: döviz kurları yenilendi",
  "admin.system.manual_rate_set": "Admin: elle döviz kuru girildi",
  "admin.system.suppression_cleared": "Admin: e-posta engeli kaldırıldı",
  "admin.system.category_miss_resolved": "Admin: kategori eşleşmeme kaydı çözüldü",
  "admin.system.time_savings_config_updated":
    "Admin: zaman tasarrufu ayarları güncellendi",
  "admin.system.translation_backfill": "Admin: içerik çevirisi toplu kuyruğa alındı",
  "admin.system.search_text_rebuilt": "Admin: çok dilli arama metni yeniden kuruldu",
  "admin.system.category_translation_backfill": "Admin: kategori adı toplu çevirisi başlatıldı",
  "admin.system.attribute_translation_backfill": "Admin: nitelik etiketi toplu çevirisi başlatıldı",

  // Admin: duyuru, şikayet, e-posta
  "admin.announcement.sent": "Admin: duyuru gönderildi",
  "admin.announcement.email_completed": "Admin: duyuru e-postaları tamamlandı",
  "admin.complaint.resolved": "Admin: şikayet sonuçlandırıldı",
  "email.resent": "E-posta yeniden gönderildi",

  // Eski model — yalnız geçmiş satırlar
  "supplier.updated": "Tedarikçi güncellendi",
  "supplier.blocked": "Tedarikçi engellendi",
  "supplier.unblocked": "Tedarikçi engeli kaldırıldı",
  "supplier.membership_changed": "Tedarikçi üyeliği değişti",
  "supplier.user_activated": "Tedarikçi kullanıcı aktif",
  "supplier.user_deactivated": "Tedarikçi kullanıcı pasif",
  "supplier.user_email_verified": "Tedarikçi e-posta doğrulandı",
  "supplier.user_2fa_reset": "Tedarikçi 2FA sıfırlandı",
  "supplier.user_email_changed": "Tedarikçi e-posta değişti",
  "tenant.user_updated": "Alıcı kullanıcı güncellendi",
  "tenant.user_email_verified": "Alıcı e-posta doğrulandı",
  "tenant.user_2fa_reset": "Alıcı 2FA sıfırlandı",
  "tenant.user_email_changed": "Alıcı e-posta değişti",
  "tenant.user_password_reset": "Alıcı şifre sıfırlama",
  "demo.invite_sent": "Demo davet gönderildi",
  "demo.invite_revoked": "Demo davet iptal",
};

/**
 * Eylem süzgeci — ÖNEK grupları (API `action` alanını `startsWith` ile
 * süzer). Noktasız önekler bilinçli: `company.listing` ilan belgelerini
 * (`company.listing_document.*`), `company.bid` teklif belgelerini,
 * `company.approval` onay akışlarını (`company.approval_flow.*`),
 * `company.profile` zenginleştirme kayıtlarını da kapsar.
 */
export const ACTION_FILTERS: { value: string; label: string }[] = [
  { value: "auth.", label: "Giriş olayları" },
  { value: "company.signup", label: "Firma: kayıt" },
  { value: "company.vies_checked", label: "Firma: VIES sorgusu" },
  { value: "company.user.", label: "Firma: kullanıcı ve rol" },
  { value: "company.ownership.", label: "Firma: sahiplik devri" },
  { value: "company.seats.", label: "Firma: koltuk seçimi" },
  { value: "company.membership.", label: "Firma: paket yükseltme" },
  { value: "company.profile", label: "Firma: profil" },
  { value: "company.request_defaults.", label: "Firma: talep varsayılanları" },
  { value: "company.address.", label: "Firma: adresler" },
  { value: "company.listing", label: "Firma: ilanlar" },
  { value: "company.bid", label: "Firma: teklifler" },
  { value: "company.order.", label: "Firma: siparişler" },
  { value: "company.product.", label: "Firma: ürünler" },
  { value: "company.catalog_item.", label: "Firma: katalog" },
  { value: "company.connection.", label: "Firma: bağlantılar" },
  { value: "connection.", label: "Firma: dış e-posta davetleri" },
  { value: "ai.", label: "Firma: AI asistan" },
  { value: "company.approval", label: "Firma: onay akışları" },
  { value: "company.docs.", label: "Firma: belgeler" },
  { value: "company.bank_account.", label: "Firma: banka hesapları" },
  { value: "admin.company.", label: "Admin: firma işlemleri" },
  { value: "admin.user.", label: "Admin: kullanıcı işlemleri" },
  { value: "admin.connection_invite.", label: "Admin: bağlantı davetleri" },
  { value: "admin.referral_invite.", label: "Admin: referans davetleri" },
  { value: "admin.staff.", label: "Admin: personel" },
  { value: "admin.self.", label: "Admin: kendi hesabı" },
  { value: "admin.product.", label: "Admin: ürün onayı" },
  { value: "admin.listing.", label: "Admin: ilanlar" },
  { value: "admin.order.", label: "Admin: siparişler" },
  { value: "admin.system.", label: "Admin: sistem" },
  { value: "admin.announcement.", label: "Admin: duyurular" },
  { value: "admin.complaint.", label: "Admin: şikayetler" },
  { value: "email.resent", label: "E-posta yeniden gönderimi" },
];
