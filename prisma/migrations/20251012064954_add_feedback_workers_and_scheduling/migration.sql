-- AlterTable
ALTER TABLE "public"."travel_matches" ADD COLUMN     "scheduledDate" TIMESTAMP(3),
ADD COLUMN     "workersCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."trips" ADD COLUMN     "scheduledDate" TIMESTAMP(3),
ADD COLUMN     "workersCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."feedbacks" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedbacks_toUserId_idx" ON "public"."feedbacks"("toUserId");

-- CreateIndex
CREATE INDEX "feedbacks_tripId_idx" ON "public"."feedbacks"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "feedbacks_tripId_fromUserId_key" ON "public"."feedbacks"("tripId", "fromUserId");

-- CreateIndex
CREATE INDEX "travel_matches_scheduledDate_idx" ON "public"."travel_matches"("scheduledDate");

-- AddForeignKey
ALTER TABLE "public"."feedbacks" ADD CONSTRAINT "feedbacks_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "public"."trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."feedbacks" ADD CONSTRAINT "feedbacks_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."feedbacks" ADD CONSTRAINT "feedbacks_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
