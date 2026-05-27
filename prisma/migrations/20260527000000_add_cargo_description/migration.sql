ALTER TABLE "public"."trips" ADD COLUMN IF NOT EXISTS "cargoDescription" TEXT;
ALTER TABLE "public"."travel_matches" ADD COLUMN IF NOT EXISTS "cargoDescription" TEXT;
