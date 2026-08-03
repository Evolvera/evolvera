import {
  PLASTIC_OBSERVATIONS_DROPPED,
  SCHEMA_VERSION,
  type LegacyObservation,
  type PlasticEntry,
  type Reflection,
  type SessionBinding,
} from "./types.ts";
import { makePlasticEntry } from "./ledger.ts";

export type RetentionInput = {
  binding: SessionBinding;
  observations: LegacyObservation[];
  reflections: Reflection[];
  /** The caller's explicit absorption decision; reflection support alone is insufficient. */
  absorbedObservationIds: string[];
  /** Branch-local source boundary, never inferred from reflector prose. */
  coversThroughId: string;
};
export type RetentionPlan = {
  observationIds: string[];
  reflectionIds: string[];
  record?: PlasticEntry<"plastic.observations.dropped">;
};

/** Tombstone only active, non-critical observations explicitly absorbed and supported by reflections. */
export function planRetention(input: RetentionInput): RetentionPlan {
  const absorbed = new Set(input.absorbedObservationIds);
  const supportingReflectionIds = new Set<string>();
  for (const reflection of input.reflections) {
    for (const observationId of reflection.supportingObservationIds) {
      if (absorbed.has(observationId)) supportingReflectionIds.add(reflection.id);
    }
  }
  const supportedObservationIds = new Set(input.reflections.flatMap((reflection) =>
    reflection.supportingObservationIds.filter((id) => absorbed.has(id))));
  const observationIds = input.observations
    .filter((observation) => observation.relevance !== "critical")
    .filter((observation) => absorbed.has(observation.id) && supportedObservationIds.has(observation.id))
    .map((observation) => observation.id);
  const reflectionIds = input.reflections
    .filter((reflection) => supportingReflectionIds.has(reflection.id))
    .map((reflection) => reflection.id)
    .sort();
  if (observationIds.length === 0) return { observationIds: [], reflectionIds: [] };
  const record = makePlasticEntry(PLASTIC_OBSERVATIONS_DROPPED, {
    schemaVersion: SCHEMA_VERSION,
    ...input.binding,
    observationIds,
    coversThroughId: input.coversThroughId,
    reflectionIds,
  });
  return { observationIds, reflectionIds, record };
}

export const makeRetentionPlan = planRetention;
