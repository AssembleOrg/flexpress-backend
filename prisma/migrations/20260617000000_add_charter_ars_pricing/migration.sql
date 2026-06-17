-- AlterTable: precios informativos en pesos ARS configurables por el charter.
-- Aditivo y seguro: solo agrega columnas (pricePerWaitBlock nullable,
-- chargesReturnTrip con default), no toca datos existentes.
ALTER TABLE "users" ADD COLUMN     "chargesReturnTrip" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pricePerWaitBlock" DOUBLE PRECISION;
