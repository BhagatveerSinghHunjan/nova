export function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function hashInts(...values: number[]): number {
  let hash = 2166136261;

  for (const value of values) {
    hash ^= value | 0;
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededGaussian(random: () => number): number {
  const u1 = Math.max(random(), Number.EPSILON);
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function deriveObservationSeed(
  masterSeed: number,
  simulationVersion: string,
  simulationWorldKey: string,
  combinationIndex: number,
  replicateIndex: number,
): number {
  return hashInts(
    masterSeed,
    hashString(simulationVersion),
    hashString(simulationWorldKey),
    combinationIndex,
    replicateIndex,
  );
}

export function deriveReplicateSeed(
  masterSeed: number,
  replicateIndex: number,
): number {
  return hashInts(masterSeed, replicateIndex, 0x7265706c);
}

export function generateReplicationSeed(
  parentSeed: number,
  simulationVersion: string,
): number {
  return hashInts(parentSeed, hashString(simulationVersion), 0x66616d69);
}
