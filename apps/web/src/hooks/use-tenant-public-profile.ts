"use client";

// Alıcı public profili tenant editörü (zengin alanlar + logo/cover upload).

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface TenantPublicProfile {
  name: string;
  slug: string;
  industry: string | null;
  city: string | null;
  publicEnabled: boolean;
  aboutText: string | null;
  website: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  services: string[];
  foundedYear: number | null;
  employeeCount: string | null;
  certifications: string[];
}

export interface UpdateTenantPublicProfilePayload {
  publicEnabled?: boolean;
  aboutText?: string;
  website?: string;
  linkedinUrl?: string;
  instagramUrl?: string;
  services?: string[];
  foundedYear?: number | null;
  employeeCount?: string;
  certifications?: string[];
}

const KEY = ["tenant-public-profile"] as const;

export function useTenantPublicProfile() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data } = await api.get<TenantPublicProfile>(
        "/tenants/me/public-profile",
      );
      return data;
    },
  });
}

export function useUpdateTenantPublicProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateTenantPublicProfilePayload) => {
      const { data } = await api.patch<TenantPublicProfile>(
        "/tenants/me/public-profile",
        payload,
      );
      return data;
    },
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}

async function uploadToR2(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw new Error(`R2 PUT başarısız: ${res.status}`);
}

function useUploadImage(kind: "logo" | "cover") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const { data: presign } = await api.post<{
        uploadUrl: string;
        key: string;
      }>(`/tenants/me/public-profile/${kind}/upload-url`, {
        filename: file.name,
        mimeType: file.type,
      });
      await uploadToR2(presign.uploadUrl, file);
      const { data } = await api.post<TenantPublicProfile>(
        `/tenants/me/public-profile/${kind}/finalize`,
        { key: presign.key },
      );
      return data;
    },
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}

function useRemoveImage(kind: "logo" | "cover") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.delete<TenantPublicProfile>(
        `/tenants/me/public-profile/${kind}`,
      );
      return data;
    },
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}

export const useUploadTenantLogo = () => useUploadImage("logo");
export const useUploadTenantCover = () => useUploadImage("cover");
export const useRemoveTenantLogo = () => useRemoveImage("logo");
export const useRemoveTenantCover = () => useRemoveImage("cover");

export interface ImportResult extends TenantPublicProfile {
  imported: { logo: boolean; cover: boolean; about: boolean; social: boolean };
}

/** Web sitesinden logo/kapak/açıklama otomatik çek. */
export function useImportFromWebsite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (website: string) => {
      const { data } = await api.post<ImportResult>(
        "/tenants/me/public-profile/import-from-website",
        { website },
      );
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(KEY, data);
    },
  });
}
