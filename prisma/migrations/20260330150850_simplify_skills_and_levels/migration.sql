/*
  Warnings:

  - You are about to drop the column `yearsOfExperience` on the `UserSkill` table. All the data in the column will be lost.
  - Changed the type of `level` on the `UserSkill` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('iniciante', 'intermedio', 'experiente');

-- AlterTable
ALTER TABLE "UserSkill" DROP COLUMN "yearsOfExperience",
DROP COLUMN "level",
ADD COLUMN     "level" "SkillLevel" NOT NULL;
