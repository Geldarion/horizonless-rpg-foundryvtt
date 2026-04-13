function resolveTemplateLoader() {
  return foundry.applications?.handlebars?.loadTemplates ?? globalThis.loadTemplates;
}

/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
export const preloadHandlebarsTemplates = async function () {
  const loadTemplates = resolveTemplateLoader();
  return loadTemplates([
    // Actor sheet templates.
    'systems/horizonless/templates/actor/actor-sheet-root.hbs',
    'systems/horizonless/templates/actor/actor-character-sheet.hbs',
    'systems/horizonless/templates/actor/actor-npc-sheet.hbs',
    // Actor partials.
    'systems/horizonless/templates/actor/parts/actor-features.hbs',
    'systems/horizonless/templates/actor/parts/actor-class-feature.hbs',
    'systems/horizonless/templates/actor/parts/actor-ancestries.hbs',
    'systems/horizonless/templates/actor/parts/actor-items.hbs',
    'systems/horizonless/templates/actor/parts/actor-spells.hbs',
    'systems/horizonless/templates/actor/parts/actor-maneuvers.hbs',
    'systems/horizonless/templates/actor/parts/actor-trades.hbs',
    'systems/horizonless/templates/actor/parts/actor-effects.hbs',
    'systems/horizonless/templates/shared/parts/editor-toggle.hbs',
    // Item sheet templates.
    'systems/horizonless/templates/item/item-sheet-root.hbs',
    'systems/horizonless/templates/item/item-sheet.hbs',
    'systems/horizonless/templates/item/item-item-sheet.hbs',
    'systems/horizonless/templates/item/item-armor-sheet.hbs',
    'systems/horizonless/templates/item/item-weapon-sheet.hbs',
    'systems/horizonless/templates/item/item-curio-sheet.hbs',
    'systems/horizonless/templates/item/item-feature-sheet.hbs',
    'systems/horizonless/templates/item/item-class-feature-sheet.hbs',
    'systems/horizonless/templates/item/item-spell-sheet.hbs',
    'systems/horizonless/templates/item/item-maneuver-sheet.hbs',
    // Item partials
    'systems/horizonless/templates/item/parts/item-effects.hbs',
    // Chat/message templates
    'systems/horizonless/module/messages/item/content-message.hbs',
    'systems/horizonless/module/messages/item/curio-flavor.hbs',
    'systems/horizonless/module/messages/item/roll-flavor.hbs',
    'systems/horizonless/module/messages/item/weapon-attack-flavor.hbs',
    'systems/horizonless/module/messages/item/weapon-damage-flavor.hbs',
    'systems/horizonless/module/messages/item/weapon-damage-roll-button.hbs',
    'systems/horizonless/module/messages/item/weapon-apply-damage-button.hbs',
    'systems/horizonless/module/messages/item/weapon-apply-damage-applied.hbs',
    'systems/horizonless/module/messages/maneuvers/chat-content.hbs',
    'systems/horizonless/module/messages/maneuvers/roll-flavor-suffix.hbs',
    'systems/horizonless/module/messages/spells/spell-chat.hbs',
    'systems/horizonless/module/messages/spells/spell-roll-flavor.hbs',
    'systems/horizonless/module/messages/spells/heightening-note.hbs',
    'systems/horizonless/module/messages/spells/heightening-dialog.hbs',
    'systems/horizonless/module/messages/spells/spell-save-results.hbs',
    'systems/horizonless/module/messages/spells/spell-damage-roll-button.hbs',
    'systems/horizonless/module/messages/spells/spell-damage-flavor.hbs',
    'systems/horizonless/module/messages/spells/spell-damage-message.hbs',
    'systems/horizonless/module/messages/spells/spell-apply-damage-button.hbs',
    'systems/horizonless/module/messages/spells/spell-apply-damage-applied.hbs',
    // Combat templates
    'systems/horizonless/templates/combat/combat-tracker.hbs',
  ]);
};
