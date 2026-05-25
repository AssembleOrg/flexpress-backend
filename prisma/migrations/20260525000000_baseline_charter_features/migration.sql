-- Baseline migration: documents what already exists in the database.
-- These tables and columns were created manually and are being registered
-- in the migration history so Prisma can generate a consistent client.

-- New enums
CREATE TYPE "public"."NotificationPriority" AS ENUM ('HIGH', 'LOW');
CREATE TYPE "public"."CharterDriverDocumentType" AS ENUM ('dni', 'license');
CREATE TYPE "public"."CharterHelperDocumentType" AS ENUM ('dni');
CREATE TYPE "public"."InquiryStatus" AS ENUM ('pending', 'answered', 'expired');
CREATE TYPE "public"."InquiryResponseCode" AS ENUM ('available_soon', 'available_today_later', 'available_tomorrow', 'not_today', 'not_available');
CREATE TYPE "public"."ReportResolutionFavor" AS ENUM ('reporter', 'reported', 'none');

-- New columns on existing tables
ALTER TABLE "public"."reports" ADD COLUMN "creditsFromReported" INTEGER;
ALTER TABLE "public"."reports" ADD COLUMN "creditsToReporter" INTEGER;
ALTER TABLE "public"."reports" ADD COLUMN "resolvedInFavorOf" "public"."ReportResolutionFavor";

ALTER TABLE "public"."charter_availability" ADD COLUMN "vehicleId" TEXT;
ALTER TABLE "public"."charter_availability" ADD CONSTRAINT "charter_availability_vehicleId_key" UNIQUE ("vehicleId");
ALTER TABLE "public"."charter_availability" ADD CONSTRAINT "charter_availability_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- notifications
CREATE TABLE "public"."notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" "public"."NotificationPriority" NOT NULL DEFAULT 'LOW',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "data" JSONB,
    "dedupeKey" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_userId_isRead_createdAt_idx" ON "public"."notifications"("userId", "isRead", "createdAt" DESC);
CREATE INDEX "notifications_userId_dedupeKey_idx" ON "public"."notifications"("userId", "dedupeKey");
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- push_subscriptions
CREATE TABLE "public"."push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "public"."push_subscriptions"("endpoint");
CREATE INDEX "push_subscriptions_userId_idx" ON "public"."push_subscriptions"("userId");
ALTER TABLE "public"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- charter_drivers
CREATE TABLE "public"."charter_drivers" (
    "id" TEXT NOT NULL,
    "charterId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "photoUrl" TEXT,
    "verificationStatus" "public"."VerificationStatus" NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "charter_drivers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "charter_drivers_charterId_idx" ON "public"."charter_drivers"("charterId");
CREATE INDEX "charter_drivers_verificationStatus_idx" ON "public"."charter_drivers"("verificationStatus");
ALTER TABLE "public"."charter_drivers" ADD CONSTRAINT "charter_drivers_charterId_fkey" FOREIGN KEY ("charterId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- charter_driver_documents
CREATE TABLE "public"."charter_driver_documents" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" "public"."CharterDriverDocumentType" NOT NULL,
    "side" "public"."DocumentSide",
    "fileUrl" TEXT NOT NULL,
    "status" "public"."DocumentReviewStatus" NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "expiresAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "charter_driver_documents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "charter_driver_documents_driverId_idx" ON "public"."charter_driver_documents"("driverId");
CREATE INDEX "charter_driver_documents_type_idx" ON "public"."charter_driver_documents"("type");
CREATE INDEX "charter_driver_documents_status_idx" ON "public"."charter_driver_documents"("status");
ALTER TABLE "public"."charter_driver_documents" ADD CONSTRAINT "charter_driver_documents_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."charter_drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- charter_helpers
CREATE TABLE "public"."charter_helpers" (
    "id" TEXT NOT NULL,
    "charterId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "photoUrl" TEXT,
    "verificationStatus" "public"."VerificationStatus" NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "charter_helpers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "charter_helpers_charterId_idx" ON "public"."charter_helpers"("charterId");
CREATE INDEX "charter_helpers_verificationStatus_idx" ON "public"."charter_helpers"("verificationStatus");
ALTER TABLE "public"."charter_helpers" ADD CONSTRAINT "charter_helpers_charterId_fkey" FOREIGN KEY ("charterId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- charter_helper_documents
CREATE TABLE "public"."charter_helper_documents" (
    "id" TEXT NOT NULL,
    "helperId" TEXT NOT NULL,
    "type" "public"."CharterHelperDocumentType" NOT NULL,
    "side" "public"."DocumentSide" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "status" "public"."DocumentReviewStatus" NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "charter_helper_documents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "charter_helper_documents_helperId_idx" ON "public"."charter_helper_documents"("helperId");
ALTER TABLE "public"."charter_helper_documents" ADD CONSTRAINT "charter_helper_documents_helperId_fkey" FOREIGN KEY ("helperId") REFERENCES "public"."charter_helpers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- trip_personnel
CREATE TABLE "public"."trip_personnel" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "driverId" TEXT,
    "helperIds" TEXT[],
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_personnel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "trip_personnel_matchId_key" ON "public"."trip_personnel"("matchId");
CREATE INDEX "trip_personnel_matchId_idx" ON "public"."trip_personnel"("matchId");
ALTER TABLE "public"."trip_personnel" ADD CONSTRAINT "trip_personnel_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "public"."travel_matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."trip_personnel" ADD CONSTRAINT "trip_personnel_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."charter_drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- availability_inquiries
CREATE TABLE "public"."availability_inquiries" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toCharterId" TEXT NOT NULL,
    "status" "public"."InquiryStatus" NOT NULL DEFAULT 'pending',
    "responseCode" "public"."InquiryResponseCode",
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "availability_inquiries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "availability_inquiries_fromUserId_toCharterId_status_idx" ON "public"."availability_inquiries"("fromUserId", "toCharterId", "status");
CREATE INDEX "availability_inquiries_toCharterId_status_idx" ON "public"."availability_inquiries"("toCharterId", "status");
CREATE INDEX "availability_inquiries_expiresAt_idx" ON "public"."availability_inquiries"("expiresAt");
ALTER TABLE "public"."availability_inquiries" ADD CONSTRAINT "availability_inquiries_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."availability_inquiries" ADD CONSTRAINT "availability_inquiries_toCharterId_fkey" FOREIGN KEY ("toCharterId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
