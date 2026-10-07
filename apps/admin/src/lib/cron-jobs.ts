/**
 * Zamanlanmış iş anahtarı → Türkçe ad ve zamanlama (arayüz testi D-139).
 * API kaydı (`CronRegistryService.register`) bazı işlerde İngilizce ya da ham
 * kod içeren metin taşıyor ("STANDARD'a düşür", "nightly 04:20"); scheduler
 * dosyaları değiştirilmeden admin burada eşler. Haritada olmayan yeni iş API
 * metniyle görünür — yeni scheduler eklenince BURAYA da eklenmeli.
 */
export const CRON_JOB_META: Record<string, { label: string; schedule: string }> = {
  "membership.downgradeExpired": {
    label: "Süresi biten paket üyelikleri Standart'a düşür",
    schedule: "Her gün 03:00 + açılışta telafi",
  },
  "approvals.remind": {
    label: "Bekleyen onaylar için hatırlatma",
    schedule: "Her gün 09:00 + açılışta telafi",
  },
  "approvals.fallbackInactiveApprovers": {
    label: "Pasif onaycının işlerini yöneticiye devret",
    schedule: "Her dakika",
  },
  "views.purge": {
    label: "Eski profil/ürün görüntülenme kayıtlarını sil",
    schedule: "Her gece 04:20 (İstanbul)",
  },
  "sessions.purgeRevoked": {
    label: "Süresi geçmiş oturum iptal kayıtlarını sil (çıkış yapılan oturumlar)",
    schedule: "Her gece 04:50 (İstanbul)",
  },
  "views.replyTimes": {
    label: "Firmaların ortanca ilk yanıt süresini hesapla (\"hızlı yanıt\")",
    schedule: "Her gece 04:35 (İstanbul)",
  },
  "listing.closeExpired": {
    label: "Süresi dolan açık talepleri kapat",
    schedule: "Her dakika",
  },
  "listing.closingReminders": {
    label: "Kapanış hatırlatma e-postaları",
    schedule: "Her dakika",
  },
  "listing.announceOpened": {
    label: "Açılış saati gelen taleplerin yayın duyurusu",
    schedule: "Her dakika",
  },
  "listing.evaluationValidityReminders": {
    label: "Değerlendirmedeki talepte geçerliliği dolacak teklifler için hatırlatma",
    schedule: "Saatte bir",
  },
  "order.paymentDueReminders": {
    label: "Vadesi yaklaşan siparişler için alıcıya ödeme hatırlatması",
    schedule: "Saatte bir",
  },
  "externalInvite.dispatch": {
    label: "Kayıtsız adreslere talep daveti e-postaları",
    schedule: "Her dakika",
  },
  "ai.reapStaleReservations": {
    label: "Askıda kalan AI rezervasyonlarını zaman aşımıyla kapat",
    schedule: "5 dakikada bir",
  },
  "ai.cleanupExtractFiles": {
    label: "24 saatten eski geçici AI belge yüklemelerini sil",
    schedule: "Her gün 04:00 + açılışta telafi",
  },
  "ai.cleanupChatSessions": {
    label: "90 gündür dokunulmamış asistan sohbetlerini sil",
    schedule: "Her gün 04:10 + açılışta telafi",
  },
  "discovery.runs": {
    label: "AI tedarikçi keşfi turları (yayın sonrası, ikinci tur, alıcıya bildirim)",
    schedule: "Her dakika",
  },
  "contentTranslation.sweep": {
    label: "İçerik çevirisi taraması (eksik/başarısız çeviriler, arama metni)",
    schedule: "5 dakikada bir",
  },
  "currency.fetchDailyRates": {
    label: "TCMB günlük kur çekimi",
    schedule: "İş günleri 16:00 + açılışta ilk yükleme",
  },
  "emailPrograms.tick": {
    label: "Günlük e-posta programı (akşam özeti, karşılama ipuçları, haftalık görünürlük, teklifsiz talep)",
    schedule: "15 dakikada bir",
  },
};

export function cronJobMeta(job: { key: string; label: string; schedule: string }) {
  return CRON_JOB_META[job.key] ?? { label: job.label, schedule: job.schedule };
}
