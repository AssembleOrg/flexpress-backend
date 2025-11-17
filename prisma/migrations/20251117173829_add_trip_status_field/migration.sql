-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('pending', 'charter_completed', 'completed', 'cancelled');

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "status" "TripStatus" NOT NULL DEFAULT 'pending';
