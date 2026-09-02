-- AlterTable
ALTER TABLE "Experiment" ADD COLUMN "parentExperimentId" TEXT;

-- CreateIndex
CREATE INDEX "Experiment_parentExperimentId_idx" ON "Experiment"("parentExperimentId");

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_parentExperimentId_fkey" FOREIGN KEY ("parentExperimentId") REFERENCES "Experiment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill parentExperimentId only where provenance JSON already establishes a parent
-- and that parent experiment still exists. Do not invent relationships.
UPDATE "Experiment" AS child
SET "parentExperimentId" = child.provenance->>'parentExperimentId'
WHERE child.provenance->>'parentExperimentId' IS NOT NULL
  AND child.provenance->>'parentExperimentId' <> ''
  AND EXISTS (
    SELECT 1
    FROM "Experiment" AS parent
    WHERE parent.id = child.provenance->>'parentExperimentId'
  );
