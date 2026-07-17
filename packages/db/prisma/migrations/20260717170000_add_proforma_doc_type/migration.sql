-- S2: PROFORMA belge tipi — satıcı proforma faturayı ayrı/etiketli yükler
-- (eskiden "Diğer"e gömülüyordu). Akreditifte alıcı LC'yi proforma ile açar;
-- peşin ödemede alıcı proformaya göre öder. Yalnız enum değeri ekler.

ALTER TYPE "CompanyDocType" ADD VALUE IF NOT EXISTS 'PROFORMA' AFTER 'INVOICE';
