-- Account-level sanction for charters (the account/titular is the punishable unit).
-- active = operativa, warned = aviso visible, banned = no puede operar ni aparecer en búsqueda.
DO $$ BEGIN
  CREATE TYPE "public"."AccountStatus" AS ENUM ('active', 'warned', 'banned');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "accountStatus" "public"."AccountStatus" NOT NULL DEFAULT 'active';
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "accountStatusNote" TEXT;
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "accountStatusAt" TIMESTAMP(3);
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "accountStatusBy" TEXT;
