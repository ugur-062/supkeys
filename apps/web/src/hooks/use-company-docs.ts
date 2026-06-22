import { api } from "@/lib/api";
import { supplierApi } from "@/lib/supplier-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type DocsSurface = "supplier" | "tenant";

export interface CompanyDocStatus {
  docType: string;
  uploaded: boolean;
  url: string | null;
}
export interface CompanyDocsResult {
  docs: CompanyDocStatus[];
  allUploaded: boolean;
  companyVerificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
}

function clientFor(surface: DocsSurface) {
  return surface === "supplier" ? supplierApi : api;
}
function basePath(surface: DocsSurface) {
  return surface === "supplier"
    ? "/supplier-self-service/company-docs"
    : "/tenant-onboarding/company-docs";
}
function meKey(surface: DocsSurface) {
  return surface === "supplier" ? ["supplier-auth", "me"] : ["auth", "me"];
}

export function useCompanyDocs(surface: DocsSurface) {
  return useQuery<CompanyDocsResult>({
    queryKey: ["company-docs", surface],
    queryFn: () => clientFor(surface).get(basePath(surface)).then((r) => r.data),
  });
}

export function useUploadCompanyDoc(surface: DocsSurface) {
  const qc = useQueryClient();
  const client = clientFor(surface);
  const base = basePath(surface);
  return useMutation({
    mutationFn: async ({ docType, file }: { docType: string; file: File }) => {
      const { data: presign } = await client.post<{
        key: string;
        uploadUrl: string;
      }>(`${base}/upload-url`, {
        docType,
        filename: file.name,
        mimeType: file.type,
      });
      // Presigned PUT — doğrudan R2'ya (auth header'sız, raw fetch).
      const put = await fetch(presign.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!put.ok) throw new Error("R2 upload failed");
      const { data } = await client.put(base, { docType, key: presign.key });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-docs", surface] });
      qc.invalidateQueries({ queryKey: meKey(surface) });
    },
  });
}
