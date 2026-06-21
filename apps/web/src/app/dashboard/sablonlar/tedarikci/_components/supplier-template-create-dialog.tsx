"use client";

// V2-7+ — Tedarikçi Şablonu Oluştur / Düzenle / Görüntüle modal'ı.
// Adım 1: isim + erişim
// Adım 2: tedarikçi arama + tablo (checkbox multi-select)
// templateId verilirse düzenle/görüntüle modu; seçili firmalar ön-yüklenir.
// Sahibi değilse salt-okunur (backend zaten düzenlemeyi engeller).

import { Checkbox } from "@/components/catalyst/checkbox";
import { Radio, RadioGroup } from "@/components/catalyst/radio";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSuppliers } from "@/hooks/use-tenant-suppliers";
import {
  useCreateSupplierTemplate,
  useSupplierTemplate,
  useUpdateSupplierTemplate,
  type SupplierTemplatePayload,
} from "@/hooks/use-templates";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { Building2, CheckCircle2, Lock, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Verilirse düzenle/görüntüle modu; yoksa yeni oluşturma. */
  templateId?: string | null;
}

type SupplierMeta = {
  id: string;
  companyName: string;
  taxNumber: string;
  city: string;
};

export function SupplierTemplateCreateDialog({
  open,
  onClose,
  templateId,
}: Props) {
  const isEditMode = !!templateId;
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [searched, setSearched] = useState(false);

  // Search filters
  const [searchName, setSearchName] = useState("");
  const [searchTax, setSearchTax] = useState("");
  const [searchCity, setSearchCity] = useState("");
  const [onlyApproved, setOnlyApproved] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Seçili firmaların gösterim bilgileri (aramadan bağımsız listelemek için).
  const [selectedMeta, setSelectedMeta] = useState<Record<string, SupplierMeta>>(
    {},
  );

  const createMutation = useCreateSupplierTemplate();
  const updateMutation = useUpdateSupplierTemplate();
  const detail = useSupplierTemplate(open && isEditMode ? templateId : null);

  const readOnly = isEditMode && detail.data ? !detail.data.isOwnedByMe : false;
  const mutation = isEditMode ? updateMutation : createMutation;

  const listQuery = useSuppliers({
    status: onlyApproved ? "ACTIVE" : undefined,
    search: searchName || undefined,
    pageSize: 50,
  });

  // Düzenleme modunda detay gelince formu + seçili firmaları ön-doldur.
  useEffect(() => {
    if (!open || !isEditMode || !detail.data) return;
    const d = detail.data;
    setName(d.name);
    setIsPublic(d.isPublic);
    setSelectedIds(d.suppliers.map((s) => s.id));
    setSelectedMeta(
      Object.fromEntries(
        d.suppliers.map((s) => [
          s.id,
          {
            id: s.id,
            companyName: s.companyName,
            taxNumber: s.taxNumber,
            city: s.city,
          },
        ]),
      ),
    );
  }, [open, isEditMode, detail.data]);

  const filteredSuppliers = useMemo(() => {
    const items = listQuery.data?.items ?? [];
    return items.filter((s) => {
      if (
        searchTax &&
        !s.supplier.taxNumber.toLowerCase().includes(searchTax.toLowerCase())
      )
        return false;
      if (
        searchCity &&
        !s.supplier.city.toLowerCase().includes(searchCity.toLowerCase())
      )
        return false;
      return true;
    });
  }, [listQuery.data, searchTax, searchCity]);

  const selectedList = useMemo(
    () => selectedIds.map((id) => selectedMeta[id]).filter(Boolean),
    [selectedIds, selectedMeta],
  );

  const reset = () => {
    setName("");
    setIsPublic(true);
    setSearched(false);
    setSearchName("");
    setSearchTax("");
    setSearchCity("");
    setOnlyApproved(false);
    setSelectedIds([]);
    setSelectedMeta({});
  };

  const handleClose = () => {
    if (mutation.isPending) return;
    reset();
    onClose();
  };

  const handleSearch = () => setSearched(true);

  const clearSearch = () => {
    setSearchName("");
    setSearchTax("");
    setSearchCity("");
    setOnlyApproved(false);
    setSearched(false);
  };

  const toggleSupplier = (meta: SupplierMeta, checked: boolean) => {
    setSelectedIds((prev) =>
      checked
        ? Array.from(new Set([...prev, meta.id]))
        : prev.filter((x) => x !== meta.id),
    );
    setSelectedMeta((prev) => ({ ...prev, [meta.id]: meta }));
  };

  const removeSelected = (id: string) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  };

  const canSubmit =
    !readOnly && name.trim().length >= 2 && selectedIds.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const payload: SupplierTemplatePayload = {
      name: name.trim(),
      isPublic,
      supplierIds: selectedIds,
    };
    try {
      if (isEditMode && templateId) {
        await updateMutation.mutateAsync({ id: templateId, payload });
        toast.success(`Şablon güncellendi (${selectedIds.length} tedarikçi)`);
      } else {
        await createMutation.mutateAsync(payload);
        toast.success(`Şablon oluşturuldu (${selectedIds.length} tedarikçi)`);
      }
      reset();
      onClose();
    } catch (err) {
      toast.error(
        extractErrorMessage(
          err,
          isEditMode ? "Güncellenemedi" : "Oluşturulamadı",
        ),
      );
    }
  };

  const title = isEditMode
    ? readOnly
      ? "Tedarikçi Şablonu"
      : "Tedarikçi Şablonu Düzenle"
    : "Tedarikçi Şablonu Oluştur";

  const loadingDetail = isEditMode && detail.isLoading;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      className="relative z-[60]"
    >
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-zinc-950/40 transition data-closed:opacity-0 data-enter:duration-200 data-leave:duration-150"
      />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-2 sm:p-4">
        <DialogPanel
          transition
          className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-950/10 outline-none transition data-closed:opacity-0 data-enter:duration-200 data-leave:duration-150 data-closed:data-enter:scale-95"
        >
          <header className="px-5 py-4 border-b border-zinc-950/5 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100">
                <Users className="h-5 w-5 text-zinc-700" />
              </div>
              <DialogTitle className="font-semibold text-lg text-zinc-950">
                {title}
              </DialogTitle>
            </div>
            <IconButton
              aria-label="Kapat"
              onClick={handleClose}
              disabled={mutation.isPending}
            >
              <X className="w-5 h-5" />
            </IconButton>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
            {loadingDetail ? (
              <p className="text-sm text-zinc-500 text-center py-8">
                Yükleniyor…
              </p>
            ) : (
              <>
                {readOnly ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-50 ring-1 ring-zinc-950/10 text-sm text-zinc-600">
                    <Lock className="w-4 h-4 shrink-0" />
                    Bu şablonu yalnızca oluşturan kişi düzenleyebilir.
                    Görüntüleme modundasınız.
                  </div>
                ) : null}

                {/* STEP 1 — İsim + Erişim */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-5 h-5 text-zinc-700" />
                    <h3 className="font-semibold text-zinc-950">
                      Şablon adını belirleyiniz
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <Field>
                        <Label htmlFor="stpl-name" required>
                          Şablon Adı
                        </Label>
                        <Input
                          id="stpl-name"
                          placeholder="Ör. IT Sarf Malzeme Tedarikçileri"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          maxLength={120}
                          disabled={readOnly}
                        />
                      </Field>
                    </div>
                    <Field>
                      <Label>Şablon Erişimi</Label>
                      <RadioGroup
                        value={isPublic ? "public" : "private"}
                        onChange={(v) => setIsPublic(v === "public")}
                        className="flex items-center gap-4 px-3 py-2.5 rounded-lg ring-1 ring-zinc-950/10 bg-white text-sm"
                      >
                        <div className="flex items-center gap-1.5">
                          <Radio value="public" disabled={readOnly} />
                          <span>Herkese Açık</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Radio value="private" disabled={readOnly} />
                          <span>Özel</span>
                        </div>
                      </RadioGroup>
                    </Field>
                  </div>
                </section>

                {/* Seçili firmalar */}
                {selectedList.length > 0 ? (
                  <section>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
                      Seçili Firmalar ({selectedList.length})
                    </h4>
                    <div className="rounded-lg ring-1 ring-zinc-950/10 px-3 [--gutter:--spacing(3)]">
                      <Table dense>
                        <TableHead>
                          <TableRow>
                            <TableHeader className="w-12">No</TableHeader>
                            <TableHeader>Firma Adı</TableHeader>
                            <TableHeader>Vergi Numarası</TableHeader>
                            <TableHeader>İl</TableHeader>
                            {!readOnly ? (
                              <TableHeader className="w-12 text-right" />
                            ) : null}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {selectedList.map((s, idx) => (
                            <TableRow key={s.id}>
                              <TableCell className="text-zinc-500">
                                {idx + 1}
                              </TableCell>
                              <TableCell className="font-semibold text-zinc-900">
                                <div className="flex items-center gap-2">
                                  <Building2 className="w-4 h-4 text-zinc-400" />
                                  {s.companyName}
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-zinc-600">
                                {s.taxNumber}
                              </TableCell>
                              <TableCell className="text-zinc-600">
                                {s.city}
                              </TableCell>
                              {!readOnly ? (
                                <TableCell className="text-right">
                                  <IconButton
                                    tone="danger"
                                    onClick={() => removeSelected(s.id)}
                                    aria-label="Şablondan çıkar"
                                    title="Şablondan çıkar"
                                  >
                                    <X className="w-4 h-4" />
                                  </IconButton>
                                </TableCell>
                              ) : null}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </section>
                ) : null}

                {/* STEP 2 — Tedarikçi arama (salt-okunurda gizli) */}
                {!readOnly ? (
                  <section>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-6 h-6 rounded-full bg-zinc-900 text-white text-xs font-bold flex items-center justify-center">
                        2
                      </span>
                      <h3 className="font-semibold text-zinc-950">
                        Tedarikçi firmalarını belirleyiniz
                      </h3>
                    </div>
                    <p className="text-xs text-zinc-500 ml-8 mb-3">
                      Eklemek istediğiniz firmaları seçerek şablonu
                      güncelleyiniz.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Field>
                        <Label htmlFor="sf-name">Firma Adı</Label>
                        <Input
                          id="sf-name"
                          value={searchName}
                          onChange={(e) => setSearchName(e.target.value)}
                        />
                      </Field>
                      <Field>
                        <Label htmlFor="sf-tax">Vergi Numarası</Label>
                        <Input
                          id="sf-tax"
                          value={searchTax}
                          onChange={(e) => setSearchTax(e.target.value)}
                        />
                      </Field>
                      <Field>
                        <Label htmlFor="sf-city">İl</Label>
                        <Input
                          id="sf-city"
                          placeholder="Ör. İstanbul"
                          value={searchCity}
                          onChange={(e) => setSearchCity(e.target.value)}
                        />
                      </Field>
                    </div>

                    <div className="flex items-center justify-between flex-wrap gap-2 mt-3">
                      <div className="flex items-center gap-2 text-sm text-zinc-700">
                        <Checkbox
                          checked={onlyApproved}
                          onChange={setOnlyApproved}
                        />
                        <span>Yalnızca onaylı tedarikçilerimi göster.</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={clearSearch}>
                          Tümünü Temizle
                        </Button>
                        <Button variant="primary" size="sm" onClick={handleSearch}>
                          Firma Ara
                        </Button>
                      </div>
                    </div>

                    {searched ? (
                      <div className="mt-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
                          Tedarikçiler ({filteredSuppliers.length})
                        </h4>
                        {listQuery.isLoading ? (
                          <p className="text-sm text-zinc-500 text-center py-4">
                            Yükleniyor…
                          </p>
                        ) : filteredSuppliers.length === 0 ? (
                          <p className="text-sm text-zinc-500 text-center py-4">
                            Eşleşen tedarikçi bulunamadı.
                          </p>
                        ) : (
                          <div className="rounded-lg ring-1 ring-zinc-950/10 px-3 [--gutter:--spacing(3)]">
                            <Table dense>
                              <TableHead>
                                <TableRow>
                                  <TableHeader className="w-10 text-center">
                                    <Checkbox
                                      checked={
                                        filteredSuppliers.length > 0 &&
                                        filteredSuppliers.every((s) =>
                                          selectedIds.includes(s.supplier.id),
                                        )
                                      }
                                      onChange={(checked) => {
                                        filteredSuppliers.forEach((s) =>
                                          toggleSupplier(
                                            {
                                              id: s.supplier.id,
                                              companyName: s.supplier.companyName,
                                              taxNumber: s.supplier.taxNumber,
                                              city: s.supplier.city,
                                            },
                                            checked,
                                          ),
                                        );
                                      }}
                                    />
                                  </TableHeader>
                                  <TableHeader className="w-12">No</TableHeader>
                                  <TableHeader>Tipi</TableHeader>
                                  <TableHeader>Firma Adı</TableHeader>
                                  <TableHeader>Vergi Numarası</TableHeader>
                                  <TableHeader>Ülke / İl</TableHeader>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {filteredSuppliers.map((s, idx) => {
                                  const id = s.supplier.id;
                                  const checked = selectedIds.includes(id);
                                  return (
                                    <TableRow
                                      key={id}
                                      className={cn(checked && "bg-zinc-50")}
                                    >
                                      <TableCell className="text-center">
                                        <Checkbox
                                          checked={checked}
                                          onChange={(c) =>
                                            toggleSupplier(
                                              {
                                                id,
                                                companyName:
                                                  s.supplier.companyName,
                                                taxNumber: s.supplier.taxNumber,
                                                city: s.supplier.city,
                                              },
                                              c,
                                            )
                                          }
                                        />
                                      </TableCell>
                                      <TableCell className="text-zinc-500">
                                        {idx + 1}
                                      </TableCell>
                                      <TableCell>
                                        <span
                                          className={cn(
                                            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                                            s.supplier.membership === "PREMIUM"
                                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                                              : "bg-zinc-100 text-zinc-700 border border-zinc-200",
                                          )}
                                        >
                                          {s.supplier.membership === "PREMIUM"
                                            ? "Premium"
                                            : "Standart"}
                                        </span>
                                      </TableCell>
                                      <TableCell className="font-semibold text-zinc-900">
                                        <div className="flex items-center gap-2">
                                          <Building2 className="w-4 h-4 text-zinc-400" />
                                          {s.supplier.companyName}
                                        </div>
                                      </TableCell>
                                      <TableCell className="font-mono text-zinc-600">
                                        {s.supplier.taxNumber}
                                      </TableCell>
                                      <TableCell>
                                        <div className="font-semibold">
                                          Türkiye
                                        </div>
                                        <div className="text-xs text-zinc-500">
                                          {s.supplier.city}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </>
            )}
          </div>

          <footer className="px-5 py-4 border-t border-zinc-950/5 flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-500">
              {selectedIds.length > 0
                ? `${selectedIds.length} tedarikçi seçildi`
                : "Şablona eklemek için tedarikçi seçin"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                disabled={mutation.isPending}
              >
                {readOnly ? "Kapat" : "Vazgeç"}
              </Button>
              {!readOnly ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!canSubmit || mutation.isPending || loadingDetail}
                  loading={mutation.isPending}
                >
                  {isEditMode ? "Değişiklikleri Kaydet" : "Şablonu Oluştur"}
                </Button>
              ) : null}
            </div>
          </footer>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
