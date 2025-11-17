/*
  Warnings:

  - A unique constraint covering the columns `[conversationId]` on the table `travel_matches` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_matchId_fkey";

-- AlterTable
ALTER TABLE "travel_matches" ADD COLUMN     "conversationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "travel_matches_conversationId_key" ON "travel_matches"("conversationId");

-- AddForeignKey
ALTER TABLE "travel_matches" ADD CONSTRAINT "travel_matches_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
