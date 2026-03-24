-- CreateEnum
CREATE TYPE "ServiceLine" AS ENUM ('HYBRID_CLOUD', 'DATA', 'BUSINESS_APPLICATIONS', 'APPLICATION_OPERATIONS', 'SOURCING_TALENT_MANAGEMENT');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SERVICE_LINE_MANAGER';

-- AlterEnum
ALTER TYPE "TrainingStatus" ADD VALUE 'accessed';

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "isFree" BOOLEAN;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "managedLineId" "ServiceLine",
ADD COLUMN     "onboardingDone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "serviceLine" "ServiceLine";

-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "renewalPeriodMonths" INTEGER NOT NULL DEFAULT 6;
