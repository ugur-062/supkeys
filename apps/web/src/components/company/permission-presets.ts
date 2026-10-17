import type { PermissionCatalog } from "@/hooks/use-company-users";

export interface PresetGates {
  /** Firma satınalma yetkisi verebilecek pakette mi (GOLD). */
  canGrantBuy: boolean;
  /** Boş koltuk sayısı (null = sınırsız). Yeni bir grup açmak 1 koltuk ister. */
  freeSeats: number | null;
  /** Kişinin ZATEN tuttuğu gruplar — onlara yeni koltuk/paket kapısı uygulanmaz. */
  hadGroups?: { buy: boolean; sell: boolean };
}

/**
 * HAZIR SETİ PAKET VE KOLTUK KAPISINDAN GEÇİRİR (derin denetim MU-13).
 *
 * Hazır set çipi seti olduğu gibi işaretliyordu: Gold olmayan firmada
 * Satın Almacı çipi satınalma işlem tiklerini, koltuk doluyken de koltuk
 * isteyen tikleri işaretli bırakıyordu. Tablodaki kilit yalnız İŞARETSİZ
 * tiki kilitlediği için bunlar gönderilebilir kalıyor, backend
 * `assertSeatAvailable` isteği 400 ile düşürüyordu.
 *
 * Kural backend'in aynası: satınalma işlem izni yalnız GOLD'da; kişinin
 * tutmadığı her grup 1 koltuk ister. Kapıdan geçemeyen grubun yalnız İŞLEM
 * izinleri düşer — görüntüleme ve koltuksuz izinler kalır. Kişinin zaten
 * tuttuğu grup dokunulmadan kalır (yeni koltuk açmaz).
 */
export function gatePreset(
  catalog: PermissionCatalog,
  preset: readonly string[],
  gates: PresetGates,
): string[] {
  const had = gates.hadGroups ?? { buy: false, sell: false };
  const drop = new Set<string>();
  let free = gates.freeSeats;
  for (const g of ["buy", "sell"] as const) {
    const seatKeys = catalog.catalog
      .filter((c) => c.group === g && c.seat)
      .map((c) => c.key);
    if (had[g] || !preset.some((k) => seatKeys.includes(k))) continue;
    const tierOk = g !== "buy" || gates.canGrantBuy;
    const seatOk = free == null || free > 0;
    if (tierOk && seatOk) {
      if (free != null) free -= 1;
      continue;
    }
    for (const k of seatKeys) drop.add(k);
  }
  return preset.filter((k) => !drop.has(k));
}

/**
 * Davet diyaloğunun VARSAYILAN yetki seti (derin denetim MU-13). Eskiden
 * koşulsuz Satın Almacı idi; lansmanda firmaların neredeyse hepsi STANDART
 * olduğundan "yalnız e-postayı yaz, gönder" akışı satınalma paket kapısında
 * düşüyordu. Pakete göre: Gold'da Satın Almacı, değilse Satışçı; koltuk
 * doluysa koltuk tüketmeyen Görüntüleyici.
 */
export function defaultInvitePermissions(
  catalog: PermissionCatalog,
  gates: Omit<PresetGates, "hadGroups">,
): string[] {
  if (gates.freeSeats === 0) return [...(catalog.presets.GORUNTULEYICI ?? [])];
  const key = gates.canGrantBuy ? "SATIN_ALMACI" : "SATISCI";
  return gatePreset(catalog, catalog.presets[key] ?? [], gates);
}
