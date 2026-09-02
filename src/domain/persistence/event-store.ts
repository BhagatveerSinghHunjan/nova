import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

import type {
  ExperimentEventMetadata,
  ExperimentEventType,
} from "./events";

export async function recordExperimentEvent(input: {
  experimentId: string;
  type: ExperimentEventType;
  metadata?: ExperimentEventMetadata;
}) {
  return db.experimentEvent.create({
    data: {
      experimentId: input.experimentId,
      type: input.type,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function listExperimentEvents(experimentId: string) {
  return db.experimentEvent.findMany({
    where: { experimentId },
    orderBy: { createdAt: "asc" },
  });
}

export async function listRecentEvents(input?: {
  experimentId?: string;
  limit?: number;
}) {
  return db.experimentEvent.findMany({
    where: input?.experimentId
      ? { experimentId: input.experimentId }
      : undefined,
    orderBy: [{ createdAt: "asc" }],
    take: input?.limit,
    include: {
      experiment: {
        select: {
          id: true,
          question: true,
        },
      },
    },
  });
}
