"use client";

import { Button } from "@/components/ui/button";
import { Search, UserPlus, Users2 } from "lucide-react";

interface HeaderCardProps {
  onInviteClick: () => void;
  canInvite: boolean;
}

export function HeaderCard({ onInviteClick, canInvite }: HeaderCardProps) {
  return (
    <div className="bg-gradient-to-br from-brand-50 via-white to-indigo-50/40 border border-brand-100 rounded-2xl p-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
        <div className="flex gap-4">
          <div className="h-12 w-12 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
            <Users2 className="h-6 w-6 text-brand-600" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-brand-900">
              Tedarikçi Ağınızı Yönetin
            </h2>
            <ul className="text-sm text-slate-600 mt-2 space-y-1 list-disc list-inside marker:text-brand-300">
              <li>Onaylı tedarikçilerinizi tek yerden takip edin</li>
              <li>
                Yeni tedarikçilere davet kodu göndererek listenizi büyütün
              </li>
              <li>
                İhalelerinize davet etmek istemediklerinizi engelleyin
              </li>
            </ul>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
          <Button
            variant="secondary"
            disabled
            title="Yakında — 45 binlik tedarikçi havuzunda kategoriye göre keşif"
          >
            <Search className="h-4 w-4" />
            Tedarikçi Havuzu
            <span className="ml-1 px-1.5 py-0.5 bg-warning-100 text-warning-700 text-[10px] rounded-md font-semibold uppercase tracking-wide">
              Yakında
            </span>
          </Button>
          <Button
            variant="primary"
            onClick={onInviteClick}
            disabled={!canInvite}
            title={
              canInvite
                ? undefined
                : "Davet göndermek için COMPANY_ADMIN yetkisi gerekli"
            }
          >
            <UserPlus className="h-4 w-4" />
            Yeni Tedarikçi Davet Et
          </Button>
        </div>
      </div>
    </div>
  );
}
