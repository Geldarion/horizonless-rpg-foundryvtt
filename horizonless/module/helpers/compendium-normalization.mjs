const EMPTY_DAMAGE_BUFFER_TYPE = '';

function getDamageTypeLabels() {
  return globalThis.CONFIG?.HORIZONLESS_RPG?.damageTypes ?? {};
}

export function normalizeAncestryName(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function normalizeCurioChatDescription(rawDescription = '') {
  const source = String(rawDescription ?? '').replace(/\r\n/g, '\n');
  // Prevent markdown from treating tab-indented lines as code blocks in chat.
  return source.replace(/\n\t+/g, '\n');
}

export function normalizeSpellDamageFormula(rawDamage = '') {
  const source = String(rawDamage ?? '').trim();
  if (!source) return null;

  const normalized = source
    .replace(/[вЂ“вЂ”]/g, '-')
    .replace(/[Г—xX]/g, '*')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/^[\dd+\-*/().\s]+$/i.test(normalized)) return null;

  try {
    const roll = new Roll(normalized);
    return roll.formula;
  } catch (_error) {
    return null;
  }
}

export function normalizeDamageType(value = '') {
  const normalizedType = String(value ?? '').trim();
  if (!normalizedType) return EMPTY_DAMAGE_BUFFER_TYPE;
  return Object.prototype.hasOwnProperty.call(getDamageTypeLabels(), normalizedType)
    ? normalizedType
    : EMPTY_DAMAGE_BUFFER_TYPE;
}

export function createEmptyDamageBuffer() {
  return {
    type: EMPTY_DAMAGE_BUFFER_TYPE,
    value: 0,
    max: 0,
  };
}

export function normalizeDamageBufferEntry(entry = {}) {
  const max = Math.max(0, Math.floor(Number(entry?.max ?? 0)));
  const value = Math.min(
    max,
    Math.max(0, Math.floor(Number(entry?.value ?? 0)))
  );

  return {
    type: normalizeDamageType(entry?.type),
    value,
    max,
  };
}

export function normalizeDamageBufferList(
  rawBuffers,
  { ensureAtLeastOne = false } = {}
) {
  const source = Array.isArray(rawBuffers) ? rawBuffers : [];
  const normalized = source.map((entry) => normalizeDamageBufferEntry(entry));

  if (!ensureAtLeastOne || normalized.length > 0) return normalized;
  return [createEmptyDamageBuffer()];
}
