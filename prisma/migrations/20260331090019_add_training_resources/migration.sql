-- CreateTable
CREATE TABLE "TrainingResource" (
    "id" TEXT NOT NULL,
    "trainingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "fileUrl" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingResource_trainingId_idx" ON "TrainingResource"("trainingId");

-- AddForeignKey
ALTER TABLE "TrainingResource" ADD CONSTRAINT "TrainingResource_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "TrainingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
