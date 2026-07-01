-- Clasificación del flete: chico / mediano / grande.
-- Default 'chico' para que los vehículos existentes queden catalogados y sigan operando.
DO $$ BEGIN
  CREATE TYPE "public"."VehicleSize" AS ENUM ('chico', 'mediano', 'grande');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "public"."vehicles" ADD COLUMN IF NOT EXISTS "size" "public"."VehicleSize" NOT NULL DEFAULT 'chico';
