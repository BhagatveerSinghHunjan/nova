-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'RUNNING', 'COMPLETED', 'ANALYZED', 'REPLICATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PlantGrowthFactor" AS ENUM ('TEMPERATURE', 'WATER', 'LIGHT', 'CO2', 'NUTRIENTS');

-- CreateTable
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "factors" "PlantGrowthFactor"[],
    "factorLevels" JSONB NOT NULL,
    "units" JSONB NOT NULL,
    "replicates" INTEGER NOT NULL,
    "seed" INTEGER NOT NULL,
    "simulationVersion" TEXT NOT NULL,
    "simulationWorldKey" TEXT NOT NULL,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'DRAFT',
    "provenance" JSONB NOT NULL,
    "approvalRationale" TEXT,
    "rejectionRationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "analyzedAt" TIMESTAMP(3),
    "replicatedAt" TIMESTAMP(3),

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationObservation" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "dataLabel" TEXT NOT NULL DEFAULT 'synthetic',
    "simulationVersion" TEXT NOT NULL,
    "replicateIndex" INTEGER NOT NULL,
    "combinationIndex" INTEGER NOT NULL,
    "factorValues" JSONB NOT NULL,
    "biomass" DOUBLE PRECISION NOT NULL,
    "growthRate" DOUBLE PRECISION NOT NULL,
    "observationSeed" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "analysisVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "effects" JSONB NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "residualDegreesOfFreedom" INTEGER NOT NULL,
    "residualStandardError" DOUBLE PRECISION NOT NULL,
    "responseVariable" TEXT NOT NULL,
    "simulationVersion" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "findingText" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "replicationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Replication" (
    "id" TEXT NOT NULL,
    "originalExperimentId" TEXT NOT NULL,
    "replicationExperimentId" TEXT NOT NULL,
    "originalSeed" INTEGER NOT NULL,
    "replicationSeed" INTEGER NOT NULL,
    "originalEffect" JSONB NOT NULL,
    "replicationEffect" JSONB NOT NULL,
    "originalConfidenceInterval" JSONB NOT NULL,
    "replicationConfidenceInterval" JSONB NOT NULL,
    "sameDirection" BOOLEAN NOT NULL,
    "confidenceIntervalOverlap" BOOLEAN NOT NULL,
    "relativeEffectDifference" DOUBLE PRECISION NOT NULL,
    "replicationSuccess" BOOLEAN NOT NULL,
    "analysisVersion" TEXT NOT NULL,
    "simulationVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Replication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Experiment_status_idx" ON "Experiment"("status");

-- CreateIndex
CREATE INDEX "SimulationObservation_experimentId_idx" ON "SimulationObservation"("experimentId");

-- CreateIndex
CREATE UNIQUE INDEX "SimulationObservation_experimentId_replicateIndex_combinati_key" ON "SimulationObservation"("experimentId", "replicateIndex", "combinationIndex");

-- CreateIndex
CREATE INDEX "Analysis_experimentId_idx" ON "Analysis"("experimentId");

-- CreateIndex
CREATE INDEX "Finding_experimentId_idx" ON "Finding"("experimentId");

-- CreateIndex
CREATE INDEX "Finding_analysisId_idx" ON "Finding"("analysisId");

-- CreateIndex
CREATE INDEX "Finding_replicationId_idx" ON "Finding"("replicationId");

-- CreateIndex
CREATE INDEX "Replication_originalExperimentId_idx" ON "Replication"("originalExperimentId");

-- CreateIndex
CREATE INDEX "Replication_replicationExperimentId_idx" ON "Replication"("replicationExperimentId");

-- CreateIndex
CREATE UNIQUE INDEX "Replication_originalExperimentId_replicationExperimentId_key" ON "Replication"("originalExperimentId", "replicationExperimentId");

-- AddForeignKey
ALTER TABLE "SimulationObservation" ADD CONSTRAINT "SimulationObservation_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_replicationId_fkey" FOREIGN KEY ("replicationId") REFERENCES "Replication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Replication" ADD CONSTRAINT "Replication_originalExperimentId_fkey" FOREIGN KEY ("originalExperimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Replication" ADD CONSTRAINT "Replication_replicationExperimentId_fkey" FOREIGN KEY ("replicationExperimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
