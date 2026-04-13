import {
  damageBuffersDiffer,
} from '../helpers/damage-buffers.mjs';

function getSystemId() {
  return game.system?.id ?? 'horizonless';
}

const BASE_ROUND_ACTIVATIONS = 1;
const TURN_STATE_FLAG = 'turnState';

/**
 * Override Combat with activation-based "popcorn" turns.
 * Turn order remains visible, but a turn only starts when a combatant is activated.
 */
export class HorizonlessCombat extends Combat {
  _sortCombatants(a, b) {
    const dispositionDelta = b.disposition - a.disposition;
    if (dispositionDelta !== 0) return dispositionDelta;
    return super._sortCombatants(a, b);
  }

  _manageTurnEvents(adjustedTurn) {
    // Avoid Foundry issue where this can run before previous state exists.
    if (!this.previous) return;
    return super._manageTurnEvents(adjustedTurn);
  }

  /**
   * Reset all combatants to their max available activations.
   */
  async resetActivations() {
    const systemId = getSystemId();
    const skipDefeated = Boolean(this.settings?.skipDefeated);
    const updates = this.combatants.map((combatant) => {
      const isSkipped = skipDefeated && combatant.isDefeated;
      return {
        _id: combatant.id,
        [`flags.${systemId}.activations`]: {
          max: BASE_ROUND_ACTIVATIONS,
          value: isSkipped ? 0 : BASE_ROUND_ACTIVATIONS,
        },
      };
    });
    return this.updateEmbeddedDocuments('Combatant', updates);
  }

  async _refreshCombatantDamageBuffers() {
    const seenActorKeys = new Set();

    for (const combatant of this.combatants) {
      const actor = combatant?.actor;
      if (!(actor instanceof Actor)) continue;
      if (!(game.user?.isGM || actor.isOwner)) continue;

      const actorKey = String(actor.uuid ?? actor.id ?? '').trim();
      if (!actorKey || seenActorKeys.has(actorKey)) continue;
      seenActorKeys.add(actorKey);

      const sourceDamageBuffers = Array.isArray(actor.system?.damageBuffers)
        ? actor.system.damageBuffers
        : [];
      const refreshedDamageBuffers = sourceDamageBuffers.map((entry) => ({
        ...entry,
        value: entry.max,
      }));

      const shouldUpdate = damageBuffersDiffer(sourceDamageBuffers, refreshedDamageBuffers);
      if (!shouldUpdate) continue;

      await actor.update({ 'system.damageBuffers': refreshedDamageBuffers });
    }
  }

  get activeCombatantIds() {
    return this._getActiveCombatants().map((combatant) => combatant.id);
  }

  _getActiveCombatants() {
    return this.combatants
      .filter((combatant) => combatant?.isTakingTurn)
      .sort((a, b) => {
        const aOrder = Number(a.turnState?.order ?? 0);
        const bOrder = Number(b.turnState?.order ?? 0);
        return aOrder - bOrder;
      });
  }

  async _clearActiveTurnStates() {
    const updates = this.combatants
      .filter((combatant) => combatant?.isTakingTurn)
      .map((combatant) => ({
        _id: combatant.id,
        [`flags.${getSystemId()}.${TURN_STATE_FLAG}`]: {
          active: false,
          order: null,
        },
      }));

    if (!updates.length) return [];
    return this.updateEmbeddedDocuments('Combatant', updates);
  }

  async startCombat() {
    this._playCombatSound('startEncounter');
    const updateData = { round: 1, turn: null };
    Hooks.callAll('combatStart', this, updateData);
    await this._clearActiveTurnStates();
    await this.resetActivations();
    await this._refreshCombatantDamageBuffers();
    await this.update(updateData);
    return this;
  }

  async nextRound() {
    await this._clearActiveTurnStates();
    await this.resetActivations();
    await this._refreshCombatantDamageBuffers();
    const updateData = { round: (this.round ?? 0) + 1, turn: null };
    let advanceTime = Math.max(this.turns.length - (this.turn ?? 0), 0) * CONFIG.time.turnTime;
    advanceTime += CONFIG.time.roundTime;
    const updateOptions = { advanceTime, direction: 1 };
    Hooks.callAll('combatRound', this, updateData, updateOptions);
    await this.update(updateData, updateOptions);
    return this;
  }

  /**
   * End the active turn without selecting the next combatant.
   */
  async nextTurn() {
    const activeIds = this.activeCombatantIds;
    if (activeIds.length === 0) {
      const updateData = { turn: null };
      const updateOptions = { advanceTime: 0, direction: 0 };
      Hooks.callAll('combatTurn', this, updateData, updateOptions);
      await this.update(updateData, updateOptions);
      return this;
    }

    let remainingActiveIds = [];
    if (game.user?.isGM) {
      await this._clearActiveTurnStates();
      remainingActiveIds = [];
    } else {
      const ownedActiveCombatants = activeIds
        .map((id) => this.getEmbeddedDocument('Combatant', id, {}))
        .filter((combatant) => combatant?.testUserPermission(game.user, 'OWNER'));

      if (ownedActiveCombatants.length) {
        await this.updateEmbeddedDocuments(
          'Combatant',
          ownedActiveCombatants.map((combatant) => ({
            _id: combatant.id,
            [`flags.${getSystemId()}.${TURN_STATE_FLAG}`]: {
              active: false,
              order: null,
            },
          }))
        );
      }

      remainingActiveIds = activeIds.filter((id) => {
        const combatant = this.getEmbeddedDocument('Combatant', id, {});
        return !combatant?.testUserPermission(game.user, 'OWNER');
      });
    }

    const nextTurn = remainingActiveIds.length
      ? this.turns.findIndex((turn) => turn.id === remainingActiveIds[remainingActiveIds.length - 1])
      : null;

    const updateData = {
      turn: Number.isInteger(nextTurn) && nextTurn >= 0 ? nextTurn : null,
    };
    const updateOptions = { advanceTime: 0, direction: 0 };
    Hooks.callAll('combatTurn', this, updateData, updateOptions);
    await this._refreshCombatantDamageBuffers();
    await this.update(updateData, updateOptions);
    return this;
  }

  async previousRound() {
    await this._clearActiveTurnStates();
    await this.resetActivations();
    const round = Math.max((this.round ?? 0) - 1, 0);
    let advanceTime = 0;
    if (round > 0) advanceTime -= CONFIG.time.roundTime;
    const updateData = { round, turn: null };
    const updateOptions = { advanceTime, direction: -1 };
    Hooks.callAll('combatRound', this, updateData, updateOptions);
    await this.update(updateData, updateOptions);
    return this;
  }

  /**
   * End current turn and refund one activation.
   */
  async previousTurn() {
    const activeIds = this.activeCombatantIds;
    let targetId = activeIds[activeIds.length - 1];
    if (!targetId && this.turn !== null) targetId = this.turns[this.turn]?.id ?? null;
    if (!targetId) return this;

    const targetCombatant = this.getEmbeddedDocument('Combatant', targetId, {});
    const canModify = Boolean(
      game.user?.isGM || targetCombatant?.testUserPermission(game.user, 'OWNER')
    );
    if (!canModify) return this;

    await targetCombatant?.modifyCurrentActivations(1);
    await targetCombatant?.update({
      [`flags.${getSystemId()}.${TURN_STATE_FLAG}`]: {
        active: false,
        order: null,
      },
    });
    const remainingActiveIds = activeIds.filter((id) => id !== targetId);
    const nextTurn = remainingActiveIds.length
      ? this.turns.findIndex((turn) => turn.id === remainingActiveIds[remainingActiveIds.length - 1])
      : null;
    const updateData = {
      turn: Number.isInteger(nextTurn) && nextTurn >= 0 ? nextTurn : null,
    };
    const updateOptions = { advanceTime: -CONFIG.time.turnTime, direction: -1 };
    Hooks.callAll('combatTurn', this, updateData, updateOptions);
    await this.update(updateData, updateOptions);
    return this;
  }

  async resetAll() {
    await this._clearActiveTurnStates();
    await this.resetActivations();
    this.combatants.forEach((combatant) => {
      combatant.updateSource({ initiative: null });
    });
    const updateData = { turn: null, combatants: this.combatants.toObject() };
    await this.update(updateData, { diff: false });
    return this;
  }

  _playCombatSound(announcement) {
    if (announcement === 'nextUp') return;
    return super._playCombatSound(announcement);
  }

  /**
   * Activate a combatant. GM or owners can do this, and multiple combatants may be active simultaneously.
   */
  async activateCombatant(id, override = false) {
    const combatant = this.getEmbeddedDocument('Combatant', id, {});
    if (!combatant) return this;

    const canActivate = Boolean(game.user?.isGM || combatant.isOwner || override);
    if (!canActivate) return this.requestActivation(id);
    if (this.activeCombatantIds.includes(id)) return this;
    if (!combatant.activations.value) return this;

    await combatant.modifyCurrentActivations(-1);
    const activeCombatantIds = this.activeCombatantIds;
    const nextOrder = activeCombatantIds.length;
    await combatant.update({
      [`flags.${getSystemId()}.${TURN_STATE_FLAG}`]: {
        active: true,
        order: nextOrder,
      },
    });
    const turn = this.turns.findIndex((t) => t.id === id);
    if (turn < 0) return this;

    const updateData = { turn };
    const updateOptions = { advanceTime: CONFIG.time.turnTime, direction: 1 };
    Hooks.callAll('combatTurn', this, updateData, updateOptions);
    return this.update(updateData, updateOptions);
  }

  /**
   * End the current combatant's turn.
   */
  async deactivateCombatant(id) {
    const activeCombatantIds = this.activeCombatantIds;
    if (!activeCombatantIds.includes(id)) return this;

    const combatant = this.getEmbeddedDocument('Combatant', id, {});
    if (!combatant?.testUserPermission(game.user, 'OWNER') && !game.user?.isGM) return this;

    await combatant.update({
      [`flags.${getSystemId()}.${TURN_STATE_FLAG}`]: {
        active: false,
        order: null,
      },
    });

    const remainingActiveIds = activeCombatantIds.filter((activeId) => activeId !== id);
    const nextTurn = remainingActiveIds.length
      ? this.turns.findIndex((turn) => turn.id === remainingActiveIds[remainingActiveIds.length - 1])
      : null;
    const updateData = {
      turn: Number.isInteger(nextTurn) && nextTurn >= 0 ? nextTurn : null,
    };
    const updateOptions = { advanceTime: 0, direction: 0 };
    Hooks.callAll('combatTurn', this, updateData, updateOptions);
    await this._refreshCombatantDamageBuffers();
    await this.update(updateData, updateOptions);
    return this;
  }

  /**
   * Hook for requesting activation from GM-controlled workflows.
   */
  async requestActivation(id) {
    Hooks.callAll('HorizonlessCombatRequestActivate', this, id);
    return this;
  }
}

export class HorizonlessCombatant extends Combatant {
  testUserPermission(...[user, permission, options]) {
    return this.actor?.testUserPermission(user, permission, options) ?? user?.isGM ?? false;
  }

  prepareBaseData() {
    super.prepareBaseData();
    const systemId = getSystemId();

    if (this.flags?.[systemId]?.activations?.max === undefined && canvas?.ready) {
      const activations = this._getDefaultActivations();
      this.updateSource({
        [`flags.${systemId}.activations`]: {
          max: activations,
          value: (this.parent?.round ?? 0) > 0 ? activations : 0,
        },
      });
    }

    this.initiative ??= 0;
  }

  _getDefaultActivations() {
    return BASE_ROUND_ACTIVATIONS;
  }

  get activations() {
    return this.getFlag(getSystemId(), 'activations') ?? {};
  }

  get turnState() {
    return (
      this.getFlag(getSystemId(), TURN_STATE_FLAG) ?? {
        active: false,
        order: null,
      }
    );
  }

  get isTakingTurn() {
    return Boolean(this.turnState?.active);
  }

  get disposition() {
    const disposition =
      this.token?.disposition ??
      this.actor?.prototypeToken?.disposition ??
      CONST.TOKEN_DISPOSITIONS.HOSTILE;

    if (disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY && this.hasPlayerOwner) return 2;
    return disposition;
  }

  /**
   * Adjust max activations and current activations together.
   */
  async addActivations(num) {
    if (num === 0) return this;

    const max = Math.max(Number(this.activations.max ?? this._getDefaultActivations()) + num, 1);
    const value = Math.max(Number(this.activations.value ?? 0) + num, 0);
    return this.update({
      [`flags.${getSystemId()}.activations`]: { max, value },
    });
  }

  /**
   * Adjust only current activations (remaining for this round).
   */
  async modifyCurrentActivations(num) {
    if (num === 0) return this;

    const max = Math.max(Number(this.activations.max ?? this._getDefaultActivations()), 1);
    const value = Math.clamp(Number(this.activations.value ?? 0) + num, 0, max);
    return this.update({
      [`flags.${getSystemId()}.activations`]: { max, value },
    });
  }
}
