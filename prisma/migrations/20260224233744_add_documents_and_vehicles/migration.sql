-- CreateEnum
CREATE TYPE "public"."DocumentReviewStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "public"."DocumentSide" AS ENUM ('front', 'back');

-- CreateEnum
CREATE TYPE "public"."UserDocumentType" AS ENUM ('dni');

-- CreateEnum
CREATE TYPE "public"."VehicleDocumentType" AS ENUM ('foto', 'cedula', 'seguro', 'vtv');

-- CreateTable
CREATE TABLE "public"."user_documents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "public"."UserDocumentType" NOT NULL,
    "side" "public"."DocumentSide",
    "fileUrl" TEXT NOT NULL,
    "status" "public"."DocumentReviewStatus" NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "user_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicles" (
    "id" TEXT NOT NULL,
    "charterId" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "alias" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" "public"."VerificationStatus" NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicle_documents" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "type" "public"."VehicleDocumentType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "status" "public"."DocumentReviewStatus" NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "expiresAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vehicle_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_documents_userId_idx" ON "public"."user_documents"("userId");

-- CreateIndex
CREATE INDEX "user_documents_type_idx" ON "public"."user_documents"("type");

-- CreateIndex
CREATE INDEX "user_documents_status_idx" ON "public"."user_documents"("status");

-- CreateIndex
CREATE INDEX "vehicles_charterId_idx" ON "public"."vehicles"("charterId");

-- CreateIndex
CREATE INDEX "vehicle_documents_vehicleId_idx" ON "public"."vehicle_documents"("vehicleId");

-- CreateIndex
CREATE INDEX "vehicle_documents_type_idx" ON "public"."vehicle_documents"("type");

-- CreateIndex
CREATE INDEX "vehicle_documents_status_idx" ON "public"."vehicle_documents"("status");

-- AddForeignKey
ALTER TABLE "public"."user_documents" ADD CONSTRAINT "user_documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicles" ADD CONSTRAINT "vehicles_charterId_fkey" FOREIGN KEY ("charterId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_documents" ADD CONSTRAINT "vehicle_documents_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
