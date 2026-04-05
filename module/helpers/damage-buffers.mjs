import {
  createEmptyDamageBuffer as createCompendiumEmptyDamageBuffer,
  normalizeDamageBufferEntry as normalizeCompendiumDamageBufferEntry,
  normalizeDamageBufferList as normalizeCompendiumDamageBufferList,
  normalizeDamageType as normalizeCompendiumDamageType,
} from './compendium-normalization.mjs';

function getDamageTypeLabels() {
  return globalThis.CONFIG?.HORIZONLESS_RPG?.damageTypes ?? {};
}

function getDamageTypeMetadata(type = '') {
  const metadata = getDamageTypeLabels()?.[type];
  if (metadata && typeof metadata === 'object') return metadata;
  return { label: String(metadata ?? type), injuring: false };
}

export function getDamageTypeLabel(type = '') {
  return String(getDamageTypeMetadata(type)?.label ?? type);
}

export function isInjuringDamage({ damageType = '', injuring = false } = {}) {
  if (injuring) return true;
  return Boolean(getDamageTypeMetadata(damageType)?.injuring);
}

function getDamageTypeGroupMap() {
  return globalThis.CONFIG?.HORIZONLESS_RPG?.damageTypeGroups ?? {};
}

export function getDamageTypeSelectGroups() {
  const damageTypes = getDamageTypeLabels();

  return Object.values(getDamageTypeGroupMap()).map((group) => ({
    label: String(group?.label ?? ''),
    options: (Array.isArray(group?.types) ? group.types : [])
      .filter((type) => Object.prototype.hasOwnProperty.call(damageTypes, type))
      .map((type) => ({
        value: type,
        label: getDamageTypeLabel(type),
      })),
  }));
}

export function normalizeDamageType(value = '') {
  return normalizeCompendiumDamageType(value);
}

export function createEmptyDamageBuffer() {
  return createCompendiumEmptyDamageBuffer();
}

export function normalizeDamageBufferEntry(entry = {}) {
  return normalizeCompendiumDamageBufferEntry(entry);
}

export function normalizeDamageBufferList(
  rawBuffers,
  { ensureAtLeastOne = false } = {}
) {
  const normalized = normalizeCompendiumDamageBufferList(rawBuffers, { ensureAtLeastOne });
  if (!ensureAtLeastOne || normalized.length > 0) return normalized;
  return [createEmptyDamageBuffer()];
}

export function damageBuffersDiffer(buffersA = [], buffersB = []) {
  if (buffersA.length !== buffersB.length) return true;

  for (let i = 0; i < buffersA.length; i += 1) {
    const a = buffersA[i] ?? {};
    const b = buffersB[i] ?? {};
    if (
      String(a.type ?? '') !== String(b.type ?? '') ||
      Number(a.value ?? 0) !== Number(b.value ?? 0) ||
      Number(a.max ?? 0) !== Number(b.max ?? 0)
    ) {
      return true;
    }
  }

  return false;
}

export function applyDamageToBuffers(
  damageBuffers,
  totalDamage,
  incomingDamageType = ''
) {
  let remainingDamage = Math.max(0, Math.floor(Number(totalDamage ?? 0)));
  const resolvedDamageType = normalizeDamageType(incomingDamageType);
  const nextDamageBuffers = normalizeDamageBufferList(damageBuffers).map((entry) => {
    if (remainingDamage <= 0) return { ...entry };
    if (!resolvedDamageType || entry.type !== resolvedDamageType) {
      return { ...entry };
    }

    const absorbedDamage = Math.min(entry.value, remainingDamage);
    remainingDamage -= absorbedDamage;

    return {
      ...entry,
      value: entry.value - absorbedDamage,
    };
  });

  return { nextDamageBuffers, remainingDamage };
}
