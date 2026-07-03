-- Yurtiçi teslim şekli merdiveni tamamlandı (EXW→DDP'nin yurtiçi karşılığı):
-- PICKUP → CARRIER_COLLECT (ambar/kargo, nakliye alıcıya) →
-- ON_VEHICLE (araç üstü, indirme alıcıya) → DELIVERED (indirilmiş).
ALTER TYPE "ListingDeliveryTerm" ADD VALUE IF NOT EXISTS 'DOMESTIC_CARRIER_COLLECT';
ALTER TYPE "ListingDeliveryTerm" ADD VALUE IF NOT EXISTS 'DOMESTIC_ON_VEHICLE';
