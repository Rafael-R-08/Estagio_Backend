-- AlterTable
ALTER TABLE "LearningPlatform" ADD COLUMN     "apiKey" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;
