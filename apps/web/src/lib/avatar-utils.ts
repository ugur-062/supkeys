/**
 * V2-4 — Şirket adından deterministik renk + initials.
 * Hash deterministik olduğu için aynı isim her zaman aynı renge düşer.
 */

const AVATAR_COLORS: ReadonlyArray<{ bg: string; text: string }> = [
  { bg: "bg-blue-500", text: "text-white" },
  { bg: "bg-emerald-500", text: "text-white" },
  { bg: "bg-violet-500", text: "text-white" },
  { bg: "bg-rose-500", text: "text-white" },
  { bg: "bg-amber-500", text: "text-white" },
  { bg: "bg-cyan-500", text: "text-white" },
  { bg: "bg-fuchsia-500", text: "text-white" },
  { bg: "bg-orange-500", text: "text-white" },
];

export interface AvatarProps {
  initials: string;
  bgClass: string;
  textClass: string;
}

export function getAvatarProps(name: string): AvatarProps {
  if (!name) {
    return { initials: "?", bgClass: "bg-slate-400", textClass: "text-white" };
  }

  // İlk 2 kelimenin baş harfleri (TR uppercase locale)
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  let initials = "";
  if (words.length >= 2) {
    initials = `${words[0]![0]!}${words[1]![0]!}`.toLocaleUpperCase("tr-TR");
  } else if (words[0]) {
    initials = words[0].substring(0, 2).toLocaleUpperCase("tr-TR");
  } else {
    initials = "?";
  }

  const palette = AVATAR_COLORS[avatarHash(name) % AVATAR_COLORS.length]!;

  return { initials, bgClass: palette.bg, textClass: palette.text };
}

/** djb2-ish hash — aynı ad her zaman aynı renge düşer (TEK KAYNAK; `ui/avatar` de okur). */
export function avatarHash(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

/** Baş harfler — ilk iki kelimenin ilk harfi, TR büyük harf ("İ" doğru). */
export function avatarInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length >= 2) return `${words[0]![0]!}${words[1]![0]!}`.toLocaleUpperCase("tr-TR");
  if (words[0]) return words[0].substring(0, 2).toLocaleUpperCase("tr-TR");
  return "?";
}

/**
 * Pazar yeri firma logosu yer tutucusu: 8 PASTEL zemin + koyu metin (Europages
 * kalıbı; paneldeki doygun `AVATAR_COLORS` beyaz metinli, bu liste kartlarda
 * daha sakin). Kare köşe (logo dili) — bkz. `ui/avatar.tsx`.
 */
export const AVATAR_PASTELS: ReadonlyArray<{ bg: string; text: string }> = [
  { bg: "bg-sky-100", text: "text-sky-900" },
  { bg: "bg-emerald-100", text: "text-emerald-900" },
  { bg: "bg-violet-100", text: "text-violet-900" },
  { bg: "bg-rose-100", text: "text-rose-900" },
  { bg: "bg-amber-100", text: "text-amber-900" },
  { bg: "bg-cyan-100", text: "text-cyan-900" },
  { bg: "bg-fuchsia-100", text: "text-fuchsia-900" },
  { bg: "bg-orange-100", text: "text-orange-900" },
];
