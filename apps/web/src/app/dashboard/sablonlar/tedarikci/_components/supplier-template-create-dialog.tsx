"use client";

// V2-7+ — Tedarikçi Şablonu Oluştur / Düzenle / Görüntüle modal'ı.
// Adım 1: isim + erişim
// Adım 2: tedarikçi arama + tablo (checkbox multi-select)
// templateId verilirse düzenle/görüntüle modu; seçili firmalar ön-yüklenir.
// Sahibi değilse salt-okunur (backend zaten düzenlemeyi engeller).

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
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
import * as Dialog from "@radix-ui/react-dialog";
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
    <Dialog.Root open={open} onOpenChange={(o) => !o && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 z-[60]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]",
            "w-[calc(100vw-2rem)] max-w-4xl bg-white rounded-2xl shadow-2xl outline-none",
            "max-h-[90vh] flex flex-col",
          )}
        >
          <header className="px-5 py-4 border-b border-surface-border flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-brand-600" />
              </div>
              <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                {title}
              </Dialog.Title>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={mutation.isPending}
              aria-label="Kapat"
              className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
            {loadingDetail ? (
              <p className="text-sm text-slate-500 text-center py-8">
                Yükleniyor…
              </p>
            ) : (
              <>
                {readOnly ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-surface-border text-sm text-slate-600">
                    <Lock className="w-4 h-4 shrink-0" />
                    Bu şablonu yalnızca oluşturan kişi düzenleyebilir.
                    Görüntüleme modundasınız.
                  </div>
                ) : null}

                {/* STEP 1 — İsim + Erişim */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-5 h-5 text-brand-600" />
                    <h3 className="font-semibold text-brand-900">
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
                      <div className="flex items-center gap-4 px-3 py-2.5 rounded-lg border border-surface-border bg-white text-sm">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            checked={isPublic}
                            onChange={() => setIsPublic(true)}
                            disabled={readOnly}
                          />
                          Herkese Açık
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            checked={!isPublic}
                            onChange={() => setIsPublic(false)}
                            disabled={readOnly}
                          />
                          Özel
                        </label>
                      </div>
                    </Field>
                  </div>
                </section>

                {/* Seçili firmalar */}
                {selectedList.length > 0 ? (
                  <section>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                      Seçili Firmalar ({selectedList.length})
                    </h4>
                    <div className="overflow-x-auto border border-surface-border rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-700">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold w-12">
                              No
                            </th>
                            <th className="px-3 py-2 text-left font-semibold">
                              Firma Adı
                            </th>
                            <th className="px-3 py-2 text-left font-semibold">
                              Vergi Numarası
                            </th>
                            <th className="px-3 py-2 text-left font-semibold">
                              İl
                            </th>
                            {!readOnly ? (
                              <th className="px-3 py-2 text-right font-semibold w-12">
                                {" "}
                              </th>
                            ) : null}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedList.map((s, idx) => (
                            <tr
                              key={s.id}
                              className="border-t border-surface-border"
                            >
                              <td className="px-3 py-2 text-slate-500">
                                {idx + 1}
                              </td>
                              <td className="px-3 py-2 font-semibold text-brand-900">
                                <div className="flex items-center gap-2">
                                  <Building2 className="w-4 h-4 text-slate-400" />
                                  {s.companyName}
                                </div>
                              </td>
                              <td className="px-3 py-2 font-mono text-slate-600">
                                {s.taxNumber}
                              </td>
                              <td className="px-3 py-2 text-slate-600">
                                {s.city}
                              </td>
                              {!readOnly ? (
                                <td className="px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => removeSelected(s.id)}
                                    className="text-slate-400 hover:text-danger-600 p-1"
                                    title="Şablondan çıkar"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </td>
                              ) : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ) : null}

                {/* STEP 2 — Tedarikçi arama (salt-okunurda gizli) */}
                {!readOnly ? (
                  <section>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center">
                        2
                      </span>
                      <h3 className="font-semibold text-brand-900">
                        Tedarikçi firmalarını belirleyiniz
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 ml-8 mb-3">
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
                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={onlyApproved}
                          onChange={(e) => setOnlyApproved(e.target.checked)}
                        />
                        Yalnızca onaylı tedarikçilerimi göster.
                      </label>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={clearSearch}>
                          Tümünü Temizle
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleSearch}
                        >
                          Firma Ara
                        </Button>
                      </div>
                    </div>

                    {searched ? (
                      <div className="mt-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                          Tedarikçiler ({filteredSuppliers.length})
                        </h4>
                        {listQuery.isLoading ? (
                          <p className="text-sm text-slate-500 text-center py-4">
                            Yükleniyor…
                          </p>
                        ) : filteredSuppliers.length === 0 ? (
                          <p className="text-sm text-slate-500 text-center py-4">
                            Eşleşen tedarikçi bulunamadı.
                          </p>
                        ) : (
                          <div className="overflow-x-auto border border-surface-border rounded-lg">
                            <table className="w-full text-sm">
                              <thead className="bg-slate-50 text-slate-700">
                                <tr>
                                  <th className="px-3 py-2 text-center font-semibold w-10">
                                    <input
                                      type="checkbox"
                                      checked={
                                        filteredSuppliers.length > 0 &&
                                        filteredSuppliers.every((s) =>
                                          selectedIds.includes(s.supplier.id),
                                        )
                                      }
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        filteredSuppliers.forEach((s) =>
                                          toggleSupplier(
                                            {
                                              id: s.supplier.id,
                                              companyName:
                                                s.supplier.companyName,
                                              taxNumber: s.supplier.taxNumber,
                                              city: s.supplier.city,
                                            },
                                            checked,
                                          ),
                                        );
                                      }}
                                    />
                                  </th>
                                  <th className="px-3 py-2 text-left font-semibold w-12">
                                    No
                                  </th>
                                  <th className="px-3 py-2 text-left font-semibold">
                                    Tipi
                                  </th>
                                  <th className="px-3 py-2 text-left font-semibold">
                                    Firma Adı
                                  </th>
                                  <th className="px-3 py-2 text-left font-semibold">
                                    Vergi Numarası
                                  </th>
                                  <th className="px-3 py-2 text-left font-semibold">
                                    Ülke / İl
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredSuppliers.map((s, idx) => {
                                  const id = s.supplier.id;
                                  const checked = selectedIds.includes(id);
                                  return (
                                    <tr
                                      key={id}
                                      className={cn(
                                        "border-t border-surface-border hover:bg-slate-50/40",
                                        checked && "bg-brand-50/40",
                                      )}
                                    >
                                      <td className="px-3 py-2 text-center">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={(e) =>
                                            toggleSupplier(
                                              {
                                                id,
                                                companyName:
                                                  s.supplier.companyName,
                                                taxNumber: s.supplier.taxNumber,
                                                city: s.supplier.city,
                                              },
                                              e.target.checked,
                                            )
                                          }
                                        />
                                      </td>
                                      <td className="px-3 py-2 text-slate-500">
                                        {idx + 1}
                                      </td>
                                      <td className="px-3 py-2">
                                        <span
                                          className={cn(
                                            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                                            s.supplier.membership === "PREMIUM"
                                              ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
                                              : "bg-orange-50 text-orange-700 border border-orange-200",
                                          )}
                                        >
                                          {s.supplier.membership === "PREMIUM"
                                            ? "Premium"
                                            : "Standart"}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 font-semibold text-brand-900">
                                        <div className="flex items-center gap-2">
                                          <Building2 className="w-4 h-4 text-slate-400" />
                                          {s.supplier.companyName}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 font-mono text-slate-600">
                                        {s.supplier.taxNumber}
                                      </td>
                                      <td className="px-3 py-2">
                                        <div className="font-semibold">
                                          Türkiye
                                        </div>
                                        <div className="text-xs text-slate-500">
                                          {s.supplier.city}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </>
            )}
          </div>

          <footer className="px-5 py-4 border-t border-surface-border flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
