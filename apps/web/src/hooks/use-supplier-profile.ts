"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supplierApi } from "@/lib/supplier-auth/api";

export interface SupplierCategoryItem {
  id: string;
  code: string;
  nameTr: string;
  level: number;
  breadcrumb: string;
}

const KEYS = {
  myCategories: ["supplier-profile", "categories"] as const,
  myPublicProfile: ["supplier-profile", "public-profile"] as const,
};

/**
 * V2-PUBLIC-PROFILE — PREMIUM tedarikçinin public profil verisi (editör için).
 * Backend her zaman 200 döner; isPremium=false ise STANDARD → upgrade banner.
 */
export interface SupplierProfilePhoto {
  id: string;
  url: string;
  caption: string | null;
}

export interface SupplierPublicProfile {
  slug: string | null;
  publicEnabled: boolean;
  coverImageUrl: string | null;
  aboutText: string | null;
  services: string[];
  website: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  companyName: string;
  isPremium: boolean;
  photos: SupplierProfilePhoto[];
}

export interface UpdatePublicProfilePayload {
  slug?: string;
  publicEnabled?: boolean;
  aboutText?: string;
  services?: string[];
  website?: string;
  linkedinUrl?: string;
  instagramUrl?: string;
}

/**
 * V2-PUBLIC-PROFILE — R2'a doğrudan PUT. CORS policy backend bootstrap'ında
 * idempotent set ediliyor; başarısız PUT'ta 5xx döner.
 */
async function uploadToR2(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) {
    throw new Error(`R2 PUT başarısız: ${res.status}`);
  }
}

/**
 * V2-6 — Tedarikçinin kendi kategorileri (Family seviyesi).
 * Profil sayfasında listele/düzenle akışı için kullanılır.
 */
export function useSupplierCategories() {
  return useQuery<SupplierCategoryItem[]>({
    queryKey: KEYS.myCategories,
    queryFn: () =>
      supplierApi.get("/supplier-profile/me/categories").then((r) => r.data),
    staleTime: 60 * 1000,
  });
}

export function useUpdateSupplierCategories() {
  const qc = useQueryClient();
  return useMutation<
    SupplierCategoryItem[],
    unknown,
    { categoryIds: string[] }
  >({
    mutationFn: (dto) =>
      supplierApi
        .patch("/supplier-profile/me/categories", dto)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.myCategories });
      // /me response'unda da categories var — supplier-auth store yenile
      qc.invalidateQueries({ queryKey: ["supplier-auth", "me"] });
    },
  });
}

/**
 * V2-PUBLIC-PROFILE — PREMIUM tedarikçi public profil verisi.
 * Backend her durumda 200 döner; STANDARD ise isPremium=false ile gating yapılır.
 */
export function useSupplierPublicProfile() {
  return useQuery<SupplierPublicProfile>({
    queryKey: KEYS.myPublicProfile,
    queryFn: () =>
      supplierApi.get("/supplier-profile/me/public-profile").then((r) => r.data),
    staleTime: 30 * 1000,
  });
}

export function useUpdateSupplierPublicProfile() {
  const qc = useQueryClient();
  return useMutation<
    SupplierPublicProfile,
    unknown,
    UpdatePublicProfilePayload
  >({
    mutationFn: (dto) =>
      supplierApi
        .patch("/supplier-profile/me/public-profile", dto)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.myPublicProfile });
    },
  });
}

/**
 * V2-PUBLIC-PROFILE — Cover image upload: presigned PUT → R2 → finalize.
 * Tek aksiyon: file ver, geri kalan handle edilir.
 */
export function useUploadCover() {
  const qc = useQueryClient();
  return useMutation<SupplierPublicProfile, unknown, File>({
    mutationFn: async (file) => {
      const { data: presign } = await supplierApi.post<{
        uploadUrl: string;
        key: string;
      }>("/supplier-profile/me/public-profile/cover/upload-url", {
        filename: file.name,
        mimeType: file.type,
      });
      await uploadToR2(presign.uploadUrl, file);
      const { data: profile } = await supplierApi.post<SupplierPublicProfile>(
        "/supplier-profile/me/public-profile/cover/finalize",
        { key: presign.key },
      );
      return profile;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.myPublicProfile });
    },
  });
}

export function useRemoveCover() {
  const qc = useQueryClient();
  return useMutation<SupplierPublicProfile, unknown, void>({
    mutationFn: () =>
      supplierApi
        .delete("/supplier-profile/me/public-profile/cover")
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.myPublicProfile });
    },
  });
}

export function useUploadProfilePhoto() {
  const qc = useQueryClient();
  return useMutation<
    SupplierProfilePhoto,
    unknown,
    { file: File; caption?: string }
  >({
    mutationFn: async ({ file, caption }) => {
      const { data: presign } = await supplierApi.post<{
        uploadUrl: string;
        key: string;
      }>("/supplier-profile/me/public-profile/photos/upload-url", {
        filename: file.name,
        mimeType: file.type,
      });
      await uploadToR2(presign.uploadUrl, file);
      const { data: photo } = await supplierApi.post<SupplierProfilePhoto>(
        "/supplier-profile/me/public-profile/photos",
        { key: presign.key, caption },
      );
      return photo;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.myPublicProfile });
    },
  });
}

export function useRemoveProfilePhoto() {
  const qc = useQueryClient();
  return useMutation<SupplierPublicProfile, unknown, string>({
    mutationFn: (photoId) =>
      supplierApi
        .delete(`/supplier-profile/me/public-profile/photos/${photoId}`)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.myPublicProfile });
    },
  });
}
