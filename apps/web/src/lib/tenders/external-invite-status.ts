import type { ExternalInviteStatus } from "@/hooks/use-supplier-discovery";

/**
 * Dış davet kabul edildi mi (2026-09-27): e-postalar artık KUYRUKTAN gider —
 * QUEUED başarıdır (alıcının mesai saatinde gönderilecek), SENT eski yanıt.
 * Saf modül: hook dosyasını tümden sahteleyen bileşen testleri de okuyabilsin.
 *
 * "Kabul edildi" ≠ "gönderildi" (2026-10-09, D2): satır kilidi ve seçim
 * temizliği bu fonksiyona bakar; EKRANDAKİ ETİKET `isInviteSent` /
 * `isInviteQueued` ile seçilir — sıradaki davet "Gönderildi" diye yazılmaz
 * (e-posta saatler, 7 gün kuralına takılan adreste günler sonra çıkar ya da
 * hiç çıkmaz).
 */
export function isInviteAccepted(status: ExternalInviteStatus): boolean {
  return status === "QUEUED" || status === "SENT";
}

/** E-posta GERÇEKTEN gitti — "Gönderildi" yalnız bu durumda yazılır. */
export function isInviteSent(status: ExternalInviteStatus): boolean {
  return status === "SENT";
}

/** Davet sırada: e-posta henüz gitmedi (planlanan an yanıtın `sendAfter` alanında). */
export function isInviteQueued(status: ExternalInviteStatus): boolean {
  return status === "QUEUED";
}

/**
 * Sıradaki davetin planlanan gönderim anı — yalnız QUEUED sonucunda ve
 * geçerli bir tarihse; aksi hâlde `null` (etiket zamansız "Sıraya alındı").
 */
export function queuedSendTime(result: { status: ExternalInviteStatus; sendAfter?: string | null }): string | null {
  if (!isInviteQueued(result.status) || !result.sendAfter) return null;
  return Number.isFinite(new Date(result.sendAfter).getTime()) ? result.sendAfter : null;
}

/** Adresin alan adı ("satis@firma.com.tr" → "firma.com.tr"); biçim bozuksa `null`. */
function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain.includes(".") ? domain : null;
}

/** Site adresinin konağı ("https://www.firma.com.tr/iletisim" → "firma.com.tr"); okunamazsa `null`. */
function websiteHost(website: string): string | null {
  const raw = website.trim();
  if (!raw) return null;
  try {
    const host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

/**
 * Adayın e-posta alan adı SİTESİNDEN farklı mı (2026-10-09, D13). AI'ın
 * önerdiği 80 adresin 9'unda alan adı firmanın sitesiyle uyuşmuyordu (başka
 * alan adı, genel posta sağlayıcısı); bir kısmı sitede gerçekten yayınlı, bir
 * kısmı değil → alıcıya "göndermeden önce doğrulayın" ipucu.
 *
 * Alt alan adı fark sayılmaz (`mail.firma.com` ⇔ `firma.com`). Site ya da
 * adres okunamıyorsa karşılaştırma yapılmaz (`null`). Fark varsa ekranda
 * gösterilecek iki değer döner.
 */
export function emailSiteMismatch(
  email: string | null | undefined,
  website: string | null | undefined,
): { domain: string; host: string } | null {
  if (!email || !website) return null;
  const domain = emailDomain(email);
  const host = websiteHost(website);
  if (!domain || !host) return null;
  if (domain === host || domain.endsWith(`.${host}`) || host.endsWith(`.${domain}`)) return null;
  return { domain, host };
}
