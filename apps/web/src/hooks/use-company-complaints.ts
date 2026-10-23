"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface MyComplaint {
  id: string;
  against: { name: string; rothernId: string | null };
  reason: string;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  createdAt: string;
}

/**
 * "Şikayetlerim" listesi — BİLİNÇLİ OLARAK KULLANILMIYOR (yayın için; arayüz
 * testi D-160, planlayıcı kararı DN-02). `GET /company/complaints` çalışıyor ve
 * firma açtığı şikayetin durumunu (OPEN/RESOLVED/DISMISSED) buradan okuyabilir,
 * ama yayında bunu gösteren bir ekran yok: ürün sahibi "Şikayetlerim" listesinin
 * nerede (Bağlantılar mı, Ayarlar mı) ve hangi sözcüklerle çıkacağına karar
 * verecek. Uç ve kanca SİLİNMEDİ — ekran eklenince doğrudan bağlanır.
 * TODO(DN-02): karar gelince Şikayetlerim görünümünü ekle ve bu notu kaldır.
 */
export function useMyComplaints() {
  return useQuery({
    queryKey: ["company-complaints"],
    queryFn: async () => {
      const { data } = await companyApi.get<MyComplaint[]>(
        "/company/complaints",
      );
      return data;
    },
  });
}

export function useFileComplaint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      rothernId: string;
      reason: string;
      detail?: string;
    }) => {
      const { data } = await companyApi.post("/company/complaints", input);
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-complaints"] }),
  });
}
