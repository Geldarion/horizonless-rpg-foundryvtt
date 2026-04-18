import { getActiveEffectStatuses } from '../helpers/effects.mjs';
import {
  applyCalculatedDamageOutcome,
  calculateDamageOutcomeForToken,
} from './horizonless-damage.mjs';

const renderTemplate = foundry.applications.handlebars.renderTemplate;
const HORIZONLESS_CONDITION_PREFIX = 'horizonless.';

function encodePersistenceKey(rawKey) {
  const normalized = String(rawKey ?? '').trim();
  if (!normalized) return '';
  return normalized
    .split('')
    .map((char) => char.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');
}

export function getCurrentChatMessage(message) {
  return game.messages?.get?.(message?.id) ?? message;
}

export function parseStringArray(rawValue) {
  if (!rawValue) return [];
  if (Array.isArray(rawValue)) {
    return Array.from(
      new Set(
        rawValue
          .map((value) => String(value ?? '').trim())
          .filter((value) => value.length > 0)
      )
    );
  }

  const normalizedRawValue = String(rawValue ?? '').trim();
  if (!normalizedRawValue) return [];

  try {
    const parsed = JSON.parse(normalizedRawValue);
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .map((value) => String(value ?? '').trim())
          .filter((value) => value.length > 0)
      )
    );
  } catch (_error) {
    return normalizedRawValue.length > 0 ? [normalizedRawValue] : [];
  }
}

function isActorDocument(actor) {
  return Boolean(
    actor
    && actor.documentName === 'Actor'
    && typeof actor.update === 'function'
  );
}

function getPersistenceKey(button, persistence = {}) {
  const keyDataset = String(persistence?.keyDataset ?? '').trim();
  if (!keyDataset) return '';
  return encodePersistenceKey(button?.dataset?.[keyDataset] ?? '');
}

function getStoredApplication(message, button, persistence = {}) {
  const currentMessage = getCurrentChatMessage(message);
  const flag = String(persistence?.flag ?? '').trim();
  if (!currentMessage || !flag) return null;

  if (persistence?.mode === 'perTarget') {
    const key = getPersistenceKey(button, persistence);
    if (!key) return null;

    const storedApplications = currentMessage.getFlag('horizonless', flag);
    if (!storedApplications || typeof storedApplications !== 'object' || Array.isArray(storedApplications)) {
      return null;
    }

    const storedEntry = storedApplications[key];
    if (!storedEntry || typeof storedEntry !== 'object') return null;
    return foundry.utils.deepClone(storedEntry);
  }

  const storedEntry = currentMessage.getFlag('horizonless', flag);
  if (!storedEntry || typeof storedEntry !== 'object') return null;
  return foundry.utils.deepClone(storedEntry);
}

async function storeApplication(message, button, entry, persistence = {}) {
  const currentMessage = getCurrentChatMessage(message);
  const flag = String(persistence?.flag ?? '').trim();
  if (!currentMessage || !flag) return;

  const nextEntry =
    entry && typeof entry === 'object'
      ? foundry.utils.deepClone(entry)
      : {
    applied: false,
    damageType: '',
    injuring: false,
    halfDamage: false,
    undoState: null,
  };

  if (persistence?.mode === 'perTarget') {
    const key = getPersistenceKey(button, persistence);
    if (!key) return;

    const storedApplications = currentMessage.getFlag('horizonless', flag);
    const nextApplications =
      storedApplications && typeof storedApplications === 'object' && !Array.isArray(storedApplications)
        ? foundry.utils.deepClone(storedApplications)
        : {};

    nextApplications[key] = nextEntry;
    await currentMessage.setFlag('horizonless', flag, nextApplications);
    return;
  }

  await currentMessage.setFlag('horizonless', flag, nextEntry);
}

function getHorizonlessEffectState(actor) {
  return actor.effects
    .filter((effect) => {
      const statuses = getActiveEffectStatuses(effect);
      return Array.from(statuses).some((id) =>
        id.startsWith(HORIZONLESS_CONDITION_PREFIX)
      );
    })
    .map((effect) => foundry.utils.deepClone(effect.toObject()));
}

async function restoreHorizonlessEffectState(actor, snapshot) {
  const currentEffects = actor.effects.filter((effect) => {
    const statuses = getActiveEffectStatuses(effect);
    return Array.from(statuses).some((id) =>
      id.startsWith(HORIZONLESS_CONDITION_PREFIX)
    );
  });
  const snapshotEffects = Array.isArray(snapshot) ? snapshot : [];
  const snapshotIds = new Set(
    snapshotEffects
      .map((effect) => String(effect?._id ?? '').trim())
      .filter((id) => id.length > 0)
  );

  const effectsToDelete = currentEffects
    .map((effect) => effect.id)
    .filter((id) => !snapshotIds.has(String(id ?? '').trim()));
  if (effectsToDelete.length > 0) {
    await actor.deleteEmbeddedDocuments('ActiveEffect', effectsToDelete);
  }

  for (const effectData of snapshotEffects) {
    const effectId = String(effectData?._id ?? '').trim();
    if (!effectId) continue;

    const existingEffect = actor.effects.get(effectId);
    if (existingEffect) {
      const updateData = foundry.utils.deepClone(effectData);
      delete updateData._id;
      await existingEffect.update(updateData);
    } else {
      await actor.createEmbeddedDocuments('ActiveEffect', [
        foundry.utils.deepClone(effectData),
      ]);
    }
  }
}

function createUndoEntry(actor) {
  return {
    actorUuid: actor.uuid,
    damageBuffers: foundry.utils.deepClone(actor.system?.damageBuffers ?? []),
    stamina: Math.max(0, Number(actor.system?.stamina?.value ?? 0)),
    hitpoints: Math.max(0, Number(actor.system?.hitpoints?.value ?? 0)),
    resolve: Math.max(0, Number(actor.system?.resolve?.value ?? 0)),
    horizonlessEffects: getHorizonlessEffectState(actor),
  };
}

function getUndoEntries(undoState) {
  if (Array.isArray(undoState)) return undoState;
  return undoState ? [undoState] : [];
}

export function createDamageButtonController({
  appliedTemplatePath,
  persistence,
  getDamageTypeSelect,
  getInjuringCheckbox,
  getHalfDamageCheckbox,
  getUndoActivator,
  getTargetTokenUuids,
  getTotalDamage,
  onSkippedTargets,
} = {}) {
  const setReadyState = (button) => {
    const damageTypeSelect = getDamageTypeSelect?.(button);
    if (damageTypeSelect) damageTypeSelect.disabled = false;
    const injuringCheckbox = getInjuringCheckbox?.(button);
    if (injuringCheckbox) injuringCheckbox.disabled = false;
    const halfDamageCheckbox = getHalfDamageCheckbox?.(button);
    if (halfDamageCheckbox) halfDamageCheckbox.disabled = false;

    button.dataset.applied = 'false';
    button.classList.remove('horizonless-damage-applied-state');
    button.disabled = false;
    button.textContent = 'Apply Damage';
  };

  const setAppliedState = async (button) => {
    const damageTypeSelect = getDamageTypeSelect?.(button);
    if (damageTypeSelect) damageTypeSelect.disabled = true;
    const injuringCheckbox = getInjuringCheckbox?.(button);
    if (injuringCheckbox) injuringCheckbox.disabled = true;
    const halfDamageCheckbox = getHalfDamageCheckbox?.(button);
    if (halfDamageCheckbox) halfDamageCheckbox.disabled = true;

    const appliedContent = await renderTemplate(appliedTemplatePath, {});
    button.dataset.applied = 'true';
    button.classList.add('horizonless-damage-applied-state');
    button.disabled = false;
    button.innerHTML = appliedContent;
  };

  const syncButtonState = async (button, message) => {
    const application = getStoredApplication(message, button, persistence);
    const damageTypeSelect = getDamageTypeSelect?.(button);
    const injuringCheckbox = getInjuringCheckbox?.(button);
    const halfDamageCheckbox = getHalfDamageCheckbox?.(button);
    if (damageTypeSelect && application?.damageType) {
      damageTypeSelect.value = application.damageType;
    }
    if (injuringCheckbox && application) {
      injuringCheckbox.checked = Boolean(application?.injuring);
    }
    if (halfDamageCheckbox && application) {
      halfDamageCheckbox.checked = Boolean(application?.halfDamage);
    }

    if (application?.applied) {
      await setAppliedState(button);
      return;
    }

    setReadyState(button);
  };

  const undoAppliedDamage = async (button, message, application) => {
    const entries = getUndoEntries(application?.undoState);
    if (!application?.applied || entries.length === 0) {
      setReadyState(button);
      return;
    }

    let restoredActors = 0;
    for (const entry of entries) {
      const actorUuid = String(entry?.actorUuid ?? '').trim();
      if (!actorUuid) continue;

      const actor = await fromUuid(actorUuid);
      if (!isActorDocument(actor)) continue;
      if (!(actor.isOwner || game.user?.isGM)) continue;

      const restoreData = {
        'system.stamina.value': Math.max(0, Number(entry?.stamina ?? 0)),
        'system.hitpoints.value': Math.max(0, Number(entry?.hitpoints ?? 0)),
        'system.resolve.value': Math.max(0, Number(entry?.resolve ?? 0)),
      };
      if (Array.isArray(entry?.damageBuffers)) {
        restoreData['system.damageBuffers'] = foundry.utils.deepClone(entry.damageBuffers);
      }

      await actor.update(restoreData);
      await restoreHorizonlessEffectState(actor, entry?.horizonlessEffects);
      restoredActors += 1;
    }

    if (restoredActors <= 0) return;

    await storeApplication(message, button, {
      applied: false,
      damageType: application?.damageType ?? '',
      injuring: Boolean(application?.injuring),
      halfDamage: Boolean(application?.halfDamage),
      undoState: null,
    }, persistence);
    setReadyState(button);
  };

  const applyDamage = async (button, message) => {
    const damageType = String(getDamageTypeSelect?.(button)?.value ?? '').trim();
    const injuring = Boolean(getInjuringCheckbox?.(button)?.checked);
    const halfDamage = Boolean(getHalfDamageCheckbox?.(button)?.checked);
    if (!damageType) {
      ui.notifications?.warn('Select a damage type before applying damage.');
      return;
    }

    const baseDamage = Math.max(
      0,
      Math.floor(Number(getTotalDamage?.(button, message) ?? 0))
    );
    const totalDamage = halfDamage ? Math.floor(baseDamage / 2) : baseDamage;
    if (totalDamage <= 0) {
      ui.notifications?.warn('No valid damage amount found to apply.');
      return;
    }

    const targetTokenUuids = parseStringArray(
      await getTargetTokenUuids?.(button, message)
    );
    if (!targetTokenUuids.length) {
      ui.notifications?.warn('Unable to apply damage to any targeted actors.');
      return;
    }

    const undoState = [];
    const skippedActors = [];

    for (const tokenUuid of targetTokenUuids) {
      const damageOutcome = await calculateDamageOutcomeForToken(tokenUuid, {
        totalDamage,
        damageType,
        injuring,
      });
      const targetActor = damageOutcome.actor ?? null;
      if (!isActorDocument(targetActor)) {
        skippedActors.push(tokenUuid);
        continue;
      }
      if (!(targetActor.isOwner || game.user?.isGM)) {
        skippedActors.push(targetActor.name ?? tokenUuid);
        continue;
      }

      undoState.push(createUndoEntry(targetActor));
      await applyCalculatedDamageOutcome(damageOutcome);
    }

    if (undoState.length <= 0) {
      ui.notifications?.warn('Unable to apply damage to any targeted actors.');
      return;
    }

    await storeApplication(message, button, {
      applied: true,
      damageType,
      injuring,
      halfDamage,
      undoState,
    }, persistence);
    await setAppliedState(button);

    if (skippedActors.length > 0) {
      if (typeof onSkippedTargets === 'function') {
        onSkippedTargets(skippedActors, message, button);
      } else {
        ui.notifications?.warn(`Skipped targets: ${skippedActors.join(', ')}`);
      }
    }
  };

  const handleButtonClick = async (event, message) => {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    if (!(button instanceof Element)) return;

    const application = getStoredApplication(message, button, persistence);
    const undoActivator = getUndoActivator?.(event) ?? null;
    const shouldUndo =
      Boolean(undoActivator) ||
      (Boolean(application?.applied) && button.dataset?.applied === 'true');

    if (shouldUndo) {
      await undoAppliedDamage(button, message, application);
      return;
    }

    if (application?.applied) return;
    await applyDamage(button, message);
  };

  return {
    syncButtonState,
    handleButtonClick,
    setReadyState,
    setAppliedState,
  };
}
