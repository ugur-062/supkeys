-- RFQ "turda bir kez revize" kurali icin gecis backfill'i (derin denetim
-- 2026-09-29 MU-20, gozden gecirme). SALT DML, sema degismez.
--
-- carriedBidRevisable "tasinan teklif"i `activeBidRound <> currentRound` ile
-- taniyor. Bu kuraldan once RFQ gonderimleri activeBidRound YAZMIYORDU (NULL;
-- yalniz pazarlik yaziyordu). Deploy aninda 2.+ turda olan bir talepte O TURDA
-- sifirdan gonderilmis teklif (round = currentRound, activeBidRound NULL)
-- tasinmis sayilip bir kez daha revize edilebilirdi (Mimari Karar 6 delinir).
--
-- Tur baslangici = createNextRound'un onceki tur icin yazdigi
-- listing_round_snapshots satirlarinin createdAt'i (AUTO/LAZY tasimada
-- teklif varsa snapshot ayni tx'te yazilir). Tasinan teklifin submittedAt'i
-- onceki tura aittir (< snapshot) -> dokunulmaz, revize hakki korunur.
-- Onceki tur icin snapshot yoksa o tura hic teklif tasinmamistir -> turdaki
-- tum SUBMITTED teklifler bu turda gonderilmistir.
-- Idempotent: yalniz activeBidRound IS NULL satirlara dokunur.
UPDATE "listing_bids" AS b
SET "activeBidRound" = b."round"
FROM "listings" AS l
WHERE b."listingId" = l."id"
  AND l."format" IS DISTINCT FROM 'ENGLISH_AUCTION'
  AND l."currentRound" > 1
  AND b."round" = l."currentRound"
  AND b."status" = 'SUBMITTED'
  AND b."activeBidRound" IS NULL
  AND b."submittedAt" IS NOT NULL
  AND b."submittedAt" > COALESCE(
    (
      SELECT MIN(s."createdAt")
      FROM "listing_round_snapshots" AS s
      WHERE s."listingId" = l."id"
        AND s."round" = l."currentRound" - 1
    ),
    '-infinity'::timestamp
  );
