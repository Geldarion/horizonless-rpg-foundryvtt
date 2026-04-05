import {
  applyDamageToBuffers,
  isInjuringDamage,
  normalizeDamageBufferList,
  normalizeDamageType,
} from '../helpers/damage-buffers.mjs';

function clampResourceValue(value) {
  return Math.max(0, Number(value ?? 0));
}

function isActorDocument(actor) {
  return Boolean(
    actor
    && actor.documentName === 'Actor'
    && typeof actor.update === 'function'
  );
}

export async function resolveDamageTarget(tokenReference) {
  if (!tokenReference) return { tokenDocument: null, actor: null };

  const resolvedReference =
    typeof tokenReference === 'string'
      ? await fromUuid(tokenReference)
      : tokenReference;
  const tokenDocument = resolvedReference?.document ?? resolvedReference ?? null;
  const actor = tokenDocument?.actor ?? resolvedReference?.actor ?? null;

  return {
    tokenDocument,
    actor: isActorDocument(actor) ? actor : null,
  };
}

export async function calculateDamageOutcomeForToken(
  tokenReference,
  { totalDamage = 0, damageType = '', injuring = false } = {}
) {
  const { tokenDocument, actor } = await resolveDamageTarget(tokenReference);
  const normalizedDamageType = normalizeDamageType(damageType);
  const resolvedTotalDamage = Math.max(
    0,
    Math.floor(Number(totalDamage ?? 0))
  );

  if (!isActorDocument(actor)) {
    return {
      tokenDocument,
      actor: null,
      damageType: normalizedDamageType,
      totalDamage: resolvedTotalDamage,
      valid: false,
    };
  }

  const currentStamina = clampResourceValue(actor.system?.stamina?.value);
  const currentHitpoints = clampResourceValue(actor.system?.hitpoints?.value);
  const currentDamageBuffers = normalizeDamageBufferList(
    actor.system?.damageBuffers
  );
  const { nextDamageBuffers, remainingDamage } = applyDamageToBuffers(
    currentDamageBuffers,
    resolvedTotalDamage,
    normalizedDamageType
  );

  const damageIsInjuring = isInjuringDamage({
    damageType: normalizedDamageType,
    injuring,
  });
  const staminaDamage = damageIsInjuring
    ? 0
    : Math.min(currentStamina, remainingDamage);
  const hitpointDamage = damageIsInjuring
    ? remainingDamage
    : remainingDamage - staminaDamage;
  const nextStamina = currentStamina - staminaDamage;
  const nextHitpoints = Math.max(0, currentHitpoints - hitpointDamage);

  return {
    tokenDocument,
    actor,
    damageType: normalizedDamageType,
    totalDamage: resolvedTotalDamage,
    valid: true,
    damageIsInjuring,
    currentStamina,
    currentHitpoints,
    currentDamageBuffers,
    nextDamageBuffers,
    remainingDamage,
    staminaDamage,
    hitpointDamage,
    staminaTaken: staminaDamage > 0,
    nextStamina,
    nextHitpoints,
  };
}

export async function applyCalculatedDamageOutcome(outcome) {
  if (!isActorDocument(outcome?.actor)) return outcome;

  await outcome.actor.update({
    'system.damageBuffers': outcome.nextDamageBuffers,
    'system.stamina.value': outcome.nextStamina,
    'system.hitpoints.value': outcome.nextHitpoints,
  });

  return outcome;
}
