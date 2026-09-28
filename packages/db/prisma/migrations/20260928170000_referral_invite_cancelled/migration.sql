-- Yayın denetimi 2026-09-28 Bölüm 5: referral davet iptali satırı SİLİYORDU →
-- günlük davet tavanı, 7 günlük yeniden gönderim freni ve dış talep davetleri
-- (cascade) sıfırlanıyor, sil-yeniden-gönder döngüsüyle sınırsız davet e-postası
-- atılabiliyordu. İptal artık satırı CANCELLED'a çeker. Eklemeli; enum değeri
-- aynı işlemde kullanılmadığı için ayrı dosya gerekmez.
ALTER TYPE "ReferralInviteStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
