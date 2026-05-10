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

  // djb2-ish hash for deterministic color
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const palette = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;

  return { initials, bgClass: palette.bg, textClass: palette.text };
}
