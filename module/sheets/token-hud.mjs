const HORIZONLESS_TOKEN_CONDITIONS = Object.freeze([
  { id: "horizonless.ablaze", name: "Ablaze", img: "icons/svg/fire.svg" },
  { id: "horizonless.charmed", name: "Charmed", img: "icons/svg/card-hand.svg" },
  { id: "horizonless.disoriented", name: "Disoriented", img: "icons/svg/daze.svg" },
  { id: "horizonless.frozen", name: "Frozen", img: "icons/svg/frozen.svg" },
  { id: "horizonless.frightened", name: "Frightened", img: "icons/svg/terror.svg" },
  { id: "horizonless.grappled", name: "Grappled", img: "icons/svg/net.svg" },
  { id: "horizonless.incapacitated", name: "Incapacitated", img: "icons/svg/paralysis.svg" },
  { id: "horizonless.invisible", name: "Invisible", img: "icons/svg/invisible.svg" },
  { id: "horizonless.pacified", name: "Pacified", img: "icons/svg/angel.svg" },
  { id: "horizonless.poisoned", name: "Poisoned", img: "icons/svg/poison.svg" },
  { id: "horizonless.polymorphed", name: "Polymorphed", img: "icons/svg/mystery-man.svg" },
  { id: "horizonless.prone", name: "Prone", img: "icons/svg/falling.svg" },
  { id: "horizonless.provoked", name: "Provoked", img: "icons/svg/explosion.svg" },
  { id: "horizonless.restrained", name: "Restrained", img: "icons/svg/anchor.svg" },
  { id: "horizonless.slowed", name: "Slowed", img: "icons/svg/clockwork.svg" },
  { id: "horizonless.staggered", name: "Staggered", img: "icons/svg/degen.svg" },
  { id: "horizonless.stuck", name: "Stuck", img: "icons/svg/padlock.svg" },
  { id: "horizonless.stunned", name: "Stunned", img: "icons/svg/lightning.svg" },
  { id: "horizonless.unconscious", name: "Unconscious", img: "icons/svg/sleep.svg" },
  { id: "horizonless.dead", name: "Dead", img: "icons/svg/skull.svg" }
]);

const HORIZONLESS_TOKEN_CONDITION_IDS = Object.freeze(
  HORIZONLESS_TOKEN_CONDITIONS.map((condition) => condition.id)
);

const BaseTokenHUD = foundry.applications?.hud?.TokenHUD ?? globalThis.TokenHUD;

export class HorizonlessTokenHUD extends BaseTokenHUD {
  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.statusEffects = Object.values(this._getStatusEffectChoices());
    return context;
  }

  /** @override */
  _getStatusEffectChoices() {
    const allChoices = super._getStatusEffectChoices();
    const filtered = {};

    for (const id of HORIZONLESS_TOKEN_CONDITION_IDS) {
      const choice = allChoices[id];
      if (choice) filtered[id] = choice;
    }

    return filtered;
  }
}

export function getHorizonlessTokenConditions() {
  return HORIZONLESS_TOKEN_CONDITIONS.map((condition) => ({ ...condition }));
}
