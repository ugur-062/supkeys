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
import { EllipsisVerticalIcon } from "@heroicons/react/16/solid";
import { Input } from "@/components/catalyst/input";
import { Textarea } from "@/components/catalyst/textarea";
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
  useUpdateInternalNotes,
} from "@/hooks/use-company-listings";
import { extractErrorMessage } from "@/lib/tenders/error";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface Props {
  id: string;
  status: string;
  format: string | null;
  closesAt: string | null;
  internalNotes: string | null;
  canEdit?: boolean;
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
}: Props) {
  const router = useRouter();
  const closeEarly = useCloseEarly(id);
  const changeClosing = useChangeClosing(id);
  const updateNotes = useUpdateInternalNotes(id);
  const closeNoAward = useCloseNoAward(id);
  const deleteListing = useDeleteListing();
  const nextRound = useCreateNextRound(id);
  const cancelListing = useCancelListing(id);
  const addInvitations = useAddInvitations(id);
  const connections = useConnections();

  const isDraft = status === "DRAFT";
  const isAuction = format === "ENGLISH_AUCTION";
  // Yeni tur (+ RFQ↔İngiliz dönüşümü) yalnızca kapanmış ilanda.
  const canNewRound = status === "CLOSED" || status === "CLOSED_NO_AWARD";
  const canInvite = status === "DRAFT" || status === "OPEN";

  const handleDeleteDraft = async () => {
    if (!confirm("Taslak ilan kalıcı olarak silinsin mi?")) return;
    try {
      await deleteListing.mutateAsync(id);
      toast.success("Taslak silindi");
      router.push("/company/satinalma/ihalelerim");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Silinemedi"));
    }
  };

  const [closingOpen, setClosingOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [nextRoundOpen, setNextRoundOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [closeNoAwardOpen, setCloseNoAwardOpen] = useState(false);
  const [newClosing, setNewClosing] = useState(toLocalInput(closesAt));
  const [notes, setNotes] = useState(internalNotes ?? "");

  // Yeni Tur Oluştur form durumu
  const [nrType, setNrType] = useState<"RFQ" | "ENGLISH_AUCTION">(
    "ENGLISH_AUCTION",
  );
  const [nrCarry, setNrCarry] = useState<"AUTO" | "LAZY" | "NONE">("AUTO");
  const [nrEliminate, setNrEliminate] = useState(false);
  const [nrClosing, setNrClosing] = useState("");
  const [decType, setDecType] = useState<"AMOUNT" | "PERCENT">("AMOUNT");
  const [decValue, setDecValue] = useState("");
  const [decBasis, setDecBasis] = useState<"OWN_LAST_BID" | "BEST_BID">(
    "OWN_LAST_BID",
  );
  const [vis, setVis] = useState<
    "OWN_ONLY" | "BEST_PRICE" | "OWN_RANK" | "BEST_AND_OWN_RANK" | "ALL"
  >("OWN_RANK");
  const [autoExtend, setAutoExtend] = useState(true);

  // Davet ekleme form durumu
  const [inviteSel, setInviteSel] = useState<Set<string>>(new Set());
  const [inviteSearch, setInviteSearch] = useState("");
  const inviteCompanies = useMemo(() => {
    const rows = (connections.data ?? [])
      .map((c) => c.company)
      .filter((c) => c.supkeysId);
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
    const v = Number(decValue.replace(",", "."));
    if (isAuc && !(v > 0)) {
      toast.error("Açık eksiltme için azaltma değeri gir");
      return;
    }
    try {
      await nextRound.mutateAsync({
        type: nrType,
        carryBids: nrCarry,
        eliminateNonBidders: nrEliminate,
        closesAt: new Date(nrClosing).toISOString(),
        ...(isAuc
          ? {
              priceDecrementType: decType,
              priceDecrementValue: v,
              priceDecrementBasis: decBasis,
              bidVisibility: vis,
              autoExtendOnLateBid: autoExtend,
            }
          : {}),
      });
      toast.success("Yeni tur açıldı");
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
    if (!confirm("İhale şimdi kapatılsın mı? Teklif alımı durur, kazandırma aşamasına geçer."))
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
          <Button outline href={`/company/satinalma/ihalelerim/${id}/duzenle`}>
            İhaleyi Düzenle
          </Button>
        ) : null}
        {isOpen ? (
          <Button outline onClick={() => setClosingOpen(true)}>
            Kapanış Zamanını Değiştir
          </Button>
        ) : null}
        {canInvite ? (
          <Button outline onClick={() => setInviteOpen(true)}>
            Tedarikçi Davet Et
          </Button>
        ) : null}

        <Dropdown>
          <DropdownButton outline aria-label="Diğer işlemler">
            Diğer İşlemler
            <EllipsisVerticalIcon />
          </DropdownButton>
          <DropdownMenu anchor="bottom end">
            <DropdownItem onClick={() => setNotesOpen(true)}>
              <DropdownLabel>İç Notlar</DropdownLabel>
            </DropdownItem>
            <DropdownItem
              href={`/company/satinalma/ihalelerim/yeni?from=${id}`}
            >
              <DropdownLabel>İhaleyi Kopyala</DropdownLabel>
            </DropdownItem>
            {isAuction ? (
              <DropdownItem onClick={() => setHistoryOpen(true)}>
                <DropdownLabel>Tur Geçmişi</DropdownLabel>
              </DropdownItem>
            ) : null}
            {canNewRound ? (
              <DropdownItem onClick={() => setNextRoundOpen(true)}>
                <DropdownLabel>Yeni Tur Oluştur</DropdownLabel>
              </DropdownItem>
            ) : null}
            {isOpen ? (
              <>
                <DropdownItem onClick={handleCloseEarly}>
                  <DropdownLabel>İhaleyi Erken Kapat</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem onClick={() => setCloseNoAwardOpen(true)}>
                  <DropdownLabel className="text-red-600">
                    Kazanan Olmadan Kapat
                  </DropdownLabel>
                </DropdownItem>
                <DropdownItem onClick={() => setCancelOpen(true)}>
                  <DropdownLabel className="text-red-600">
                    İhaleyi İptal Et
                  </DropdownLabel>
                </DropdownItem>
              </>
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
            <Input
              type="datetime-local"
              value={newClosing}
              onChange={(e) => setNewClosing(e.target.value)}
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
          Bu notları sadece firmandaki kullanıcılar görür; tedarikçiler görmez.
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

      {/* Yeni Tur Oluştur (tip seçimi = RFQ↔İngiliz dönüşümü) */}
      <Dialog
        open={nextRoundOpen}
        onClose={() => setNextRoundOpen(false)}
        size="xl"
      >
        <DialogTitle>Yeni Tur Oluştur</DialogTitle>
        <DialogDescription>
          Aynı kalem ve davetlilerle yeni bir tur açar. Tip olarak İngiliz
          Usulü seçersen ihale açık eksiltmeye dönüşür.
        </DialogDescription>
        <DialogBody className="space-y-4">
          <Field>
            <Label>İhale Tipi</Label>
            <select
              value={nrType}
              onChange={(e) =>
                setNrType(e.target.value as "RFQ" | "ENGLISH_AUCTION")
              }
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm shadow-sm"
            >
              <option value="ENGLISH_AUCTION">İngiliz Usulü (Açık Eksiltme)</option>
              <option value="RFQ">RFQ (Teklif Toplama)</option>
            </select>
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <Label>Önceki Teklifler</Label>
              <select
                value={nrCarry}
                onChange={(e) =>
                  setNrCarry(e.target.value as "AUTO" | "LAZY" | "NONE")
                }
                className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm shadow-sm"
              >
                <option value="AUTO">Otomatik taşınsın (taslak)</option>
                <option value="LAZY">Teklif verince taşınsın</option>
                <option value="NONE">Taşınmasın (sıfırdan)</option>
              </select>
            </Field>
            <Field>
              <Label>Yeni Kapanış</Label>
              <Input
                type="datetime-local"
                value={nrClosing}
                onChange={(e) => setNrClosing(e.target.value)}
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
            Önceki turda teklif vermeyen tedarikçileri ele
          </label>

          {nrType === "ENGLISH_AUCTION" ? (
            <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <Label>Fiyat Azaltma Tipi</Label>
              <select
                value={decType}
                onChange={(e) =>
                  setDecType(e.target.value as "AMOUNT" | "PERCENT")
                }
                className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm shadow-sm"
              >
                <option value="AMOUNT">Tutar</option>
                <option value="PERCENT">Yüzde</option>
              </select>
            </Field>
            <Field>
              <Label>Azaltma Değeri {decType === "PERCENT" ? "(%)" : "(₺)"}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={decValue}
                onChange={(e) => setDecValue(e.target.value)}
                placeholder="0"
              />
            </Field>
          </div>
          <Field>
            <Label>Azaltma Bazı</Label>
            <select
              value={decBasis}
              onChange={(e) =>
                setDecBasis(e.target.value as "OWN_LAST_BID" | "BEST_BID")
              }
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm shadow-sm"
            >
              <option value="OWN_LAST_BID">
                Kendi son teklifini baz alsın
              </option>
              <option value="BEST_BID">
                İhaledeki en iyi teklifi baz alsın (klasik ters eksiltme)
              </option>
            </select>
          </Field>
          <Field>
            <Label>Görünürlük</Label>
            <select
              value={vis}
              onChange={(e) =>
                setVis(e.target.value as typeof vis)
              }
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm shadow-sm"
            >
              <option value="OWN_ONLY">Sadece kendi teklifi</option>
              <option value="BEST_PRICE">Sadece en iyi teklif</option>
              <option value="OWN_RANK">Sadece kendi sıralaması</option>
              <option value="BEST_AND_OWN_RANK">
                En iyi teklif ve kendi sıralaması
              </option>
              <option value="ALL">Tüm teklifler ve sıralama (anonim)</option>
            </select>
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
            </>
          ) : null}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setNextRoundOpen(false)}>
            Vazgeç
          </Button>
          <Button onClick={handleNextRound} disabled={nextRound.isPending}>
            Yeni Tur Oluştur
          </Button>
        </DialogActions>
      </Dialog>

      {/* Tur geçmişi */}
      <RoundHistoryDialog
        id={id}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />

      {/* İptal / kazansız-kapat gerekçe diyalogları (prompt yerine) */}
      <ReasonDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onSubmit={handleCancel}
        title="İhaleyi İptal Et"
        description="İptal gerekçesi davetli tedarikçilere iletilir. Bu işlem geri alınamaz."
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
        <DialogTitle>Tedarikçi Davet Et</DialogTitle>
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
                const code = c.supkeysId!;
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
