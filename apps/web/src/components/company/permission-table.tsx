"use client";

import { useTranslations } from "next-intl";
import { Description, Field, Label } from "@headlessui/react";
import { Checkbox } from "@/components/catalyst/checkbox";
import type {
  PermissionCatalog,
  PermissionCatalogItem,
} from "@/hooks/use-company-users";
import { useRoleLabel } from "@/i18n/domain";
import { cn } from "@/lib/utils";
import { normalizePermissions } from "@rothern/shared";
import { gatePreset } from "./permission-presets";
import {
  ClipboardCheck,
  Eye,
  Settings2,
  ShoppingCart,
  Store,
  type LucideIcon,
} from "lucide-react";

const GROUP_ORDER: PermissionCatalogItem["group"][] = [
  "buy",
  "sell",
  "approval",
  "management",
];

const VIEW_OF: Partial<Record<PermissionCatalogItem["group"], string>> = {
  buy: "buy:view",
  sell: "sell:view",
};

export type PresetKey = keyof PermissionCatalog["presets"];

/** Hazır set çipleri — etiket rol sözlüğünden (`useRoleLabel`), ipucu `presetHint.<KOD>`. */
const PRESETS: { key: PresetKey; icon: LucideIcon }[] = [
  { key: "SATIN_ALMACI", icon: ShoppingCart },
  { key: "SATISCI", icon: Store },
  { key: "ONAYLAYICI", icon: ClipboardCheck },
  { key: "YONETICI", icon: Settings2 },
  { key: "GORUNTULEYICI", icon: Eye },
];

function sameSet(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((k) => b.includes(k));
}

/**
 * YETKİ TABLOSU (Faz 4, kullanıcı kararı): kişi başına gruplu tik tablosu.
 * Rol çipleri yalnız hazır seti işaretler; doğruluk kaynağı tablodur.
 * - Satınalma / Satış gruplarında bir İŞLEM tiki bile koltuk tüketir;
 *   görüntüleme ve raporlar tüketmez. İşlem tiki işaretlenince grubun
 *   görüntülemesi kendiliğinden gelir (sunucu da aynı normalizasyonu yapar).
 * - "Kullanıcı ve yetki" tikini yalnız Kurucu verir (kilitli + gerekçe).
 * - Koltuk doluysa koltuksuz kişide işlem tikleri kilitli görünür, sebep yazar.
 * - Kurucu satırında yönetim/onay/görüntüleme örtüktür (işaretli, kilitli).
 */
export function PermissionTable({
  catalog,
  value,
  onChange,
  viewerIsOwner,
  targetIsOwner = false,
  freeSeats = null,
  hadGroups = { buy: false, sell: false },
  canGrantBuy = true,
  disabled = false,
}: {
  catalog: PermissionCatalog;
  value: string[];
  onChange: (next: string[]) => void;
  viewerIsOwner: boolean;
  /** Hedef Kurucu: işlem tikleri düzenlenir, gerisi örtük. */
  targetIsOwner?: boolean;
  /** Boş koltuk sayısı (null = sınırsız). Yeni bir grup açmak 1 koltuk ister. */
  freeSeats?: number | null;
  /** Kişinin ZATEN tuttuğu gruplar (onlara koltuk kilidi uygulanmaz). */
  hadGroups?: { buy: boolean; sell: boolean };
  /**
   * Firma satınalma yetkisi verebilecek pakette mi (GOLD). Ücretsiz pakette
   * talep açma/kazandırma kapalı olduğu için yetki de VERİLEMEZ — backend
   * `assertSeatAvailable` aynı kuralı uyguluyor, bu yalnız aynası.
   */
  canGrantBuy?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("web.panel.trade.permissionTable");
  const roleLabel = useRoleLabel();
  // Görüntüleyici bir rol değil, yalnız hazır set → etiketi bu ad alanında.
  const presetLabel = (k: PresetKey) => (k === "GORUNTULEYICI" ? t("goruntuleyici") : roleLabel(k));
  // İzin/grup adları API'den Türkçe gelir (paylaşılan katalog, i18n Faz 3'e
  // dek); istek dilinde karşılığı `perm.<kod>`/`group.<kod>` anahtarında varsa
  // o basılır, yoksa sunucu etiketi — yeni bir izin eklenince ekran kırılmasın.
  const permLabel = (c: PermissionCatalogItem) => {
    const k = `perm.${c.key.replace(/:/g, "_")}`;
    return t.has(k as never) ? t(k as never) : c.label;
  };
  const groupLabel = (g: PermissionCatalogItem["group"]) =>
    t.has(`group.${g}` as never) ? t(`group.${g}` as never) : catalog.groups[g];
  const has = (k: string) => value.includes(k);
  const groupHasOp = (g: "buy" | "sell") =>
    catalog.catalog.some((c) => c.group === g && c.seat && has(c.key));
  // Bu düzenlemede yeni açılan gruplar (koltuk isteyen).
  const newGroupsTicked = (["buy", "sell"] as const).filter(
    (g) => !hadGroups[g] && groupHasOp(g),
  ).length;
  const seatLockedFor = (g: "buy" | "sell") =>
    freeSeats != null &&
    !hadGroups[g] &&
    !groupHasOp(g) &&
    freeSeats - newGroupsTicked <= 0;

  const set = (next: Set<string>) => {
    // İşlem tiki → grubun görüntülemesi örtük; Şablonlar/Bağlantılar da
    // portal görüntülemesini getirir — kural TEK KAYNAK shared
    // `normalizePermissions` (sunucu da aynısını yazar; arayüz testi T3).
    const normalized = new Set(normalizePermissions([...next]));
    for (const k of normalized) next.add(k);
    onChange(catalog.catalog.map((c) => c.key).filter((k) => next.has(k)));
  };
  const toggle = (key: string, on: boolean) => {
    const next = new Set(value);
    if (on) next.add(key);
    else next.delete(key);
    set(next);
  };
  const applyPreset = (p: PresetKey) => {
    // Paket ve koltuk kapısı hazır sete de uygulanır (derin denetim MU-13):
    // kilit yalnız işaretsiz tiki kilitlediği için çipin işaretlediği
    // satınalma/koltuk tikleri kilitsiz kalıp kayıtta 400 alıyordu.
    const preset = gatePreset(catalog, catalog.presets[p] ?? [], {
      canGrantBuy,
      freeSeats,
      hadGroups,
    });
    const next = new Set(preset);
    // Kurucu olmayan bir düzenleyici "kullanıcı ve yetki"yi veremez —
    // hazır set onu içerse de tik düşer (sunucu da reddeder).
    if (!viewerIsOwner) next.delete("users:manage");
    set(next);
  };
  const activePreset =
    PRESETS.find((p) =>
      sameSet(
        value,
        (catalog.presets[p.key] ?? []).filter(
          (k) => viewerIsOwner || k !== "users:manage",
        ),
      ),
    )?.key ?? null;

  const groups = GROUP_ORDER.map((g) => ({
    key: g,
    label: groupLabel(g),
    items: catalog.catalog.filter((c) => c.group === g),
  }));

  return (
    <div className="space-y-4">
      {!targetIsOwner ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {t("hazirSetler")}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => {
              const Icon = p.icon;
              const on = activePreset === p.key;
              // Satın Almacı seti satınalma işlem yetkisidir; paket vermiyorsa
              // (ve kişi zaten tutmuyorsa) çip seçilemez, sebebi ipucunda.
              const tierLocked =
                p.key === "SATIN_ALMACI" && !canGrantBuy && !hadGroups.buy;
              const chipDisabled = disabled || tierLocked;
              return (
                <button
                  key={p.key}
                  type="button"
                  disabled={chipDisabled}
                  title={tierLocked ? t("goldPakette") : t(`presetHint.${p.key}`)}
                  aria-pressed={on}
                  onClick={() => applyPreset(p.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition",
                    on
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 text-zinc-600 hover:border-zinc-400",
                    chipDisabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {presetLabel(p.key)}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {activePreset
              ? t("hazirSetUygulaniyorAsagidanKisiye")
              : t("kisiyeOzelYetkiKumesi")}
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((g) => {
          const isSeatGroup = g.key === "buy" || g.key === "sell";
          return (
            <fieldset
              key={g.key}
              className="rounded-xl border border-zinc-950/10 bg-white p-3"
            >
              <legend className="px-1 text-xs font-bold uppercase tracking-wide text-zinc-600">
                {g.label}
                {isSeatGroup ? (
                  <span className="ml-1.5 font-medium normal-case text-zinc-500">
                    {g.key === "buy" && !canGrantBuy
                      ? t("islemTikleriGoldPakette")
                      : t("islemTikiKoltukSayar")}
                  </span>
                ) : null}
              </legend>
              <ul className="mt-1 space-y-1.5">
                {g.items.map((c) => {
                  const implicitOwner =
                    targetIsOwner && !c.seat; // Kurucu: örtük, kilitli
                  const ownerOnly = !!c.ownerGrantsOnly && !viewerIsOwner && !has(c.key);
                  const seatBlock =
                    c.seat &&
                    (c.group === "buy" || c.group === "sell") &&
                    seatLockedFor(c.group) &&
                    !has(c.key);
                  // Paket kapısı koltuk kapısından AYRI: sorun "yer yok" değil,
                  // yetkinin o pakette karşılığı olmaması.
                  // YALNIZ işlem (koltuk) tikleri: koltuksuz "Satınalma
                  // görüntüleme" / "Satınalma raporları" her pakette verilebilir
                  // — API (koltuk kapısı yalnız buy işlem iznine) ve Görüntüleyici
                  // hazır seti de öyle; eskiden kilitliydi, çip işaretleyince
                  // açılıp tik kaldırılınca geri verilemiyordu (arayüz testi T3).
                  const tierBlock =
                    c.group === "buy" && c.seat && !canGrantBuy && !has(c.key);
                  // İşaretli satınalma işlem tiki Gold dışı pakette kaldırılabilir
                  // kalır ama sebebi yine yazılır (kişi yeni koltuk açamaz).
                  const tierNote =
                    c.group === "buy" &&
                    c.seat &&
                    !canGrantBuy &&
                    has(c.key) &&
                    !hadGroups.buy;
                  const seatViewImplied =
                    !c.seat &&
                    VIEW_OF[c.group] === c.key &&
                    g.items.some((x) => x.seat && has(x.key));
                  // Yönetim tikinin getirdiği görüntüleme (Şablonlar → satınalma,
                  // yalnız Bağlantılar → satış): kaldırılsa normalize geri ekler.
                  const mgmtViewImplied =
                    !seatViewImplied &&
                    !c.seat &&
                    has(c.key) &&
                    (c.key === "buy:view" || c.key === "sell:view") &&
                    normalizePermissions(value.filter((k) => k !== c.key)).includes(c.key);
                  const viewImplied = seatViewImplied || mgmtViewImplied;
                  const locked =
                    disabled ||
                    implicitOwner ||
                    ownerOnly ||
                    seatBlock ||
                    tierBlock ||
                    viewImplied;
                  const checked = implicitOwner || has(c.key);
                  const reason = implicitOwner
                    ? t("kurucudaOrtuk")
                    : ownerOnly
                      ? t("yalnizKurucuVerir")
                      : tierBlock || tierNote
                        ? t("goldPakette")
                        : seatBlock
                          ? t("koltukDolu")
                          : seatViewImplied
                            ? t("islemTikiIleBirlikteGelir")
                            : mgmtViewImplied
                              ? t("yonetimTikiIleBirlikteGelir")
                              : null;
                  return (
                    <li key={c.key}>
                      {/* Headless Field: Label + Checkbox bağlı — satır yazısına
                          tıklamak da kutuyu işaretler (yerel <label> Headless
                          Checkbox'ı tetiklemiyordu, arayüz testi D-134). Ad
                          kesilmez; sebep alt satırda (Description). */}
                      <Field
                        disabled={locked}
                        className={cn(
                          "flex items-start gap-2 text-sm text-zinc-800",
                          locked && "opacity-60",
                        )}
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={checked}
                          disabled={locked}
                          onChange={(on) => toggle(c.key, on)}
                        />
                        <span className="min-w-0 flex-1">
                          <Label
                            className={cn(
                              "break-words",
                              locked ? "cursor-not-allowed" : "cursor-pointer",
                            )}
                          >
                            {permLabel(c)}
                          </Label>
                          {reason ? (
                            <Description className="block text-[11px] leading-4 text-zinc-500">
                              {reason}
                            </Description>
                          ) : null}
                        </span>
                        {c.seat ? (
                          <span
                            className="mt-0.5 shrink-0 rounded bg-zinc-100 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
                            title={t("koltukTuketir")}
                          >
                            {t("koltuk")}
                          </span>
                        ) : null}
                      </Field>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
