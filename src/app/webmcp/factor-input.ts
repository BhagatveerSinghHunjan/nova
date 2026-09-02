import { PlantGrowthFactor } from "@prisma/client";

import type { FactorLevels, FactorUnits } from "@/domain/experiment/types";

/**
 * Agent-facing factor names (LEVEL 8.5) mapped to Prisma / domain enums.
 * Accepts lowercase discovery names and uppercase domain values.
 */
const FACTOR_ALIASES: Record<string, PlantGrowthFactor> = {
  temperature: PlantGrowthFactor.TEMPERATURE,
  TEMPERATURE: PlantGrowthFactor.TEMPERATURE,
  water: PlantGrowthFactor.WATER,
  WATER: PlantGrowthFactor.WATER,
  light: PlantGrowthFactor.LIGHT,
  LIGHT: PlantGrowthFactor.LIGHT,
  co2: PlantGrowthFactor.CO2,
  CO2: PlantGrowthFactor.CO2,
  nutrients: PlantGrowthFactor.NUTRIENTS,
  NUTRIENTS: PlantGrowthFactor.NUTRIENTS,
};

export const WEBMCP_FACTOR_INPUT_ENUM = [
  "temperature",
  "water",
  "light",
  "CO2",
  "nutrients",
  "TEMPERATURE",
  "WATER",
  "LIGHT",
  "NUTRIENTS",
] as const;

export function resolvePlantGrowthFactor(
  value: string,
): PlantGrowthFactor | null {
  return FACTOR_ALIASES[value] ?? null;
}

export function parseWebMcpFactors(value: unknown): PlantGrowthFactor[] {
  if (!Array.isArray(value)) {
    throw Object.assign(new Error("factors must be an array"), {
      code: "INVALID_INPUT",
    });
  }

  if (value.length === 0) {
    throw Object.assign(
      new Error("At least one plant-growth factor is required"),
      { code: "INVALID_INPUT" },
    );
  }

  const factors: PlantGrowthFactor[] = [];
  const seen = new Set<PlantGrowthFactor>();

  for (const item of value) {
    if (typeof item !== "string") {
      throw Object.assign(new Error(`Unsupported plant-growth factor: ${item}`), {
        code: "INVALID_FACTOR",
      });
    }

    const resolved = resolvePlantGrowthFactor(item);
    if (!resolved) {
      throw Object.assign(
        new Error(
          `Unsupported plant-growth factor: ${item}. Supported: temperature, water, light, CO2, nutrients.`,
        ),
        { code: "INVALID_FACTOR" },
      );
    }

    if (seen.has(resolved)) {
      continue;
    }

    seen.add(resolved);
    factors.push(resolved);
  }

  return factors;
}

function remapFactorKeyedObject<T>(
  value: unknown,
  label: string,
  mapValue: (entry: unknown, key: string) => T,
): Partial<Record<PlantGrowthFactor, T>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw Object.assign(new Error(`${label} must be an object`), {
      code: "INVALID_INPUT",
    });
  }

  const result: Partial<Record<PlantGrowthFactor, T>> = {};

  for (const [rawKey, rawValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const factor = resolvePlantGrowthFactor(rawKey);
    if (!factor) {
      throw Object.assign(
        new Error(
          `Unsupported factor key in ${label}: ${rawKey}. Supported: temperature, water, light, CO2, nutrients.`,
        ),
        { code: "INVALID_FACTOR" },
      );
    }

    result[factor] = mapValue(rawValue, rawKey);
  }

  return result;
}

export function parseWebMcpFactorLevels(value: unknown): FactorLevels {
  return remapFactorKeyedObject(value, "factor_levels", (entry, key) => {
    if (!Array.isArray(entry) || entry.length === 0) {
      throw Object.assign(
        new Error(`factor_levels.${key} must be a non-empty number array`),
        { code: "INVALID_FACTOR_LEVELS" },
      );
    }

    const levels: number[] = [];
    for (const level of entry) {
      if (typeof level !== "number" || Number.isNaN(level)) {
        throw Object.assign(
          new Error(`factor_levels.${key} must contain only numbers`),
          { code: "INVALID_FACTOR_LEVELS" },
        );
      }
      levels.push(level);
    }

    return levels;
  });
}

export function parseWebMcpUnits(value: unknown): FactorUnits {
  return remapFactorKeyedObject(value, "units", (entry, key) => {
    if (typeof entry !== "string" || !entry.trim()) {
      throw Object.assign(
        new Error(`units.${key} must be a non-empty string`),
        { code: "INVALID_UNITS" },
      );
    }

    return entry.trim();
  });
}
