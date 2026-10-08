"use client";

import { useTranslations } from "next-intl";
import { foldSearchText } from "@rothern/shared";
import { useCategoriesByIds, useRoots } from "@/hooks/use-categories";
import { Check, ChevronRight, Layers, Loader2, Plus, Tag, X as XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CategoryDialogNotices,
  CategoryDialogShell,
  CategorySearchField,
  SelectionCounter,
  sameIdSet,
} from "./category-dialog-shell";
import { LoadError } from "./category-load-error";

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  maxSelection?: number;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  title?: string;
  description?: string;
}

/**
 * V2-6 — Tedarikçi kategori seçici, modal popup. Sadece Level 1 (Segment).
 * Trigger boş ise dashed CTA, dolu ise chip listesi + "Düzenle". Click → modal
 * (full-screen overlay) açılır; içerde search + checkbox listesi + footer.
 * Draft state pattern — sadece "Onayla" parent onChange'i tetikler.
 */
export function SegmentOnlyPicker({
  value,
  onChange,
  maxSelection = 10,
  error,
  disabled,
  placeholder,
  title,
  description,
}: Props) {
  const t = useTranslations("web.shared.segmentOnlyPicker");
  const [open, setOpen] = useState(false);
  // Hata penceresinin içinde satır içi gösterilir (aynı sorgu anahtarı).
  const { data: segments } = useRoots({ inlineError: true });

  const selectedSegments = useMemo(
    () => (segments ?? []).filter((s) => value.includes(s.id)),
    [segments, value],
  );

  return (
    <>
      {value.length === 0 ? (
        <button
          type="button"
          onClick={() => !disabled && setOpen(true)}
          disabled={disabled}
          className={`flex w-full items-center justify-between rounded-lg border-2 border-dashed px-4 py-3 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            error
              ? "border-rose-300 bg-rose-50 hover:bg-rose-100"
              : "border-slate-300 bg-white hover:border-zinc-400 hover:bg-zinc-50/30"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                error ? "bg-rose-100" : "bg-slate-100"
              }`}
            >
              <Tag
                className={`h-4 w-4 ${
                  error ? "text-rose-600" : "text-slate-500"
                }`}
              />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-zinc-900">
                {placeholder ?? t("faaliyetAlanlariniziSecin")}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {t("enFazlaKategoriSecebilirsiniz", { maxSelection: maxSelection })}
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-zinc-500" />
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            {selectedSegments.map((seg) => (
              <span
                key={seg.id}
                className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700"
              >
                <Tag className="h-3 w-3 shrink-0" />
                {/* Segment harfi ("B.", "AN.") iç koddur — hiçbir yerde gösterilmez. */}
                <span className="min-w-0 break-words">{seg.nameTr}</span>
                {!disabled ? (
                  <button
                    type="button"
                    onClick={() => onChange(value.filter((x) => x !== seg.id))}
                    className="-my-2 -mr-2 -ml-2 inline-flex size-8 shrink-0 items-center justify-center rounded hover:text-rose-600"
                    aria-label={t("kaldir", { name: seg.nameTr })}
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
          {!disabled ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-zinc-700"
            >
              <Plus className="h-4 w-4" />
              {t("kategoriEkleDuzenle")}
            </button>
          ) : null}
        </div>
      )}

      {error ? (
        <p className="mt-1.5 text-xs text-rose-600">{error}</p>
      ) : null}

      <SegmentOnlyModal
        isOpen={open}
        onClose={() => setOpen(false)}
        value={value}
        onConfirm={onChange}
        maxSelection={maxSelection}
        title={title ?? t("faaliyetAlanlariniz")}
        description={description ?? t("tedarikEdebileceginizAnaKategorileriSecin")}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Modal — CategorySelectorModal'la AYNI kabuk (`CategoryDialogShell`)
// ─────────────────────────────────────────────────────────────────────

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  value: string[];
  onConfirm: (ids: string[]) => void;
  maxSelection: number;
  title: string;
  description: string;
}

/**
 * "Sektör geneli" penceresi — yalnız L1 (sektör) listesi.
 *
 * Kabuk ürün/hizmet penceresiyle ortak: Headless Dialog (portal + `z-[60]` →
 * asistan çekmecesinin üstünde, odak kilitli), `dvh` yüksekliği, aynı başlık /
 * sayaç / alt satır, onaylanmamış değişiklikte kapatmadan önce soru.
 * Satırlarda segment harfi ("B.", "AN.") YOK: Ariba'nın iç kodu, 29 sektör
 * gizli olduğu için aralıklı görünüyordu.
 */
export function SegmentOnlyModal({
  isOpen,
  onClose,
  value,
  onConfirm,
  maxSelection,
  title,
  description,
}: ModalProps) {
  const tr = useTranslations("web.shared.segmentOnlyPicker");
  const [draftIds, setDraftIds] = useState<string[]>(value);
  const [search, setSearch] = useState("");
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Hata listenin yerinde "Yeniden dene" ile çizilir → genel toast ve 429'da
  // otomatik tekrar yok.
  const { data: segments, isLoading, isError, isFetching, refetch } = useRoots({
    inlineError: true,
  });

  /**
   * Kayıtlı ama listede OLMAYAN sektör (gizlenmiş segment): sayaçta sayılıyor
   * ama satırı olmadığı için ne görülebiliyor ne kaldırılabiliyordu ("1/5,
   * liste boş"). Adı `by-ids`ten alınır (gizli süzgeci yok) ve listenin
   * başında çizilir; kaldırılıp onaylanınca bir daha gelmez.
   */
  const unlistedIds = useMemo(() => {
    if (!segments) return [];
    const listed = new Set(segments.map((s) => s.id));
    return value.filter((id) => !listed.has(id));
  }, [segments, value]);
  const { data: unlistedInfo } = useCategoriesByIds(unlistedIds, {
    inlineError: true,
  });

  useEffect(() => {
    if (!isOpen) return;
    setDraftIds(value);
    setSearch("");
    setWarningMsg(null);
  }, [isOpen, value]);

  useEffect(() => {
    if (!warningMsg) return;
    const t = setTimeout(() => setWarningMsg(null), 3000);
    return () => clearTimeout(t);
  }, [warningMsg]);

  // Scroll lock + ESC + focus trap + ilk odak (arama kutusu) kabukta.

  const rows = useMemo(() => {
    const names = new Map((unlistedInfo ?? []).map((c) => [c.id, c.nameTr]));
    const unlisted = unlistedIds.map((id) => ({
      id,
      // Ad gelene dek kod: satır yine tanınır ve kaldırılabilir.
      nameTr: names.get(id) ?? id,
    }));
    return [...unlisted, ...(segments ?? [])];
  }, [segments, unlistedIds, unlistedInfo]);

  const filteredSegments = useMemo(() => {
    // TR-katlanmış karşılaştırma — "insaat" da "İnşaat"ı bulur.
    const q = foldSearchText(search);
    if (!q) return rows;
    return rows.filter((s) => foldSearchText(s.nameTr).includes(q));
  }, [rows, search]);

  const toggle = (id: string) => {
    if (draftIds.includes(id)) {
      setDraftIds(draftIds.filter((x) => x !== id));
      return;
    }
    if (draftIds.length >= maxSelection) {
      setWarningMsg(tr("enFazlaKategoriSecebilirsiniz", { maxSelection: maxSelection }));
      return;
    }
    setDraftIds([...draftIds, id]);
  };

  const handleConfirm = () => {
    onConfirm(draftIds);
    onClose();
  };

  return (
    <CategoryDialogShell
      isOpen={isOpen}
      onClose={onClose}
      dirty={!sameIdSet(draftIds, value)}
      title={title}
      description={description}
      icon={<Layers className="h-5 w-5 text-zinc-700" />}
      // Başlangıçta seçim varsa boş seçim de onaylanabilir — "Tümünü temizle"
      // sonrası düğme kapalı kalıyor, temizleme kaydedilemiyordu (arayüz testi D-345).
      confirmDisabled={draftIds.length === 0 && value.length === 0}
      confirmLabel={
        draftIds.length > 0 ? tr("onaylaN", { n: draftIds.length }) : tr("onayla")
      }
      onConfirm={handleConfirm}
    >
      <CategorySearchField
        value={search}
        onChange={setSearch}
        inputRef={searchRef}
        placeholder={tr("kategoriAra")}
      />

      <div className="shrink-0 border-b border-zinc-950/5 bg-zinc-50/60 px-4 py-2.5 sm:px-6 sm:py-3">
        <SelectionCounter
          label={tr("seciminiz")}
          count={draftIds.length}
          max={maxSelection}
          countLabel={tr("kategoriSecildiMax", {
            n: draftIds.length,
            max: maxSelection,
          })}
          clearLabel={tr("tumSecimiTemizle")}
          // Düğme temizleyince DOM'dan gider: klavyeyle tetiklendiyse odak
          // <body>'ye düşmesin, arama kutusuna geçsin.
          onClear={(viaKeyboard) => {
            if (viaKeyboard) searchRef.current?.focus();
            setDraftIds([]);
          }}
        />
      </div>

      {/* Tavan uyarısı: kısa ekranda kayan bölümün tepesine yapışır. */}
      <CategoryDialogNotices
        flash={warningMsg ? { text: warningMsg, tone: "warn" } : null}
      />

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col [@media(max-height:520px)]:flex-none">
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5 [@media(max-height:520px)]:overflow-visible">
          {isLoading || (isFetching && segments === undefined) ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : isError && segments === undefined ? (
            // Düşen istek "Sonuç bulunamadı" DEĞİLDİR.
            <LoadError
              message={tr("sektorlerYuklenemedi")}
              retryLabel={tr("yenidenDene")}
              onRetry={() => void refetch?.()}
            />
          ) : filteredSegments.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-500">
              {tr("sonucBulunamadi")}
            </div>
          ) : (
            <ul className="space-y-0.5" role="listbox" aria-multiselectable="true" aria-label={title}>
              {filteredSegments.map((segment) => {
                const isSelected = draftIds.includes(segment.id);
                return (
                  <li key={segment.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => toggle(segment.id)}
                      className={`flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors ${
                        isSelected
                          ? "bg-zinc-50 ring-1 ring-zinc-950/10"
                          : "hover:bg-zinc-50"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 ${
                          isSelected
                            ? "border-zinc-900 bg-zinc-900"
                            : "border-zinc-300 bg-white"
                        }`}
                      >
                        {isSelected ? (
                          <Check className="h-3.5 w-3.5 text-white" />
                        ) : null}
                      </span>
                      <span
                        className={`min-w-0 flex-1 text-sm ${
                          isSelected
                            ? "font-semibold text-zinc-900"
                            : "text-zinc-700"
                        }`}
                      >
                        {segment.nameTr}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </CategoryDialogShell>
  );
}
