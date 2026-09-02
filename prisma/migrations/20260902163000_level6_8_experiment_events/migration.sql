-- CreateTable
CREATE TABLE "ExperimentEvent" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExperimentEvent_experimentId_idx" ON "ExperimentEvent"("experimentId");

-- CreateIndex
CREATE INDEX "ExperimentEvent_type_idx" ON "ExperimentEvent"("type");

-- CreateIndex
CREATE INDEX "ExperimentEvent_experimentId_type_idx" ON "ExperimentEvent"("experimentId", "type");

-- AddForeignKey
ALTER TABLE "ExperimentEvent" ADD CONSTRAINT "ExperimentEvent_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
