/*
  Warnings:

  - The values [SOFTINSA_LEARNING] on the enum `ChunkSource` will be removed. If these variants are still used in the database, this will fail.
  - The values [mid,lead] on the enum `ExperienceLevel` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `durationHours` on the `Certificate` table. All the data in the column will be lost.
  - You are about to drop the column `durationHours` on the `TrainingRecord` table. All the data in the column will be lost.
  - You are about to drop the column `department` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `jobTitle` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `preferredLanguage` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `techStack` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `adminCanSeeRecs` on the `UserSettings` table. All the data in the column will be lost.
  - You are about to drop the column `aiCanUseHistory` on the `UserSettings` table. All the data in the column will be lost.
  - You are about to drop the column `aiExplainReasoning` on the `UserSettings` table. All the data in the column will be lost.
  - You are about to drop the column `aiRecommendationMode` on the `UserSettings` table. All the data in the column will be lost.
  - You are about to drop the column `aiResponseDetail` on the `UserSettings` table. All the data in the column will be lost.
  - You are about to drop the column `aiResponseLanguage` on the `UserSettings` table. All the data in the column will be lost.
  - You are about to drop the `RecommendationFeedback` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ScrapedPage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SoftinsaLearning` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserPreferences` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterEnum
BEGIN;
CREATE TYPE "ChunkSource_new" AS ENUM ('EXTERNAL_COURSE', 'COURSE_ANALYSIS', 'RAG_KNOWLEDGE');
ALTER TABLE "public"."text_chunks" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "text_chunks" ALTER COLUMN "source" TYPE "ChunkSource_new" USING ("source"::text::"ChunkSource_new");
ALTER TYPE "ChunkSource" RENAME TO "ChunkSource_old";
ALTER TYPE "ChunkSource_new" RENAME TO "ChunkSource";
DROP TYPE "public"."ChunkSource_old";
ALTER TABLE "text_chunks" ALTER COLUMN "source" SET DEFAULT 'RAG_KNOWLEDGE';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "ExperienceLevel_new" AS ENUM ('junior', 'intermedio', 'senior', 'especialista', 'lider');
ALTER TABLE "User" ALTER COLUMN "experienceLevel" TYPE "ExperienceLevel_new" USING ("experienceLevel"::text::"ExperienceLevel_new");
ALTER TYPE "ExperienceLevel" RENAME TO "ExperienceLevel_old";
ALTER TYPE "ExperienceLevel_new" RENAME TO "ExperienceLevel";
DROP TYPE "public"."ExperienceLevel_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "RecommendationFeedback" DROP CONSTRAINT "RecommendationFeedback_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserPreferences" DROP CONSTRAINT "UserPreferences_userId_fkey";

-- AlterTable
ALTER TABLE "Certificate" DROP COLUMN "durationHours",
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "TrainingRecord" DROP COLUMN "durationHours",
ADD COLUMN     "priorityOrder" INTEGER,
ADD COLUMN     "progressLevel" TEXT,
ADD COLUMN     "relevance" SMALLINT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "department",
DROP COLUMN "jobTitle",
DROP COLUMN "location",
DROP COLUMN "preferredLanguage",
DROP COLUMN "techStack",
ADD COLUMN     "userFunction" TEXT;

-- AlterTable
ALTER TABLE "UserSettings" DROP COLUMN "adminCanSeeRecs",
DROP COLUMN "aiCanUseHistory",
DROP COLUMN "aiExplainReasoning",
DROP COLUMN "aiRecommendationMode",
DROP COLUMN "aiResponseDetail",
DROP COLUMN "aiResponseLanguage";

-- DropTable
DROP TABLE "RecommendationFeedback";

-- DropTable
DROP TABLE "ScrapedPage";

-- DropTable
DROP TABLE "SoftinsaLearning";

-- DropTable
DROP TABLE "UserPreferences";

-- CreateTable
CREATE TABLE "TrainingDocument" (
    "id" TEXT NOT NULL,
    "trainingId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSkill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillName" TEXT NOT NULL,
    "yearsOfExperience" INTEGER,
    "level" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSkill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingDocument_trainingId_idx" ON "TrainingDocument"("trainingId");

-- CreateIndex
CREATE INDEX "UserSkill_userId_idx" ON "UserSkill"("userId");

-- AddForeignKey
ALTER TABLE "TrainingDocument" ADD CONSTRAINT "TrainingDocument_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "TrainingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSkill" ADD CONSTRAINT "UserSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
