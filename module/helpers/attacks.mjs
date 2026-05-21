const CRITICAL_HIT_THRESHOLD_MIN = 15;
const CRITICAL_HIT_THRESHOLD_MAX = 20;
const CRITICAL_HIT_THRESHOLD_FALLBACK = 20;

export const ATTACK_OUTCOME = Object.freeze({
  NORMAL: 'normal',
  CRITICAL: 'critical',
  CRITICAL_MISS: 'critical-miss',
});

export function clampCriticalHitThreshold(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return CRITICAL_HIT_THRESHOLD_FALLBACK;

  return Math.min(
    CRITICAL_HIT_THRESHOLD_MAX,
    Math.max(CRITICAL_HIT_THRESHOLD_MIN, Math.trunc(numeric))
  );
}

function isActiveDiceResult(result) {
  if (!result) return false;
  if (result.active === false) return false;
  if (result.discarded || result.rerolled) return false;
  return Number.isFinite(Number(result.result));
}

export function getAttackD20Outcome(roll) {
  const d20Terms = Array.isArray(roll?.dice)
    ? roll.dice.filter((term) => Number(term?.faces) === 20)
    : [];

  for (const term of d20Terms) {
    const activeResult = Array.isArray(term?.results)
      ? term.results.find(isActiveDiceResult)
      : null;
    if (!activeResult) continue;

    const result = Number(activeResult.result);
    if (Number.isFinite(result)) return result;
  }

  return null;
}

export function getActorCriticalHitThreshold(actor) {
  return clampCriticalHitThreshold(actor?.system?.criticalHitThreshold);
}

export function getAttackOutcome(roll, actorOrThreshold = null) {
  const threshold = typeof Actor !== 'undefined' && actorOrThreshold instanceof Actor
    ? getActorCriticalHitThreshold(actorOrThreshold)
    : clampCriticalHitThreshold(actorOrThreshold);
  const d20Outcome = getAttackD20Outcome(roll);

  if (d20Outcome === 1) {
    return {
      type: ATTACK_OUTCOME.CRITICAL_MISS,
      d20Outcome,
      threshold,
      isCritical: false,
      isCriticalMiss: true,
    };
  }

  if (Number.isFinite(d20Outcome) && d20Outcome >= threshold) {
    return {
      type: ATTACK_OUTCOME.CRITICAL,
      d20Outcome,
      threshold,
      isCritical: true,
      isCriticalMiss: false,
    };
  }

  return {
    type: ATTACK_OUTCOME.NORMAL,
    d20Outcome,
    threshold,
    isCritical: false,
    isCriticalMiss: false,
  };
}

export function resolveAttackResult({ attackTotal, hasAc, ac, outcome }) {
  if (outcome?.type === ATTACK_OUTCOME.CRITICAL) {
    return {
      isHit: true,
      resultText: 'Critical Hit',
      resultType: ATTACK_OUTCOME.CRITICAL,
    };
  }

  if (outcome?.type === ATTACK_OUTCOME.CRITICAL_MISS) {
    return {
      isHit: false,
      resultText: 'Critical Miss',
      resultType: ATTACK_OUTCOME.CRITICAL_MISS,
    };
  }

  const isHit = Boolean(hasAc) && Number.isFinite(attackTotal) && attackTotal >= ac;
  return {
    isHit,
    resultText: isHit ? 'Hit' : 'Miss',
    resultType: isHit ? 'hit' : 'miss',
  };
}

export function getAttackOutcomeChatData(outcome) {
  if (!Number.isFinite(Number(outcome?.d20Outcome))) {
    return {
      hasAttackOutcome: false,
      attackOutcomeType: ATTACK_OUTCOME.NORMAL,
      attackOutcomeLabel: '',
      attackOutcomeDetail: '',
    };
  }

  const attackOutcomeType = Object.values(ATTACK_OUTCOME).includes(outcome.type)
    ? outcome.type
    : ATTACK_OUTCOME.NORMAL;
  const attackOutcomeLabel = attackOutcomeType === ATTACK_OUTCOME.CRITICAL
    ? 'Critical Hit'
    : attackOutcomeType === ATTACK_OUTCOME.CRITICAL_MISS
      ? 'Critical Miss'
      : 'Attack Roll';

  return {
    hasAttackOutcome: true,
    attackOutcomeType,
    attackOutcomeLabel,
    attackOutcomeDetail: `d20 ${Number(outcome.d20Outcome)} | Crit ${Number(outcome.threshold)}+`,
  };
}

export function getCriticalDamageFormula(formula, rollData = {}) {
  const baseFormula = String(formula ?? '').trim();
  if (!baseFormula) return baseFormula;

  try {
    const roll = new Roll(baseFormula, rollData);
    const criticalRoll = roll.alter(2, 0, false);
    return String(criticalRoll?.formula ?? '').trim() || baseFormula;
  } catch (_error) {
    return baseFormula;
  }
}

export function getDamageButtonDataForAttackOutcome(data = {}, outcome = null, rollData = {}) {
  if (outcome?.type !== ATTACK_OUTCOME.CRITICAL) return data;

  const buttonLabel = String(data.buttonLabel ?? '').trim();
  const criticalButtonLabel = buttonLabel.startsWith('Roll ')
    ? buttonLabel.replace(/^Roll\s+/, 'Roll Critical ')
    : 'Roll Critical Damage';

  return {
    ...data,
    damageFormula: getCriticalDamageFormula(data.damageFormula, rollData),
    buttonLabel: criticalButtonLabel,
  };
}
