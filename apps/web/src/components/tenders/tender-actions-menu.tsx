"use client";

import { useTranslations } from "next-intl";
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
import { useRouter } from "@/i18n/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface Props {
  id: string;
  status: string;
  format: string | null;
  closesAt: string | null;
  internalNotes: string | null;
  canEdit?: boolean;
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
  currency,
  allowedCurrencies = [],
  carryableBidCount = 0,
}: Props) {
  const t = useTranslations("web.panel.requests.tenderActionsMenu");
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
  // Pazarlığa Geç: RFQ'yu açık eksiltme turuna aktarır (createNextRound
  // ENGLISH_AUCTION). Zaten pazarlıktaysa Yeni Tur devam turlarını yönetir.
  const canStartNegotiation =
    !isAuction && (status === "OPEN" || canNewRound);

  const handleDeleteDraft = async () => {
    if (
      !(await confirm({
        title: t("taslagiSil"),
        description: t("taslakIlanKaliciOlarakSilinsin"),
        confirmLabel: t("sil"),
        destructive: true,
      }))
    )
      return;
    try {
      await deleteListing.mutateAsync(id);
      toast.success(t("taslakSilindi"));
      router.push("/company/satinalma/taleplerim");
    } catch (err) {
      toast.error(extractErrorMessage(err, t("silinemedi")));
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
        nextRoundMode === "auction" ? t("pazarlikTuruAcildi") : t("yeniTurAcildi"),
      );
      setNextRoundOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, t("yeniTurAcilamadi")));
    }
  };

  const handleCancel = async (reason: string) => {
    try {
      await cancelListing.mutateAsync(reason);
      toast.success(t("satinAlmaTalebiIptalEdildi"));
      setCancelOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, t("iptalEdilemedi")));
    }
  };

  const handleAddInvitations = async () => {
    const ids = [...inviteSel];
    if (ids.length === 0) {
      toast.error(t("enAzBirFirmaSec"));
      return;
    }
    try {
      const res = await addInvitations.mutateAsync(ids);
      toast.success(
        res.skipped
          ? t("firmaDavetEdildiZatenDavetli", { added: res.added, skipped: res.skipped })
          : t("firmaDavetEdildi", { added: res.added }),
      );
      setInviteSel(new Set());
      setInviteOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, t("davetEklenemedi")));
    }
  };

  const handleCloseNoAward = async (reason: string) => {
    try {
      await closeNoAward.mutateAsync(reason || undefined);
      toast.success(t("satinAlmaTalebiKazananOlmadan"));
      setCloseNoAwardOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, t("kapatilamadi")));
    }
  };

  const handleStartEvaluation = async () => {
    // Tek yönlü kapı: teklif alımı kalıcı durur, geri açma yok (Yeni Tur var).
    if (
      !(await confirm({
        title: t("degerlendirmeyeAl"),
        description: t("kapanisZamaniBeklenmedenTeklifAlimi"),
        confirmLabel: t("degerlendirmeyeAl"),
      }))
    )
      return;
    try {
      await startEvaluation.mutateAsync();
      toast.success(t("satinAlmaTalebiDegerlendirmeyeAlindi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("degerlendirmeyeAlinamadi")));
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
      toast.success(t("kapanisZamaniGuncellendi"));
      setClosingOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, t("guncellenemedi")));
    }
  };

  const handleSaveNotes = async () => {
    try {
      await updateNotes.mutateAsync(notes);
      toast.success(t("notlarKaydedildi"));
      setNotesOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, t("kaydedilemedi")));
    }
  };

  return (
    <>
      {/* Karma: önemli aksiyonlar görünür buton, kalanı ⋮ menüsünde (eski sistem) */}
      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <Button outline href={`/company/satinalma/taleplerim/${id}/duzenle`}>
            {t("satinAlmaTalebiniDuzenle")}
          </Button>
        ) : null}
        {isOpen ? (
          <Button outline onClick={() => setClosingOpen(true)}>
            {t("kapanisZamaniniDegistir")}
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
            {t("pazarligaGec")}
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
            {t("yeniTurAc")}
          </Button>
        ) : null}
        {canStartEvaluation ? (
          <Button
            outline
            onClick={handleStartEvaluation}
            disabled={startEvaluation.isPending}
          >
            {t("degerlendirmeyeAl")}
          </Button>
        ) : null}
        {/* Değerlendirmenin üç meşru sonucundan biri (kazandır / yeni tur /
            kimseye verme) — bu aşamada ⋮ menüsünde saklanmaz. */}
        {isInEvaluation ? (
          <Button outline onClick={() => setCloseNoAwardOpen(true)}>
            {t("kazananOlmadanKapat")}
          </Button>
        ) : null}
        <Dropdown>
          <DropdownButton outline aria-label={t("digerIslemler")}>
            <EllipsisVerticalIcon />
          </DropdownButton>
          <DropdownMenu anchor="bottom end">
            {canInvite ? (
              <DropdownItem onClick={() => setInviteOpen(true)}>
                <DropdownLabel>{t("tedarikciDavetEt")}</DropdownLabel>
              </DropdownItem>
            ) : null}
            {canInvite ? (
              <DropdownItem onClick={() => setDiscoveryOpen(true)}>
                <DropdownLabel>{t("aiIleDahaFazlaEris")}</DropdownLabel>
              </DropdownItem>
            ) : null}
            <DropdownItem onClick={() => setNotesOpen(true)}>
              <DropdownLabel>{t("icNotlar")}</DropdownLabel>
            </DropdownItem>
            <DropdownItem
              href={`/company/satinalma/taleplerim/yeni?from=${id}`}
            >
              <DropdownLabel>{t("satinAlmaTalebiniKopyala")}</DropdownLabel>
            </DropdownItem>
            {isAuction ? (
              <DropdownItem onClick={() => setHistoryOpen(true)}>
                <DropdownLabel>{t("turGecmisi")}</DropdownLabel>
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
                <DropdownLabel>{t("yeniTurOlustur")}</DropdownLabel>
              </DropdownItem>
            ) : null}
            {/* Yayında'da nadir/yıkıcı işlem → menüde; Değerlendirmede'de
                görünür buton (yukarıda), menüde tekrarlanmaz. */}
            {isOpen ? (
              <>
                <DropdownDivider />
                <DropdownItem onClick={() => setCloseNoAwardOpen(true)}>
                  <DropdownLabel className="text-red-600">
                    {t("kazananOlmadanKapat")}
                  </DropdownLabel>
                </DropdownItem>
              </>
            ) : null}
            {isOpen ? (
              <DropdownItem onClick={() => setCancelOpen(true)}>
                <DropdownLabel className="text-red-600">
                  {t("satinAlmaTalebiniIptalEt")}
                </DropdownLabel>
              </DropdownItem>
            ) : null}
            {isDraft ? (
              <>
                <DropdownDivider />
                <DropdownItem onClick={handleDeleteDraft}>
                  <DropdownLabel className="text-red-600">
                    {t("taslagiSil2")}
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
        categoryIds={[]}
        listingId={id}
      />
      <Dialog open={closingOpen} onClose={() => setClosingOpen(false)}>
        <DialogTitle>{t("kapanisZamaniniDegistir")}</DialogTitle>
        <DialogDescription>
          {t("yeniKapanisTarihSaatiniSecin")}
        </DialogDescription>
        <DialogBody>
          <Field>
            <Label>{t("kapanis")}</Label>
            {/* Saat seçilmezse gün sonu (23:59) uygulanır. */}
            <DateTimeInput
              idPrefix="change-closing"
              value={newClosing}
              onChange={setNewClosing}
              defaultTime="23:59"
              dateAriaLabel={t("kapanisTarihi")}
              timeAriaLabel={t("kapanisSaati")}
            />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setClosingOpen(false)}>
            {t("vazgec")}
          </Button>
          <Button onClick={handleChangeClosing} disabled={changeClosing.isPending}>
            {t("kaydet")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* İç notlar */}
      <Dialog open={notesOpen} onClose={() => setNotesOpen(false)}>
        <DialogTitle>{t("talepNotlariSirketIci")}</DialogTitle>
        <DialogDescription>
          {t("buNotlariSadeceFirmandakiKullanicilar")}
        </DialogDescription>
        <DialogBody>
          <Textarea
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={5000}
            placeholder={t("stratejiHatirlatmaIcDegerlendirme")}
          />
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setNotesOpen(false)}>
            {t("vazgec")}
          </Button>
          <Button onClick={handleSaveNotes} disabled={updateNotes.isPending}>
            {t("kaydet")}
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
            ? t("pazarlikAsamasinaGec")
            : t("yeniTurOlustur")}
        </DialogTitle>
        <DialogDescription>
          {nextRoundMode === "auction"
            ? isOpen
              ? t("pazarlikTuruBaslarKapanir")
              : t("pazarlikTuruBaslar")
            : t("ayniKalemVeDavetlilerleYeni")}
        </DialogDescription>
        <DialogBody className="space-y-4">
          {nextRoundMode === "free" ? (
            <Field>
              <Label>{t("satinAlmaTalebiTipi")}</Label>
              <SelectMenu
                ariaLabel={t("satinAlmaTalebiTipi")}
                value={nrType}
                onChange={(v) => setNrType(v as "RFQ" | "ENGLISH_AUCTION")}
                options={[
                  {
                    value: "ENGLISH_AUCTION",
                    label: t("pazarlikAcikEksiltme"),
                  },
                  { value: "RFQ", label: t("teklifToplamaKapaliZarf") },
                ]}
              />
            </Field>
          ) : null}
          {/* Teklifsiz aktarma uyarısı: taşınacak teklif yoksa eksiltme
              taban fiyat olmadan başlar — engellemiyoruz, bilgilendiriyoruz. */}
          {nrType === "ENGLISH_AUCTION" && carryableBidCount === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {t("buTurdaTasinabilirTeklifYok")}
            </div>
          ) : null}
          {/* Madde 13: "Önceki Teklifler" seçimi kaldırıldı — teklifler her
              zaman otomatik taşınır ve pazarlıkta geçerlilikleri süresizdir. */}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            {t.rich("mevcutTekliflerYeniTura", { strong: (c) => <strong>{c}</strong> })}
          </div>
          <Field>
            <Label>{t("yeniKapanis")}</Label>
            {/* Saat seçilmezse gün sonu (23:59) uygulanır. */}
            <DateTimeInput
              idPrefix="next-round-closing"
              value={nrClosing}
              onChange={setNrClosing}
              defaultTime="23:59"
              dateAriaLabel={t("yeniKapanisTarihi")}
              timeAriaLabel={t("yeniKapanisSaati")}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={nrEliminate}
              onChange={(e) => setNrEliminate(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300"
            />
            {t("oncekiTurdaTeklifVermeyenTedarikcileri")}
          </label>

          {nrType === "ENGLISH_AUCTION" ? (
            <>
          {/* Pazarlık kuralları sabit: monotonluk + turda tek teklif.
              Minimum pay kaldırıldı (2026-07-13) — çıpa etkisi. */}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            <p>
              {t.rich("pazarlikKurallariMetni", {
                b: (c) => <span className="font-semibold">{c}</span>,
                strong: (c) => <strong>{c}</strong>,
              })}
            </p>
          </div>
          <Field>
            <Label>{t("gorunurluk")}</Label>
            <SelectMenu
              ariaLabel={t("teklifGorunurlugu")}
              value={vis}
              onChange={(v) => setVis(v as typeof vis)}
              options={[
                { value: "OWN_ONLY", label: t("sadeceKendiTeklifi") },
                { value: "BEST_PRICE", label: t("sadeceEnIyiTeklif") },
                { value: "OWN_RANK", label: t("sadeceKendiSiralamasiOnerilen") },
                {
                  value: "BEST_AND_OWN_RANK",
                  label: t("enIyiTeklifVeKendi"),
                },
                { value: "ALL", label: t("tumTekliflerVeSiralama") },
              ]}
            />
            {/* Mod açıklamaları yalnız İLGİLİ mod seçiliyken gösterilir. */}
            {vis === "OWN_RANK" ? (
              <p className="mt-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                {t("sadeceKendiSiralamasiRekabetBaskisi")}
              </p>
            ) : null}
            {/* ALL seçilince anonimlik güvencesi açıkça yazılır (etiketteki
                belirsiz '(anonim)' eki yerine). */}
            {vis === "ALL" ? (
              <p className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {t.rich("buModdaKatilimcilarTumTeklif", { strong: (c) => <strong>{c}</strong> })}
              </p>
            ) : null}
          </Field>
          {/* Madde 13: snipe-koruma (son dakika oto-uzatma) seçeneği kaldırıldı. */}
            </>
          ) : null}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setNextRoundOpen(false)}>
            {t("vazgec")}
          </Button>
          <Button onClick={handleNextRound} disabled={nextRound.isPending}>
            {nextRoundMode === "auction"
              ? t("pazarligiBaslat")
              : t("yeniTurOlustur")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Tur geçmişi */}
      <RoundHistoryDialog
        id={id}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        currency={currency}
      />

      {/* İptal / kazansız-kapat gerekçe diyalogları (prompt yerine) */}
      <ReasonDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onSubmit={handleCancel}
        title={t("satinAlmaTalebiniIptalEt")}
        description={t("iptalGerekcesiDavetliTedarikcilereIletilir")}
        confirmLabel={t("satinAlmaTalebiniIptalEt")}
        minLength={10}
        pending={cancelListing.isPending}
        destructive
      />
      <ReasonDialog
        open={closeNoAwardOpen}
        onClose={() => setCloseNoAwardOpen(false)}
        onSubmit={handleCloseNoAward}
        title={t("kazananOlmadanKapat")}
        description={t("satinAlmaTalebiKazandirilmadanKapatilir")}
        confirmLabel={t("kapat")}
        pending={closeNoAward.isPending}
        destructive
      />

      {/* Tedarikçi davet ekle */}
      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} size="lg">
        <DialogTitle>{t("tedarikciDavetEt")}</DialogTitle>
        <DialogDescription>
          {t("bagliFirmalarindanBuSatinAlma")}
        </DialogDescription>
        <DialogBody className="space-y-3">
          <Input
            value={inviteSearch}
            onChange={(e) => setInviteSearch(e.target.value)}
            placeholder={t("firmaAra")}
          />
          <div className="max-h-72 overflow-y-auto rounded-lg border border-zinc-200">
            {inviteCompanies.length === 0 ? (
              <p className="p-4 text-center text-sm text-zinc-500">
                {connections.isLoading ? t("yukleniyor") : t("bagliFirmaYok")}
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
                    <span className="ml-auto tabular-nums text-xs text-zinc-400">
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
            {t("vazgec")}
          </Button>
          <Button
            onClick={handleAddInvitations}
            disabled={addInvitations.isPending || inviteSel.size === 0}
          >
            {t("davetEt", { size: inviteSel.size })}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
