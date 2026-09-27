/**
 * DAVETLE GELEN FİRMANIN ÖNCEDEN DOLDURMASI (2026-09-27, Faz 3).
 *
 * Davet bağlantısı (`?ref=`) açılınca API adresin KENDİ firmasına ait bilgiyi
 * döner (AI keşfinin web'de bulduğu ad, site, ülke, şehir). Kayıt formu e-postayı,
 * onboarding firma adı/web sitesi/ülke/şehri bununla başlatır — alıcı yeniden
 * yazmaz. Oturum deposunda tutulur; gizli sekmede sessizce yok sayılır.
 */
export interface InvitePrefill {
  email: string | null;
  companyName: string | null;
  website: string | null;
  country: string | null;
  city: string | null;
}

const KEY = "rothern:invite-prefill";

export function saveInvitePrefill(p: InvitePrefill): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // gizli sekme / depo kapalı — önceden doldurma yok, akış çalışır
  }
}

export function readInvitePrefill(): InvitePrefill | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as InvitePrefill) : null;
  } catch {
    return null;
  }
}

export function clearInvitePrefill(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // yok say
  }
}
