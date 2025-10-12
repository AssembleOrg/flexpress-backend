-- CreateEnum
CREATE TYPE "public"."TravelMatchStatus" AS ENUM ('searching', 'pending', 'accepted', 'rejected', 'completed', 'cancelled', 'expired');

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "originAddress" TEXT,
ADD COLUMN     "originLatitude" TEXT,
ADD COLUMN     "originLongitude" TEXT;

-- CreateTable
CREATE TABLE "public"."charter_availability" (
    "id" TEXT NOT NULL,
    "charterId" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT false,
    "lastToggledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "charter_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."travel_matches" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "charterId" TEXT,
    "originAddress" TEXT NOT NULL,
    "originLatitude" TEXT NOT NULL,
    "originLongitude" TEXT NOT NULL,
    "destinationAddress" TEXT NOT NULL,
    "destinationLatitude" TEXT NOT NULL,
    "destinationLongitude" TEXT NOT NULL,
    "distanceKm" DOUBLE PRECISION,
    "estimatedCredits" INTEGER,
    "maxRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "status" "public"."TravelMatchStatus" NOT NULL DEFAULT 'searching',
    "tripId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "travel_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "charter_availability_charterId_key" ON "public"."charter_availability"("charterId");

-- CreateIndex
CREATE UNIQUE INDEX "travel_matches_tripId_key" ON "public"."travel_matches"("tripId");

-- CreateIndex
CREATE INDEX "travel_matches_status_idx" ON "public"."travel_matches"("status");

-- CreateIndex
CREATE INDEX "travel_matches_userId_idx" ON "public"."travel_matches"("userId");

-- CreateIndex
CREATE INDEX "travel_matches_charterId_idx" ON "public"."travel_matches"("charterId");

-- AddForeignKey
ALTER TABLE "public"."charter_availability" ADD CONSTRAINT "charter_availability_charterId_fkey" FOREIGN KEY ("charterId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."travel_matches" ADD CONSTRAINT "travel_matches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."travel_matches" ADD CONSTRAINT "travel_matches_charterId_fkey" FOREIGN KEY ("charterId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."travel_matches" ADD CONSTRAINT "travel_matches_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "public"."trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
