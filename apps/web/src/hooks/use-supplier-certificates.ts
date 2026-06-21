import { supplierApi } from "@/lib/supplier-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// G9 madde 26 — Sertifikalarım.
export interface SupplierCertificate {
  id: string;
  name: string;
  url: string | null;
  createdAt: string;
}

const KEY = ["supplier-certificates"] as const;

export function useSupplierCertificates() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data } =
        await supplierApi.get<SupplierCertificate[]>("/supplier-certificates");
      return data;
    },
  });
}

async function putToR2(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw new Error(`R2 PUT başarısız: ${res.status}`);
}

/** Presigned PUT → R2'ya yükle → kayıt oluştur. */
export function useUploadCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, name }: { file: File; name: string }) => {
      const { data: presign } = await supplierApi.post<{
        uploadUrl: string;
        key: string;
      }>("/supplier-certificates/upload-url", {
        filename: file.name,
        mimeType: file.type,
      });
      await putToR2(presign.uploadUrl, file);
      const { data } = await supplierApi.post<SupplierCertificate>(
        "/supplier-certificates",
        { key: presign.key, name },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supplierApi.delete(`/supplier-certificates/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
