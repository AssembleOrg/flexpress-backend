/*
  Warnings:

  - You are about to drop the column `originAddress` on the `travel_matches` table. All the data in the column will be lost.
  - You are about to drop the column `originLatitude` on the `travel_matches` table. All the data in the column will be lost.
  - You are about to drop the column `originLongitude` on the `travel_matches` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `trips` table. All the data in the column will be lost.
  - You are about to drop the column `tripTo` on the `trips` table. All the data in the column will be lost.
  - Added the required column `pickupAddress` to the `travel_matches` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pickupLatitude` to the `travel_matches` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pickupLongitude` to the `travel_matches` table without a default value. This is not possible if the table is not empty.
  - Added the required column `address` to the `trips` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."travel_matches" DROP COLUMN "originAddress",
DROP COLUMN "originLatitude",
DROP COLUMN "originLongitude",
ADD COLUMN     "pickupAddress" TEXT NOT NULL,
ADD COLUMN     "pickupLatitude" TEXT NOT NULL,
ADD COLUMN     "pickupLongitude" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."trips" DROP COLUMN "location",
DROP COLUMN "tripTo",
ADD COLUMN     "address" TEXT NOT NULL;
