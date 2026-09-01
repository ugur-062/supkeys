"use client";

import { Button } from "@/components/catalyst/button";
import { SelectMenu } from "@/components/ui/select-menu";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "@/components/catalyst/dropdown";
import { Field, Label } from "@/components/catalyst/fieldset";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { EllipsisVerticalIcon } from "@heroicons/react/16/solid";
import { Input } from "@/components/catalyst/input";
import { Textarea } from "@/components/catalyst/textarea";
import { useConfirm } from "@/components/providers/confirm-dialog";
import { ReasonDialog } from "@/components/tenders/reason-dialog";
import { RoundHistoryDialog } from "@/components/tenders/round-history-dialog";
import { useConnections } from "@/hooks/use-company-connections";
import {
  useAddInvitations,
  useCancelListing,
  useChangeClosing,
  useCloseNoAward,
  useCreateNextRound,
  useDeleteListing,
  useStartEvaluation,
  useUpdateInternalNotes,
} from "@/hooks/use-company-listings";
import { SupplierDiscoveryModal } from "@/components/tenders/supplier-discovery-modal";
import { extractErrorMessage } from "@/lib/tenders/error";
import { closesAtError } from "@/lib/tenders/closes-at";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface Props {
  id: string;
  status: string;
  format: string | null;
  closesAt: string | null;
  internalNotes: string | null;
  canEdit?: boolean;
  /** SATIS: rotalar satış portalına, metinler alıcı/artırma yönüne uyarlanır. */
  listingType?: "ALIM" | "SATIS";
  /** İlanın ana para birimi — tur geçmişi tutarları bu birimle gösterilir. */
  currency?: string;
  /** İzinli para birimleri — azaltma payının diğer birim karşılıkları
   *  (güncel TCMB) yeni-tur diyaloğunda gri satırla gösterilir. */
  allowedCurrencies?: string[];
  /** Mevcut turda yeni tura taşınabilir (SUBMITTED/LOST) teklif sayısı —
   *  0 ise pazarlığa (açık eksiltme) aktarmada "taban fiyatsız başlar" uyarısı çıkar. */
  carryableBidCount?: number;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** Alıcının ihale karar menüsü (üç-nokta) — eski header-card aksiyonları. */
export function TenderActionsMenu({
  id,
  status,
  format,
  closesAt,
  internalNotes,
  canEdit,
  listingType = "ALIM",
  currency,
  allowedCurrencies = [],
  carryableBidCount = 0,
}: Props) {
  const isSatis = listingType === "SATIS";
  const router = useRouter();
  const confirm = useConfirm();
  const changeClosing = useChangeClosing(id);
  const updateNotes = useUpdateInternalNotes(id);
  const closeNoAward = useCloseNoAward(id);
  const deleteListing = useDeleteListing();
  const nextRound = useCreateNextRound(id);
  const cancelListing = useCancelListing(id);
  const startEvaluation = useStartEvaluation(id);
  const addInvitations = useAddInvitations(id);
  const connections = useConnections();

  const isDraft = status === "DRAFT";
  const isAuction = format === "ENGLISH_AUCTION";
  const isInEvaluation = status === "IN_AWARD";
  // Değerlendirmeye Al = teklif alımını ŞİMDİ durdur + IN_AWARD. Ayrı bir
  // "Kapandı" ara durumu yok; süre dolunca cron aynı geçişi yapar. Geri
  // alınamaz — yeniden teklif almanın yolu Yeni Tur.
  const canStartEvaluation = status === "OPEN";
  // Yeni tur (+ RFQ↔İngiliz dönüşümü) değerlendirmedeki/sonuçsuz kapanmış
  // ilanda (değerlendirmenin meşru sonuçlarından biri: yeni tur açmak).
  // PAZARLIKTA AÇIKKEN DE serbest — BAFO akışının ana aracı turlardır: herkes
  // tek atışını yaptı, alıcı kapanışı beklemeden sonraki turu açabilmeli
  // (backend createNextRound OPEN'dan zaten izin veriyor).
  const canNewRound =
    status === "CLOSED_NO_AWARD" ||
    isInEvaluation ||
    (isAuction && status === "OPEN");
  const canInvite = status === "DRAFT" || status === "OPEN";
  // Pazarlığa Geç: RFQ'yu açık eksiltme/artırma turuna aktarır (createNextRound
  // ENGLISH_AUCTION). Zaten pazarlıktaysa Yeni Tur devam turlarını yönetir.
  const canStartNegotiation =
    !isAuction && (status === "OPEN" || canNewRound);

  const handleDeleteDraft = async () => {
    if (
      !(await confirm({
        title: "Taslağı sil",
        description: "Taslak ilan kalıcı olarak silinsin mi?",
        confirmLabel: "Sil",
        destructive: true,
      }))
    )
      return;
    try {
      await deleteListing.mutateAsync(id);
      toast.success("Taslak silindi");
      router.push(isSatis ? "/company/satis/ilanlarim" : "/company/satinalma/taleplerim");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Silinemedi"));
    }
  };

  const [closingOpen, setClosingOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [nextRoundOpen, setNextRoundOpen] = useState(false);
  // "auction" = Pazarlığa Geç butonundan açıldı: tip ENGLISH_AUCTION'a kilitli,
  // diyalog kopyası pazarlık diliyle. "free" = Yeni Tur menü öğesi (tip seçilir).
  const [nextRoundMode, setNextRoundMode] = useState<"free" | "auction">(
    "free",
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [closeNoAwardOpen, setCloseNoAwardOpen] = useState(false);
  const [newClosing, setNewClosing] = useState(toLocalInput(closesAt));
  const [notes, setNotes] = useState(internalNotes ?? "");

  // Diyaloglar açılırken en güncel prop'tan tohumla (detay 4 sn'de bir
  // poll'lanıp closesAt/internalNotes değişebildiğinden tek-seferlik
  // useState init bayatlardı).
  useEffect(() => {
    if (closingOpen) setNewClosing(toLocalInput(closesAt));
  }, [closingOpen, closesAt]);
  useEffect(() => {
    if (notesOpen) setNotes(internalNotes ?? "");
  }, [notesOpen, internalNotes]);

  // Yeni Tur Oluştur form durumu — madde 13 (2026-08-02): "önceki teklifler"
  // seçimi ve snipe-koruma ayarları KALDIRILDI; teklifler her zaman otomatik
  // taşınır (süresiz geçerlilikle), oto-uzatma kapalı.
  const [nrType, setNrType] = useState<"RFQ" | "ENGLISH_AUCTION">(
    "ENGLISH_AUCTION",
  );
  const [nrEliminate, setNrEliminate] = useState(false);
  const [nrClosing, setNrClosing] = useState("");
  const [vis, setVis] = useState<
    "OWN_ONLY" | "BEST_PRICE" | "OWN_RANK" | "BEST_AND_OWN_RANK" | "ALL"
  >("OWN_RANK");

  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  // Davet ekleme form durumu
  const [inviteSel, setInviteSel] = useState<Set<string>>(new Set());
  const [inviteSearch, setInviteSearch] = useState("");
  const inviteCompanies = useMemo(() => {
    const rows = (connections.data ?? [])
      .map((c) => c.company)
      .filter((c) => c.rothernId);
    const q = inviteSearch.trim().toLocaleLowerCase("tr");
    return q
      ? rows.filter((c) => c.name.toLocaleLowerCase("tr").includes(q))
      : rows;
  }, [connections.data, inviteSearch]);

  const isOpen = status === "OPEN";

  const handleNextRound = async () => {
    // F2: kapanış gelecekte + en fazla 2 yıl (backend birebir) — sessiz-400 yerine.
    const closingErr = closesAtError(nrClosing);
    if (closingErr) {
      toast.error(closingErr);
      return;
    }
    const isAuc = nrType === "ENGLISH_AUCTION";
    try {
      await nextRound.mutateAsync({
        type: nrType,
        // Madde 13: teklifler her zaman otomatik taşınır (süresiz geçerlilik).
        carryBids: "AUTO",
        eliminateNonBidders: nrEliminate,
        closesAt: new Date(nrClosing).toISOString(),
        ...(isAuc
          ? {
              bidVisibility: vis,
              // Madde 13: son-dakika oto-uzatma kaldırıldı — kapalı gönderilir.
              autoExtendOnLateBid: false,
            }
          : {}),
      });
      toast.success(
        nextRoundMode === "auction" ? "Pazarlık turu açıldı" : "Yeni tur açıldı",
      );
      setNextRoundOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Yeni tur açılamadı"));
    }
  };

  const handleCancel = async (reason: string) => {
    try {
      await cancelListing.mutateAsync(reason);
      toast.success("Satın Alma Talebi iptal edildi");
      setCancelOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "İptal edilemedi"));
    }
  };

  const handleAddInvitations = async () => {
    const ids = [...inviteSel];
    if (ids.length === 0) {
      toast.error("En az bir firma seç");
      return;
    }
    try {
      const res = await addInvitations.mutateAsync(ids);
      toast.success(
        `${res.added} firma davet edildi${res.skipped ? ` · ${res.skipped} zaten davetli` : ""}`,
      );
      setInviteSel(new Set());
      setInviteOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Davet eklenemedi"));
    }
  };

  const handleCloseNoAward = async (reason: string) => {
    try {
      await closeNoAward.mutateAsync(reason || undefined);
      toast.success("Satın Alma Talebi kazanan olmadan kapatıldı");
      setCloseNoAwardOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kapatılamadı"));
    }
  };

  const handleStartEvaluation = async () => {
    // Tek yönlü kapı: teklif alımı kalıcı durur, geri açma yok (Yeni Tur var).
    if (
      !(await confirm({
        title: "Değerlendirmeye Al",
        description:
          "Kapanış zamanı beklenmeden teklif alımı şimdi durdurulacak ve satın alma talebi " +
          "değerlendirme aşamasına geçecek. Bu işlem geri alınamaz; yeniden " +
          "teklif almak isterseniz Yeni Tur açabilirsiniz. Teklif verenler bilgilendirilir.",
        confirmLabel: "Değerlendirmeye Al",
      }))
    )
      return;
    try {
      await startEvaluation.mutateAsync();
      toast.success("Satın Alma Talebi değerlendirmeye alındı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Değerlendirmeye alınamadı"));
    }
  };

  const handleChangeClosing = async () => {
    // F2: gelecekte + en fazla 2 yıl (backend changeClosingTime birebir).
    const err = closesAtError(newClosing);
    if (err) {
      toast.error(err);
      return;
    }
    try {
      await changeClosing.mutateAsync(new Date(newClosing).toISOString());
      toast.success("Kapanış zamanı güncellendi");
      setClosingOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Güncellenemedi"));
    }
  };

  const handleSaveNotes = async () => {
    try {
      await updateNotes.mutateAsync(notes);
      toast.success("Notlar kaydedildi");
      setNotesOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kaydedilemedi"));
    }
  };

  return (
    <>
      {/* Karma: önemli aksiyonlar görünür buton, kalanı ⋮ menüsünde (eski sistem) */}
      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <Button outline href={isSatis ? `/company/satis/ilanlarim/${id}/duzenle` : `/company/satinalma/taleplerim/${id}/duzenle`}>
            Satın Alma Talebini Düzenle
          </Button>
        ) : null}
        {isOpen ? (
          <Button outline onClick={() => setClosingOpen(true)}>
            Kapanış Zamanını Değiştir
          </Button>
        ) : null}
        {canStartNegotiation ? (
          <Button
            outline
            onClick={() => {
              setNrType("ENGLISH_AUCTION");
              setNextRoundMode("auction");
              setNextRoundOpen(true);
            }}
          >
            Pazarlığa Geç
          </Button>
        ) : null}
        {/* Pazarlıkta yeni tur ANA akış — menüde saklanmaz, görünür buton. */}
        {isAuction && canNewRound ? (
          <Button
            outline
            onClick={() => {
              setNrType("ENGLISH_AUCTION");
              setNextRoundMode("free");
              setNextRoundOpen(true);
            }}
          >
            Yeni Tur Aç
          </Button>
        ) : null}
        {canStartEvaluation ? (
          <Button
            outline
            onClick={handleStartEvaluation}
            disabled={startEvaluation.isPending}
          >
            Değerlendirmeye Al
          </Button>
        ) : null}
        {/* Değerlendirmenin üç meşru sonucundan biri (kazandır / yeni tur /
            kimseye verme) — bu aşamada ⋮ menüsünde saklanmaz. */}
        {isInEvaluation ? (
          <Button outline onClick={() => setCloseNoAwardOpen(true)}>
            Kazanan Olmadan Kapat
          </Button>
        ) : null}
        <Dropdown>
          <DropdownButton outline aria-label="Diğer işlemler">
            <EllipsisVerticalIcon />
          </DropdownButton>
          <DropdownMenu anchor="bottom end">
            {canInvite ? (
              <DropdownItem onClick={() => setInviteOpen(true)}>
                <DropdownLabel>
                  {isSatis ? "Alıcı Davet Et" : "Tedarikçi Davet Et"}
                </DropdownLabel>
              </DropdownItem>
            ) : null}
            {canInvite ? (
              <DropdownItem onClick={() => setDiscoveryOpen(true)}>
                <DropdownLabel>AI ile Daha Fazla Eriş</DropdownLabel>
              </DropdownItem>
            ) : null}
            <DropdownItem onClick={() => setNotesOpen(true)}>
              <DropdownLabel>İç Notlar</DropdownLabel>
            </DropdownItem>
            <DropdownItem
              href={isSatis ? `/company/satis/ilanlarim/yeni?from=${id}` : `/company/satinalma/taleplerim/yeni?from=${id}`}
            >
              <DropdownLabel>Satın Alma Talebini Kopyala</DropdownLabel>
            </DropdownItem>
            {isAuction ? (
              <DropdownItem onClick={() => setHistoryOpen(true)}>
                <DropdownLabel>Tur Geçmişi</DropdownLabel>
              </DropdownItem>
            ) : null}
            {/* Pazarlıkta görünür 'Yeni Tur Aç' butonu var — menüde tekrarı
                yalnız RFQ (kapanmış/değerlendirme) durumunda göster. */}
            {canNewRound && !isAuction ? (
              <DropdownItem
                onClick={() => {
                  setNextRoundMode("free");
                  setNextRoundOpen(true);
                }}
              >
                <DropdownLabel>Yeni Tur Oluştur</DropdownLabel>
              </DropdownItem>
            ) : null}
            {/* Yayında'da nadir/yıkıcı işlem → menüde; Değerlendirmede'de
                görünür buton (yukarıda), menüde tekrarlanmaz. */}
            {isOpen ? (
              <>
                <DropdownDivider />
                <DropdownItem onClick={() => setCloseNoAwardOpen(true)}>
                  <DropdownLabel className="text-red-600">
                    Kazanan Olmadan Kapat
                  </DropdownLabel>
                </DropdownItem>
              </>
            ) : null}
            {isOpen ? (
              <DropdownItem onClick={() => setCancelOpen(true)}>
                <DropdownLabel className="text-red-600">
                  Satın Alma Talebini İptal Et
                </DropdownLabel>
              </DropdownItem>
            ) : null}
            {isDraft ? (
              <>
                <DropdownDivider />
                <DropdownItem onClick={handleDeleteDraft}>
                  <DropdownLabel className="text-red-600">
                    Taslağı Sil
                  </DropdownLabel>
                </DropdownItem>
              </>
            ) : null}
          </DropdownMenu>
        </Dropdown>
      </div>

      {/* Kapanış zamanını değiştir */}
      <SupplierDiscoveryModal
        isOpen={discoveryOpen}
        onClose={() => setDiscoveryOpen(false)}
        type={isSatis ? "SATIS" : "ALIM"}
        categoryIds={[]}
        listingId={id}
      />
      <Dialog open={closingOpen} onClose={() => setClosingOpen(false)}>
        <DialogTitle>Kapanış Zamanını Değiştir</DialogTitle>
        <DialogDescription>
          Yeni kapanış tarih/saatini seçin. İleri alabilir veya öne çekebilirsiniz.
        </DialogDescription>
        <DialogBody>
          <Field>
            <Label>Kapanış</Label>
            {/* Saat seçilmezse gün sonu (23:59) uygulanır. */}
            <DateTimeInput
              idPrefix="change-closing"
              value={newClosing}
              onChange={setNewClosing}
              defaultTime="23:59"
              dateAriaLabel="Kapanış tarihi"
              timeAriaLabel="Kapanış saati"
            />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setClosingOpen(false)}>
            Vazgeç
          </Button>
          <Button onClick={handleChangeClosing} disabled={changeClosing.isPending}>
            Kaydet
          </Button>
        </DialogActions>
      </Dialog>

      {/* İç notlar */}
      <Dialog open={notesOpen} onClose={() => setNotesOpen(false)}>
        <DialogTitle>İhale Notları (şirket içi)</DialogTitle>
        <DialogDescription>
          Bu notları sadece firmandaki kullanıcılar görür; {isSatis ? "alıcılar" : "tedarikçiler"} görmez.
        </DialogDescription>
        <DialogBody>
          <Textarea
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={5000}
            placeholder="Strateji, hatırlatma, iç değerlendirme…"
          />
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setNotesOpen(false)}>
            Vazgeç
          </Button>
          <Button onClick={handleSaveNotes} disabled={updateNotes.isPending}>
            Kaydet
          </Button>
        </DialogActions>
      </Dialog>

      {/* Yeni Tur Oluştur (tip seçimi = RFQ↔pazarlık dönüşümü) /
          Pazarlığa Geç (tip ENGLISH_AUCTION'a kilitli) */}
      <Dialog
        open={nextRoundOpen}
        onClose={() => setNextRoundOpen(false)}
        size="xl"
      >
        <DialogTitle>
          {nextRoundMode === "auction"
            ? "Pazarlık Aşamasına Geç"
            : "Yeni Tur Oluştur"}
        </DialogTitle>
        <DialogDescription>
          {nextRoundMode === "auction"
            ? `Aynı kalem ve davetlilerle pazarlık (${isSatis ? "açık artırma" : "açık eksiltme"}) turu başlar${isOpen ? "; mevcut teklif alımı kapanır" : ""}. Teklifler kurala göre taşınabilir.`
            : `Aynı kalem ve davetlilerle yeni bir tur açar. Tip olarak Pazarlık seçersen satın alma talebi ${isSatis ? "açık artırmaya" : "açık eksiltmeye"} dönüşür.`}
        </DialogDescription>
        <DialogBody className="space-y-4">
          {nextRoundMode === "free" ? (
            <Field>
              <Label>Satın Alma Talebi Tipi</Label>
              <SelectMenu
                ariaLabel="Satın Alma Talebi Tipi"
                value={nrType}
                onChange={(v) => setNrType(v as "RFQ" | "ENGLISH_AUCTION")}
                options={[
                  {
                    value: "ENGLISH_AUCTION",
                    label: isSatis
                      ? "Pazarlık (Açık Artırma)"
                      : "Pazarlık (Açık Eksiltme)",
                  },
                  { value: "RFQ", label: "Teklif Toplama (Kapalı Zarf)" },
                ]}
              />
            </Field>
          ) : null}
          {/* Teklifsiz aktarma uyarısı: taşınacak teklif yoksa eksiltme/artırma
              taban fiyat olmadan başlar — engellemiyoruz, bilgilendiriyoruz. */}
          {nrType === "ENGLISH_AUCTION" && carryableBidCount === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Bu turda taşınabilir teklif yok —{" "}
              {isSatis ? "açık artırma" : "açık eksiltme"} taban fiyat olmadan
              başlar; katılımcılar ilk tekliflerini serbestçe verir.{" "}
              {isSatis ? "Artış" : "Azaltma"} kuralları sonraki tekliflerde
              işler.
            </div>
          ) : null}
          {/* Madde 13: "Önceki Teklifler" seçimi kaldırıldı — teklifler her
              zaman otomatik taşınır ve pazarlıkta geçerlilikleri süresizdir. */}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            Mevcut teklifler yeni tura <strong>otomatik taşınır</strong> ve
            pazarlık boyunca <strong>süresiz geçerli</strong> olur. Taşınan
            teklif, sahibinin bu turdaki teklif hakkını yakmaz — firma dilerse
            turda bir kez fiyatını iyileştirebilir.
          </div>
          <Field>
            <Label>Yeni Kapanış</Label>
            {/* Saat seçilmezse gün sonu (23:59) uygulanır. */}
            <DateTimeInput
              idPrefix="next-round-closing"
              value={nrClosing}
              onChange={setNrClosing}
              defaultTime="23:59"
              dateAriaLabel="Yeni kapanış tarihi"
              timeAriaLabel="Yeni kapanış saati"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={nrEliminate}
              onChange={(e) => setNrEliminate(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Önceki turda teklif vermeyen {isSatis ? "alıcıları" : "tedarikçileri"} ele
          </label>

          {nrType === "ENGLISH_AUCTION" ? (
            <>
          {/* Pazarlık kuralları sabit: monotonluk + turda tek teklif.
              Minimum pay kaldırıldı (2026-07-13) — çıpa etkisi. */}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            <p>
              <span className="font-semibold">Pazarlık kuralları:</span> her
              firma tur başına <strong>bir teklif</strong> verir ve yeni
              teklifi kendi öncekinden {isSatis ? "yüksek" : "düşük"} olmak
              zorundadır. Önceki turdan taşınan teklif, sahibinin bu turdaki
              teklif hakkını yakmaz — firma dilerse turda bir kez fiyatını
              iyileştirebilir.
            </p>
          </div>
          <Field>
            <Label>Görünürlük</Label>
            <SelectMenu
              ariaLabel="Teklif Görünürlüğü"
              value={vis}
              onChange={(v) => setVis(v as typeof vis)}
              options={[
                { value: "OWN_ONLY", label: "Sadece kendi teklifi" },
                { value: "BEST_PRICE", label: "Sadece en iyi teklif" },
                { value: "OWN_RANK", label: "Sadece kendi sıralaması (Önerilen)" },
                {
                  value: "BEST_AND_OWN_RANK",
                  label: "En iyi teklif ve kendi sıralaması",
                },
                { value: "ALL", label: "Tüm teklifler ve sıralama" },
              ]}
            />
            {/* Mod açıklamaları yalnız İLGİLİ mod seçiliyken gösterilir. */}
            {vis === "OWN_RANK" ? (
              <p className="mt-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                “Sadece kendi sıralaması” rekabet baskısı yaratır,
                fiyat bilgisi sızdırmaz — çoğu satın alma talebi için en dengeli mod.
              </p>
            ) : null}
            {/* ALL seçilince anonimlik güvencesi açıkça yazılır (etiketteki
                belirsiz '(anonim)' eki yerine). */}
            {vis === "ALL" ? (
              <p className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Bu modda katılımcılar tüm teklif tutarlarını ve sıralamayı
                görür; ancak <strong>firma adları hiçbir şekilde
                gösterilmez</strong> — kimlikler tamamen anonim kalır.
              </p>
            ) : null}
          </Field>
          {/* Madde 13: snipe-koruma (son dakika oto-uzatma) seçeneği kaldırıldı. */}
            </>
          ) : null}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setNextRoundOpen(false)}>
            Vazgeç
          </Button>
          <Button onClick={handleNextRound} disabled={nextRound.isPending}>
            {nextRoundMode === "auction"
              ? "Pazarlığı Başlat"
              : "Yeni Tur Oluştur"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Tur geçmişi */}
      <RoundHistoryDialog
        id={id}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        isSatis={isSatis}
        currency={currency}
      />

      {/* İptal / kazansız-kapat gerekçe diyalogları (prompt yerine) */}
      <ReasonDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onSubmit={handleCancel}
        title="Satın Alma Talebini İptal Et"
        description={`İptal gerekçesi davetli ${isSatis ? "alıcılara" : "tedarikçilere"} iletilir. Bu işlem geri alınamaz.`}
        confirmLabel="Satın Alma Talebini İptal Et"
        minLength={10}
        pending={cancelListing.isPending}
        destructive
      />
      <ReasonDialog
        open={closeNoAwardOpen}
        onClose={() => setCloseNoAwardOpen(false)}
        onSubmit={handleCloseNoAward}
        title="Kazanan Olmadan Kapat"
        description="Satın Alma Talebi kazandırılmadan kapatılır. Gerekçe opsiyonel."
        confirmLabel="Kapat"
        pending={closeNoAward.isPending}
        destructive
      />

      {/* Tedarikçi davet ekle */}
      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} size="lg">
        <DialogTitle>{isSatis ? "Alıcı Davet Et" : "Tedarikçi Davet Et"}</DialogTitle>
        <DialogDescription>
          Bağlı firmalarından bu satın alma talebine davet etmek istediklerini seç.
        </DialogDescription>
        <DialogBody className="space-y-3">
          <Input
            value={inviteSearch}
            onChange={(e) => setInviteSearch(e.target.value)}
            placeholder="Firma ara…"
          />
          <div className="max-h-72 overflow-y-auto rounded-lg border border-zinc-200">
            {inviteCompanies.length === 0 ? (
              <p className="p-4 text-center text-sm text-zinc-500">
                {connections.isLoading ? "Yükleniyor…" : "Bağlı firma yok."}
              </p>
            ) : (
              inviteCompanies.map((c) => {
                const code = c.rothernId!;
                const checked = inviteSel.has(code);
                return (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setInviteSel((prev) => {
                          const next = new Set(prev);
                          if (next.has(code)) next.delete(code);
                          else next.add(code);
                          return next;
                        })
                      }
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    <span className="font-medium text-zinc-900">{c.name}</span>
                    <span className="ml-auto font-mono text-xs text-zinc-400">
                      {code}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setInviteOpen(false)}>
            Vazgeç
          </Button>
          <Button
            onClick={handleAddInvitations}
            disabled={addInvitations.isPending || inviteSel.size === 0}
          >
            Davet Et ({inviteSel.size})
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
