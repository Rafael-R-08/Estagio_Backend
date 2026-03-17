-- CreateTable
CREATE TABLE "SoftinsaLearning" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "department" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "skills" TEXT[],
    "level" "CourseLevel",
    "durationHours" DOUBLE PRECISION,
    "hasCertificate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SoftinsaLearning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SoftinsaLearning_mandatory_idx" ON "SoftinsaLearning"("mandatory");

-- CreateIndex
CREATE INDEX "SoftinsaLearning_department_idx" ON "SoftinsaLearning"("department");
