"use client";

import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "@/components/catalyst/dropdown";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { Button } from "@/components/ui/button";
import {
  useDeleteAddress,
  useSetDefaultAddress,
  useUpdateAddress,
} from "@/hooks/use-tenant-addresses";
import {
  ADDRESS_TYPE_META,
  type AddressType,
  type TenantAddress,
} from "@/lib/addresses/types";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Pencil,
  Plus,
  Power,
  Star,
  Trash2,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { toast } from "sonner";
// Performans audit P-4 — Lazy load
const AddressFormModal = dynamic(
  () => import("./address-form-modal").then((m) => m.AddressFormModal),
  { ssr: false },
);

interface Props {
  type: AddressType;
  addresses: TenantAddress[];
  onAddNew: () => void;
}

export function AddressGroupSection({ type, addresses, onAddNew }: Props) {
  const [expanded, setExpanded] = useState(true);
  const meta = ADDRESS_TYPE_META[type];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-5 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="text-2xl select-none" aria-hidden>
          {meta.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-brand-900">{meta.label}</p>
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border",
                meta.pillClass,
              )}
            >
              {addresses.length} adres
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {expanded ? (
        <div className="border-t border-slate-100">
          {addresses.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-500 mb-3">
                Henüz {meta.shortLabel.toLowerCase()} adresi eklenmemiş.
              </p>
              <Button variant="secondary" size="sm" onClick={onAddNew}>
                <Plus className="h-4 w-4" />
                İlk Adresi Ekle
              </Button>
            </div>
          ) : (
            <>
              <div className="px-2 [--gutter:--spacing(5)]">
                <Table dense>
                  <TableHead>
                    <TableRow>
                      <TableHeader className="w-10">#</TableHeader>
                      <TableHeader>Başlık</TableHeader>
                      <TableHeader>İl / İlçe</TableHeader>
                      <TableHeader>Durum</TableHeader>
                      <TableHeader className="w-12 text-right" />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {addresses.map((addr, idx) => (
                      <AddressRow key={addr.id} address={addr} index={idx + 1} />
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="p-4 border-t border-slate-100">
                <Button variant="secondary" size="sm" onClick={onAddNew}>
                  <Plus className="h-4 w-4" />
                  Yeni {meta.shortLabel} Adresi Ekle
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function AddressRow({
  address,
  index,
}: {
  address: TenantAddress;
  index: number;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const setDefault = useSetDefaultAddress();
  const updateAddress = useUpdateAddress();
  const deleteAddress = useDeleteAddress();

  const onSetDefault = () => {
    setDefault.mutate(address.id, {
      onSuccess: () => toast.success("Default adres güncellendi"),
      onError: (err) =>
        toast.error(extractErrorMessage(err, "İşlem başarısız")),
    });
  };

  const onToggleActive = () => {
    updateAddress.mutate(
      { id: address.id, payload: { isActive: !address.isActive } },
      {
        onSuccess: () =>
          toast.success(
            address.isActive ? "Adres pasif yapıldı" : "Adres aktifleştirildi",
          ),
        onError: (err) =>
          toast.error(extractErrorMessage(err, "İşlem başarısız")),
      },
    );
  };

  const onDelete = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `"${address.title}" adresini silmek istediğinize emin misiniz?`,
      )
    ) {
      return;
    }
    deleteAddress.mutate(address.id, {
      onSuccess: () => toast.success("Adres silindi"),
      onError: (err) => toast.error(extractErrorMessage(err, "Silme başarısız")),
    });
  };

  return (
    <>
      <TableRow>
        <TableCell className="text-zinc-500 text-sm align-top">{index}</TableCell>
        <TableCell className="align-top">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-zinc-900">{address.title}</p>
            {address.isDefault ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-warning-50 text-warning-700 border border-warning-200">
                <Star className="h-3 w-3 fill-warning-500 text-warning-500" />
                Default
              </span>
            ) : null}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">
            {address.fullAddress}
          </p>
        </TableCell>
        <TableCell className="align-top text-sm text-zinc-600">
          {address.city} / {address.district}
        </TableCell>
        <TableCell className="align-top">
          {address.isActive ? (
            <span className="inline-flex items-center gap-1.5 text-success-700 text-sm font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
              Aktif
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-zinc-500 text-sm font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
              Pasif
            </span>
          )}
        </TableCell>
        <TableCell className="align-top text-right">
          <Dropdown>
            <DropdownButton plain aria-label="Aksiyonlar">
              <MoreVertical className="h-4 w-4" />
            </DropdownButton>
            <DropdownMenu anchor="bottom end">
              <DropdownItem onClick={() => setEditOpen(true)}>
                <Pencil data-slot="icon" />
                <DropdownLabel>Düzenle</DropdownLabel>
              </DropdownItem>

              {address.isActive && !address.isDefault ? (
                <DropdownItem onClick={onSetDefault}>
                  <Star data-slot="icon" />
                  <DropdownLabel className="text-warning-700">
                    Default Yap
                  </DropdownLabel>
                </DropdownItem>
              ) : null}

              <DropdownItem onClick={onToggleActive}>
                <Power data-slot="icon" />
                <DropdownLabel>
                  {address.isActive ? "Pasif Yap" : "Aktifleştir"}
                </DropdownLabel>
              </DropdownItem>

              <DropdownItem onClick={onDelete}>
                <Trash2 data-slot="icon" />
                <DropdownLabel className="text-danger-700">Sil</DropdownLabel>
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </TableCell>
      </TableRow>

      <AddressFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        mode="edit"
        address={address}
      />
    </>
  );
}
