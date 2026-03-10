/*
  Warnings:

  - You are about to drop the column `contentTypes` on the `UserSettings` table. All the data in the column will be lost.
  - You are about to drop the column `courseLanguage` on the `UserSettings` table. All the data in the column will be lost.
  - You are about to drop the column `freeContentOnly` on the `UserSettings` table. All the data in the column will be lost.
  - You are about to drop the column `preferredDuration` on the `UserSettings` table. All the data in the column will be lost.
  - You are about to drop the column `preferredPlatforms` on the `UserSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "UserSettings" DROP COLUMN "contentTypes",
DROP COLUMN "courseLanguage",
DROP COLUMN "freeContentOnly",
DROP COLUMN "preferredDuration",
DROP COLUMN "preferredPlatforms";
