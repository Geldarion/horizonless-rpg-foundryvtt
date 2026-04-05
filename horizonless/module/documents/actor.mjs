/**
 * Extend the base Actor document by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
import { getActiveEffectStatuses } from '../helpers/effects.mjs';

const renderTemplate = foundry.applications.handlebars.renderTemplate;
const HORIZONLESS_CONDITION_PREFIX = "horizonless.";
const KEPT_CONDITIONS_ON_RESOLVE_BURN = Object.freeze(
  new Set(["horizonless.dead", "horizonless.invisible", "horizonless.prone"])
);
const PRONE_CONDITION_ID = "horizonless.prone";
const DEATH_CONDITION_ID = "horizonless.dead";
const ACTOR_MESSAGE_TEMPLATES = {
  resolveBurnMessage: 'systems/horizonless/module/messages/item/resolve-burn-message.hbs',
};

export class HorizonlessActor extends Actor {
  /** @override */
  async _preUpdate(changed, options, user) {
    const currentHitpoints = Number(this.system?.hitpoints?.value ?? 0);
    const changedHitpoints = foundry.utils.getProperty(changed, 'system.hitpoints.value');
    const nextHitpoints = changedHitpoints === undefined
      ? currentHitpoints
      : Math.max(0, Number(changedHitpoints));

    const crossesToZero = currentHitpoints > 0 && nextHitpoints <= 0;
    if (crossesToZero) {
      const currentResolve = Math.max(0, Number(this.system?.resolve?.value ?? 0));
      const changedResolve = foundry.utils.getProperty(changed, 'system.resolve.value');
      const nextResolveBase = changedResolve === undefined
        ? currentResolve
        : Math.max(0, Number(changedResolve));
      const burnedResolve = Math.max(0, nextResolveBase - 1);
      const resolveWasBurned = burnedResolve < nextResolveBase;

      foundry.utils.setProperty(changed, 'system.resolve.value', burnedResolve);

      if (resolveWasBurned) {
        if (this.type === "character") {
          await this._handleResolveBurnForCharacter(changed);
        } else if (this.type === "npc") {
          await this._handleResolveBurnForNpc(changed);
        }

        await this._createResolveBurnChatMessage();
      } else {
        await this._ensureDeathCondition();
      }
    }

    return super._preUpdate(changed, options, user);
  }

  async _handleResolveBurnForCharacter(changed) {
    foundry.utils.setProperty(changed, "system.hitpoints.value", 1);

    const staminaMax = Math.max(0, Number(this.system?.stamina?.max ?? 0));
    foundry.utils.setProperty(changed, "system.stamina.value", staminaMax);

    const effectsToDelete = [];
    let hasProne = false;

    for (const effect of this.effects) {
      const statuses = getActiveEffectStatuses(effect);
      if (statuses.has(PRONE_CONDITION_ID)) hasProne = true;

      const hasHorizonlessCondition = Array.from(statuses).some(
        (id) => id.startsWith(HORIZONLESS_CONDITION_PREFIX)
      );
      if (!hasHorizonlessCondition) continue;

      const keep = Array.from(statuses).some(
        (id) => KEPT_CONDITIONS_ON_RESOLVE_BURN.has(id)
      );
      if (!keep) effectsToDelete.push(effect.id);
    }

    if (effectsToDelete.length > 0) {
      await this.deleteEmbeddedDocuments("ActiveEffect", effectsToDelete);
    }

    if (!hasProne) {
      await this.createEmbeddedDocuments("ActiveEffect", [
        {
          name: "Prone",
          img: "icons/svg/falling.svg",
          origin: this.uuid,
          statuses: [PRONE_CONDITION_ID]
        }
      ]);
    }
  }

  async _handleResolveBurnForNpc(changed) {
    const hitpointsMax = Number(this.system?.hitpoints?.max ?? 0);
    foundry.utils.setProperty(changed, "system.hitpoints.value", hitpointsMax);
    foundry.utils.setProperty(changed, "system.stamina.value", Number(this.system?.stamina?.max ?? 0));

    const effectsToDelete = [];
    for (const effect of this.effects) {
      const statuses = getActiveEffectStatuses(effect);
      let hasHorizonlessCondition = false;
      let keep = false;

      for (const id of statuses) {
        if (!hasHorizonlessCondition && id.startsWith(HORIZONLESS_CONDITION_PREFIX)) {
          hasHorizonlessCondition = true;
        }
        if (!keep && KEPT_CONDITIONS_ON_RESOLVE_BURN.has(id)) {
          keep = true;
        }
        if (hasHorizonlessCondition && keep) break;
      }

      if (hasHorizonlessCondition && !keep) {
        effectsToDelete.push(effect.id);
      }
    }

    if (effectsToDelete.length > 0) {
      await this.deleteEmbeddedDocuments("ActiveEffect", effectsToDelete);
    }
  }

  async _ensureDeathCondition() {
    for (const effect of this.effects) {
      const statuses = getActiveEffectStatuses(effect);
      if (statuses.has(DEATH_CONDITION_ID)) return;
    }

    await this.createEmbeddedDocuments("ActiveEffect", [
      {
        name: "Death",
        img: "icons/svg/skull.svg",
        origin: this.uuid,
        statuses: [DEATH_CONDITION_ID]
      }
    ]);
  }

  async _createResolveBurnChatMessage() {
    const creatureName = String(this.name ?? "Unknown creature").trim() || "Unknown creature";
    const content = await renderTemplate(ACTOR_MESSAGE_TEMPLATES.resolveBurnMessage, {
      creatureName,
    });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content,
    });
  }

  /** @override */
  prepareData() {
    // Prepare data for the actor. Calling the super version of this executes
    // the following, in order: data reset (to clear active effects),
    // prepareBaseData(), prepareEmbeddedDocuments() (including active effects),
    // prepareDerivedData().
    super.prepareData();
  }

  /** @override */
  prepareBaseData() {
    // Data modifications in this step occur before processing embedded
    // documents or derived data.
  }

  /**
   * @override
   * Augment the actor source data with additional dynamic data that isn't 
   * handled by the actor's DataModel. Data calculated in this step should be
   * available both inside and outside of character sheets (such as if an actor
   * is queried and has a roll executed directly from it).
   */
  prepareDerivedData() {
    const actorData = this;
    const flags = actorData.flags.horizonless || {};
  }

  /**
   * 
   * @override
   * Augment the actor's default getRollData() method by appending the data object
   * generated by the its DataModel's getRollData(), or null. This polymorphic 
   * approach is useful when you have actors & items that share a parent Document, 
   * but have slightly different data preparation needs.
   */
  getRollData() {
    return { ...super.getRollData(), ...this.system.getRollData?.() ?? null };
  }

  /**
   * Convert the actor document to a plain object.
   * 
   * The built in `toObject()` method will ignore derived data when using Data Models.
   * This additional method will instead use the spread operator to return a simplified
   * version of the data.
   * 
   * @returns {object} Plain object either via deepClone or the spread operator.
   */
  toPlainObject() {
    const result = {...this};

    // Simplify system data.
    result.system = this.system.toPlainObject();

    // Add items.
    result.items = this.items?.size > 0 ? this.items.contents : [];

    // Add effects.
    result.effects = this.effects?.size > 0 ? this.effects.contents : [];

    return result;
  }

}
