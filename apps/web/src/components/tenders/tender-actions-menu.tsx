"use client";

import { Button } from "@/components/catalyst/button";
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
  useCloseEarly,
  useCloseNoAward,
  useCreateNextRound,
  useDeleteListing,
  useStartEvaluation,
  useStopEvaluation,
  useUpdateInternalNotes,
} from "@/hooks/use-company-listings";
import { extractErrorMessage } from "@/lib/tenders/error";
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
  /** İlanın mevcut snipe-koruma süreleri — yeni tur diyaloğunda varsayılan
   *  olarak gösterilir (yoksa 2/2 dk). */
  autoExtendThresholdMin?: number | null;
  autoExtendByMinutes?: number | null;
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
  autoExtendThresholdMin,
  autoExtendByMinutes,
}: Props) {
  const isSatis = listingType === "SATIS";
  const router = useRouter();
  const confirm = useConfirm();
  const closeEarly = useCloseEarly(id);
  const changeClosing = useChangeClosing(id);
  const updateNotes = useUpdateInternalNotes(id);
  const closeNoAward = useCloseNoAward(id);
  const deleteListing = useDeleteListing();
  const nextRound = useCreateNextRound(id);
  const cancelListing = useCancelListing(id);
  const startEvaluation = useStartEvaluation(id);
  const stopEvaluation = useStopEvaluation(id);
  const addInvitations = useAddInvitations(id);
  const connections = useConnections();

  const isDraft = status === "DRAFT";
  const isAuction = format === "ENGLISH_AUCTION";
  const isInEvaluation = status === "IN_AWARD";
  // Değerlendirme OPSİYONEL bir sinyaldir: kazandır/ele OPEN/CLOSED'dan da
  // çalışır; buton yalnız durumu görünür kılar (tedarikçi "değerlendiriliyor").
  const canStartEvaluation = status === "OPEN" || status === "CLOSED";
  // Yeni tur (+ RFQ↔İngiliz dönüşümü) kapanmış VEYA değerlendirmedeki ilanda
  // (değerlendirmenin meşru sonuçlarından biri: yeni tur açmak). PAZARLIKTA
  // AÇIKKEN DE serbest — BAFO akışının ana aracı turlardır: herkes tek
  // atışını yaptı, alıcı kapanışı beklemeden sonraki turu açabilmeli
  // (backend createNextRound OPEN'dan zaten izin veriyor).
  const canNewRound =
    status === "CLOSED" ||
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
      router.push(isSatis ? "/company/satis/ilanlarim" : "/company/satinalma/ihalelerim");
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

  // Yeni Tur Oluştur form durumu
  const [nrType, setNrType] = useState<"RFQ" | "ENGLISH_AUCTION">(
    "ENGLISH_AUCTION",
  );
  const [nrCarry, setNrCarry] = useState<"AUTO" | "LAZY" | "NONE">("AUTO");
  const [nrEliminate, setNrEliminate] = useState(false);
  const [nrClosing, setNrClosing] = useState("");
  const [vis, setVis] = useState<
    "OWN_ONLY" | "BEST_PRICE" | "OWN_RANK" | "BEST_AND_OWN_RANK" | "ALL"
  >("OWN_RANK");
  const [autoExtend, setAutoExtend] = useState(true);
  // Snipe-koruma süreleri: tetik penceresi + uzatma miktarı (dk, 1-30).
  // Varsayılan ilanın mevcut ayarı; hiç kurulmamışsa 2/2.
  const [aeThreshold, setAeThreshold] = useState(
    String(autoExtendThresholdMin ?? 2),
  );
  const [aeBy, setAeBy] = useState(String(autoExtendByMinutes ?? 2));

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
    if (!nrClosing) {
      toast.error("Kapanış tarihi seç");
      return;
    }
    const isAuc = nrType === "ENGLISH_AUCTION";
    // Snipe-koruma süreleri: backend DTO ile aynı sınır (1-30 dk).
    const aeThresholdNum = Number(aeThreshold);
    const aeByNum = Number(aeBy);
    if (isAuc && autoExtend) {
      const valid = (n: number) => Number.isInteger(n) && n >= 1 && n <= 30;
      if (!valid(aeThresholdNum) || !valid(aeByNum)) {
        toast.error("Snipe koruma süreleri 1-30 dakika arası olmalı");
        return;
      }
    }
    try {
      await nextRound.mutateAsync({
        type: nrType,
        carryBids: nrCarry,
        eliminateNonBidders: nrEliminate,
        closesAt: new Date(nrClosing).toISOString(),
        ...(isAuc
          ? {
              bidVisibility: vis,
              autoExtendOnLateBid: autoExtend,
              ...(autoExtend
                ? {
                    autoExtendThresholdMin: aeThresholdNum,
                    autoExtendByMinutes: aeByNum,
                  }
                : {}),
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
      toast.success("İhale iptal edildi");
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

  const handleCloseEarly = async () => {
    if (
      !(await confirm({
        title: "İhaleyi erken kapat",
        description:
          "İhale şimdi kapatılsın mı? Teklif alımı durur, kazandırma aşamasına geçer.",
        confirmLabel: "Kapat",
      }))
    )
      return;
    try {
      await closeEarly.mutateAsync();
      toast.success("İhale erken kapatıldı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kapatılamadı"));
    }
  };

  const handleCloseNoAward = async (reason: string) => {
    try {
      await closeNoAward.mutateAsync(reason || undefined);
      toast.success("İhale kazanan olmadan kapatıldı");
      setCloseNoAwardOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kapatılamadı"));
    }
  };

  const handleStartEvaluation = async () => {
    if (
      isOpen &&
      !(await confirm({
        title: "Değerlendirmeye Al",
        description:
          "Teklif alımı durdurulacak ve ihale değerlendirme aşamasına alınacak. " +
          (isSatis ? "Alıcılar" : "Tedarikçiler") +
          " \"teklifiniz değerlendiriliyor\" bilgisini görür.",
        confirmLabel: "Değerlendirmeye Al",
      }))
    )
      return;
    try {
      await startEvaluation.mutateAsync();
      toast.success("İhale değerlendirmeye alındı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Değerlendirmeye alınamadı"));
    }
  };

  const handleStopEvaluation = async () => {
    try {
      await stopEvaluation.mutateAsync();
      toast.success("Değerlendirmeden çıkarıldı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem yapılamadı"));
    }
  };

  const handleChangeClosing = async () => {
    if (!newClosing) {
      toast.error("Tarih seç");
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
          <Button outline href={isSatis ? `/company/satis/ilanlarim/${id}/duzenle` : `/company/satinalma/ihalelerim/${id}/duzenle`}>
            İhaleyi Düzenle
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

        <Dropdown>
          <DropdownButton outline aria-label="Diğer işlemler">
            Diğer İşlemler
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
            <DropdownItem onClick={() => setNotesOpen(true)}>
              <DropdownLabel>İç Notlar</DropdownLabel>
            </DropdownItem>
            <DropdownItem
              href={isSatis ? `/company/satis/ilanlarim/yeni?from=${id}` : `/company/satinalma/ihalelerim/yeni?from=${id}`}
            >
              <DropdownLabel>İhaleyi Kopyala</DropdownLabel>
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
            {isInEvaluation ? (
              <DropdownItem onClick={handleStopEvaluation}>
                <DropdownLabel>Değerlendirmeden Çıkar</DropdownLabel>
              </DropdownItem>
            ) : null}
            {isOpen ? (
              <DropdownItem onClick={handleCloseEarly}>
                <DropdownLabel>İhaleyi Erken Kapat</DropdownLabel>
              </DropdownItem>
            ) : null}
            {isOpen || status === "CLOSED" || isInEvaluation ? (
              <>
                <DropdownDivider />
                {/* Değerlendirmenin meşru sonuçlarından biri: kimseye vermemek. */}
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
                  İhaleyi İptal Et
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
      <Dialog open={closingOpen} onClose={() => setClosingOpen(false)}>
        <DialogTitle>Kapanış Zamanını Değiştir</DialogTitle>
        <DialogDescription>
          Yeni kapanış tarih/saatini seç. İleri alabilir veya öne çekebilirsin.
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
            : `Aynı kalem ve davetlilerle yeni bir tur açar. Tip olarak Pazarlık seçersen ihale ${isSatis ? "açık artırmaya" : "açık eksiltmeye"} dönüşür.`}
        </DialogDescription>
        <DialogBody className="space-y-4">
          {nextRoundMode === "free" ? (
            <Field>
              <Label>İhale Tipi</Label>
              <select
                aria-label="İhale Tipi"
                value={nrType}
                onChange={(e) =>
                  setNrType(e.target.value as "RFQ" | "ENGLISH_AUCTION")
                }
                className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm shadow-sm"
              >
                <option value="ENGLISH_AUCTION">{isSatis ? "Pazarlık (Açık Artırma)" : "Pazarlık (Açık Eksiltme)"}</option>
                <option value="RFQ">Teklif Toplama (Kapalı Zarf)</option>
              </select>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <Label>Önceki Teklifler</Label>
              <select
                aria-label="Önceki Teklifler"
                value={nrCarry}
                onChange={(e) =>
                  setNrCarry(e.target.value as "AUTO" | "LAZY" | "NONE")
                }
                className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm shadow-sm"
              >
                <option value="AUTO">Otomatik taşınsın</option>
                <option value="LAZY">Teklif verince taşınsın</option>
                <option value="NONE">Taşınmasın (sıfırdan)</option>
              </select>
              {/* AUTO geçerlilik-farkındadır: geçerli teklif CANLI taşınır,
                  süresi dolan fiyatı korunarak taslağa düşer (backend
                  createNextRound ile birebir). */}
              <dl className="mt-1.5 space-y-1 text-xs text-zinc-500">
                <div>
                  <dt className="inline font-medium text-zinc-600">
                    Otomatik taşınsın:
                  </dt>{" "}
                  <dd className="inline">
                    geçerli teklifler yeni tura gönderilmiş olarak aynen
                    taşınır; geçerlilik süresi dolanlar fiyatı korunarak
                    taslağa düşer. Taşınan teklif, sahibinin bu turdaki
                    teklif hakkını yakmaz — firma dilerse turda bir kez
                    fiyatını iyileştirebilir.
                  </dd>
                </div>
                <div>
                  <dt className="inline font-medium text-zinc-600">
                    Teklif verince taşınsın:
                  </dt>{" "}
                  <dd className="inline">
                    önceki teklifler fiyatı korunarak taslağa çekilir;
                    katılımcı onaylayıp göndermeden yeni turda görünmez.
                  </dd>
                </div>
                <div>
                  <dt className="inline font-medium text-zinc-600">
                    Taşınmasın:
                  </dt>{" "}
                  <dd className="inline">
                    önceki teklifler kapanmış sayılır, herkes yeni turda
                    sıfırdan teklif verir.
                  </dd>
                </div>
              </dl>
            </Field>
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
          </div>
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
            <select
              aria-label="Teklif Görünürlüğü"
              value={vis}
              onChange={(e) =>
                setVis(e.target.value as typeof vis)
              }
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm shadow-sm"
            >
              <option value="OWN_ONLY">Sadece kendi teklifi</option>
              <option value="BEST_PRICE">Sadece en iyi teklif</option>
              <option value="OWN_RANK">
                Sadece kendi sıralaması (Önerilen)
              </option>
              <option value="BEST_AND_OWN_RANK">
                En iyi teklif ve kendi sıralaması
              </option>
              <option value="ALL">Tüm teklifler ve sıralama</option>
            </select>
            {/* Mod açıklamaları yalnız İLGİLİ mod seçiliyken gösterilir. */}
            {vis === "OWN_RANK" ? (
              <p className="mt-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                &quot;Sadece kendi sıralaması&quot; rekabet baskısı yaratır,
                fiyat bilgisi sızdırmaz — çoğu ihale için en dengeli mod.
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
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={autoExtend}
              onChange={(e) => setAutoExtend(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Son dakika gelen teklif kapanışı otomatik uzatsın (snipe koruma)
          </label>
          {autoExtend ? (
            <div className="ml-6 flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm text-zinc-700">
              Son
              <input
                type="number"
                min={1}
                max={30}
                value={aeThreshold}
                onChange={(e) => setAeThreshold(e.target.value)}
                aria-label="Tetik penceresi (dakika)"
                className="w-16 rounded-md border border-zinc-300 px-2 py-1 text-right text-sm"
              />
              dk içinde teklif gelirse kapanış
              <input
                type="number"
                min={1}
                max={30}
                value={aeBy}
                onChange={(e) => setAeBy(e.target.value)}
                aria-label="Uzatma süresi (dakika)"
                className="w-16 rounded-md border border-zinc-300 px-2 py-1 text-right text-sm"
              />
              dk uzatılsın.
            </div>
          ) : null}
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
        title="İhaleyi İptal Et"
        description={`İptal gerekçesi davetli ${isSatis ? "alıcılara" : "tedarikçilere"} iletilir. Bu işlem geri alınamaz.`}
        confirmLabel="İhaleyi İptal Et"
        minLength={10}
        pending={cancelListing.isPending}
        destructive
      />
      <ReasonDialog
        open={closeNoAwardOpen}
        onClose={() => setCloseNoAwardOpen(false)}
        onSubmit={handleCloseNoAward}
        title="Kazanan Olmadan Kapat"
        description="İhale kazandırılmadan kapatılır. Gerekçe opsiyonel."
        confirmLabel="Kapat"
        pending={closeNoAward.isPending}
        destructive
      />

      {/* Tedarikçi davet ekle */}
      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} size="lg">
        <DialogTitle>{isSatis ? "Alıcı Davet Et" : "Tedarikçi Davet Et"}</DialogTitle>
        <DialogDescription>
          Bağlı firmalarından bu ihaleye davet etmek istediklerini seç.
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
