"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase browser client (singleton).
 *
 * SADECE recovery callback gibi public flow'lar için kullanılır:
 * anon key tarayıcıya zaten gönderiliyor (NEXT_PUBLIC_*), RLS bypass YOK.
 *
 * Domain auth bizim API üzerinden ilerler (kendi JWT'miz). Bu client'ı
 * normal sayfalarda session yönetimi için KULLANMAYIN.
 */
let cached: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase browser client env eksik: NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  cached = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return cached;
}
