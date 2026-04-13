// Import document classes.
import { HorizonlessActor } from './documents/actor.mjs';
import { HorizonlessItem } from './documents/item.mjs';
// Import sheet classes.
import { HorizonlessActorSheet } from './sheets/actor-sheet.mjs';
import { HorizonlessItemSheet } from './sheets/item-sheet.mjs';
import { HorizonlessArmorItemSheet } from './sheets/armor-item-sheet.mjs';
import { HorizonlessWeaponItemSheet } from './sheets/weapon-item-sheet.mjs';
import {
  HorizonlessTokenHUD,
  getHorizonlessTokenConditions,
} from './sheets/token-hud.mjs';
import {
  HorizonlessCombat,
  HorizonlessCombatant,
} from './combat/horizonless-combat.mjs';
import { HorizonlessCombatTracker } from './combat/horizonless-combat-tracker.mjs';
// Import helper/utility classes and constants.
import { preloadHandlebarsTemplates } from './helpers/templates.mjs';
import { HORIZONLESS_RPG } from './helpers/config.mjs';
import { formatOrdinal } from './helpers/chat.mjs';
import { markChatMessageWrapper } from './helpers/chat-dom.mjs';
import { getArmorStrengthRequirementFailure } from './helpers/item-validation.mjs';
import { AncestryFeatureType, ItemType } from './data/enums.mjs';
// Import DataModel classes
import * as models from './data/_module.mjs';

const DEFAULT_TOKEN_BAR_ATTRIBUTES = Object.freeze({
  bar1: 'hitpoints',
  bar2: 'stamina',
});
const INITIALIZED_CONE_DEFAULT_SETTING = 'initializedConeDefault';
const DEFAULT_CONE_TEMPLATE_TYPE = 'flat';

/* -------------------------------------------- */
/*  Init Hook                                   */
/* -------------------------------------------- */

Hooks.once('init', function () {
  // Add utility classes to the global game object so that they're more easily
  // accessible in global contexts.
  game.horizonless = {
    HorizonlessActor,
    HorizonlessItem,
    rollItemMacro,
  };

  HorizonlessItem.registerHooks();

  // Add custom constants for configuration.
  CONFIG.HORIZONLESS_RPG = HORIZONLESS_RPG;
  CONFIG.HORIZONLESS_RPG.initiative = {
    templatePath: `systems/${game.system.id}/templates/combat/combat-tracker.hbs`,
    sortTracker: true,
    activateIconClass: 'fas fa-play',
    deactivateIconClass: 'fas fa-check',
    enableInitiative: false,
  };

  /**
   * Set an initiative formula for the system
   * @type {String}
   */
  CONFIG.Combat.initiative = {
    formula: '1d20 + @abilities.dex.mod',
    decimals: 2,
  };

  CONFIG.HORIZONLESS_RPG.sizes = {
    tiny: "Tiny",
    small: "Small",
    medium: "Medium",
    large: "Large",
    huge: "Huge",
    gargantuan: "Gargantuan",
    colossal: "Colossal"
  };

  // Define custom Document and DataModel classes
  CONFIG.Actor.documentClass = HorizonlessActor;

  // Note that you don't need to declare a DataModel
  // for the base actor/item classes - they are included
  // with the Character/NPC as part of super.defineSchema()
  CONFIG.Actor.dataModels = {
    character: models.HorizonlessCharacter,
    npc: models.HorizonlessNPC
  }
  CONFIG.Item.documentClass = HorizonlessItem;
  CONFIG.Item.dataModels = {
    [ItemType.ITEM]: models.HorizonlessItem,
    [ItemType.ARMOR]: models.HorizonlessArmorItem,
    [ItemType.WEAPON]: models.HorizonlessWeaponItem,
    [ItemType.CURIO]: models.HorizonlessCurioItem,
    [ItemType.FEATURE]: models.HorizonlessFeature,
    [ItemType.CLASS_FEATURE]: models.HorizonlessClassFeature,
    [ItemType.SPELL]: models.HorizonlessSpell,
    [ItemType.MANEUVER]: models.HorizonlessManeuver
  }

  CONFIG.Combat.documentClass = HorizonlessCombat;
  CONFIG.Combatant.documentClass = HorizonlessCombatant;
  CONFIG.ui.combat = HorizonlessCombatTracker;

  // Active Effects are never copied to the Actor,
  // but will still apply to the Actor from within the Item
  // if the transfer property on the Active Effect is true.
  CONFIG.ActiveEffect.legacyTransferral = false;
  CONFIG.statusEffects = getHorizonlessTokenConditions();
  CONFIG.specialStatusEffects.DEFEATED = "horizonless.dead";
  CONFIG.specialStatusEffects.INVISIBLE = "horizonless.invisible";
  CONFIG.Token.hudClass = HorizonlessTokenHUD;

  game.settings.register(game.system.id, INITIALIZED_CONE_DEFAULT_SETTING, {
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
  });

  // Register sheet application classes
  const actorCollection = foundry.documents.collections.Actors;
  const itemCollection = foundry.documents.collections.Items;
  const coreActorSheetClass = foundry.appv1.sheets.ActorSheet;
  if (actorCollection && coreActorSheetClass) {
    actorCollection.unregisterSheet('core', coreActorSheetClass);
  }
  actorCollection?.registerSheet('horizonless', HorizonlessActorSheet, {
    makeDefault: true,
    label: 'HORIZONLESS_RPG.SheetLabels.Actor',
  });
  const coreItemSheetClass = foundry.appv1.sheets.ItemSheet;
  if (itemCollection && coreItemSheetClass) {
    itemCollection.unregisterSheet('core', coreItemSheetClass);
  }
  itemCollection?.registerSheet('horizonless', HorizonlessItemSheet, {
    makeDefault: true,
    types: [
      ItemType.ITEM,
      ItemType.CURIO,
      ItemType.FEATURE,
      ItemType.CLASS_FEATURE,
      ItemType.SPELL,
      ItemType.MANEUVER,
    ],
    label: 'HORIZONLESS_RPG.SheetLabels.Item',
  });

  Hooks.on('renderChatMessageHTML', (message, html) => {
    markChatMessageWrapper(html, 'horizonless-chat-message');
  });
  itemCollection?.registerSheet('horizonless', HorizonlessArmorItemSheet, {
    makeDefault: true,
    types: [ItemType.ARMOR],
    label: 'HORIZONLESS_RPG.SheetLabels.Armor',
  });
  itemCollection?.registerSheet('horizonless', HorizonlessWeaponItemSheet, {
    makeDefault: true,
    types: [ItemType.WEAPON],
    label: 'HORIZONLESS_RPG.SheetLabels.Weapon',
  });

  // Preload Handlebars templates.
  return preloadHandlebarsTemplates();
});

/* -------------------------------------------- */
/*  Handlebars Helpers                          */
/* -------------------------------------------- */

// If you need to add Handlebars helpers, here is a useful example:
Handlebars.registerHelper('toLowerCase', function (str) {
  return str.toLowerCase();
});

Handlebars.registerHelper('capitalize', function (str) {
  if (typeof str !== 'string' || str.length === 0) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
});

Handlebars.registerHelper('ordinal', function (value) {
  return formatOrdinal(value);
});

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once('ready', async function () {
  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  Hooks.on('hotbarDrop', (bar, data, slot) => createItemMacro(data, slot));
  await migrateLegacyFeatureSystemFields();
  await initializeConeTemplateDefault();
  migrateActorPrototypeTokenBars();

  const combatTrackerConfig = game.settings.get('core', 'combatTrackerConfig');
  const turnMarkerEnabled = combatTrackerConfig?.turnMarker?.enabled ?? null;

  if (game.user?.isActiveGM && turnMarkerEnabled !== false) {
    const nextConfig = foundry.utils.deepClone(combatTrackerConfig);
    nextConfig.turnMarker.enabled = false;
    await game.settings.set('core', 'combatTrackerConfig', nextConfig);
  }
});

Hooks.on('preCreateActor', (actor, data) => {
  const updateData = buildDefaultPrototypeTokenUpdate(data);
  if (Object.keys(updateData).length > 0) {
    actor.updateSource(updateData);
  }
});

Hooks.on('preUpdateItem', (item, changed, _options, userId) => {
  if (item.type !== ItemType.ARMOR) return true;

  const nextWorn = foundry.utils.getProperty(changed, 'system.worn');
  if (nextWorn !== true) return true;

  const failure = getArmorStrengthRequirementFailure(item);
  if (!failure) return true;

  if (game.user?.id === userId) {
    ui.notifications?.warn(failure.message);
  }
  return false;
});

/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function createItemMacro(data, slot) {
  // First, determine if this is a valid owned item.
  if (data.type !== 'Item') return;
  if (!data.uuid.includes('Actor.') && !data.uuid.includes('Token.')) {
    return ui.notifications.warn(
      'You can only create macro buttons for owned Items'
    );
  }
  // If it is, retrieve it based on the uuid.
  const item = await Item.fromDropData(data);

  // Create the macro command using the uuid.
  const command = `game.horizonless.rollItemMacro("${data.uuid}");`;
  let macro = game.macros.find(
    (m) => m.name === item.name && m.command === command
  );
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: 'script',
      img: item.img,
      command: command,
      flags: { 'horizonless.itemMacro': true },
    });
  }
  game.user.assignHotbarMacro(macro, slot);
  return false;
}

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {string} itemUuid
 */
function rollItemMacro(itemUuid) {
  // Reconstruct the drop data so that we can load the item.
  const dropData = {
    type: 'Item',
    uuid: itemUuid,
  };
  // Load the item from the uuid.
  Item.fromDropData(dropData).then((item) => {
    // Determine if the item loaded and if it's an owned item.
    if (!item || !item.parent) {
      const itemName = item?.name ?? itemUuid;
      return ui.notifications.warn(
        `Could not find item ${itemName}. You may need to delete and recreate this macro.`
      );
    }

    // Trigger the item roll
    item.roll();
  });
}

function buildDefaultPrototypeTokenUpdate(data) {
  const updateData = {};
  const actorType = String(data?.type ?? '').trim();

  for (const [barKey, attribute] of Object.entries(DEFAULT_TOKEN_BAR_ATTRIBUTES)) {
    const currentAttribute = foundry.utils.getProperty(
      data,
      `prototypeToken.${barKey}.attribute`
    );
    if (!currentAttribute) {
      foundry.utils.setProperty(
        updateData,
        `prototypeToken.${barKey}.attribute`,
        attribute
      );
    }
  }

  const displayBars = foundry.utils.getProperty(data, 'prototypeToken.displayBars');
  if (displayBars === undefined || displayBars === null) {
    foundry.utils.setProperty(
      updateData,
      'prototypeToken.displayBars',
      CONST.TOKEN_DISPLAY_MODES.ALWAYS
    );
  }

  if (actorType === 'character') {
    foundry.utils.setProperty(updateData, 'prototypeToken.actorLink', true);
  }

  return updateData;
}

async function migrateActorPrototypeTokenBars() {
  if (!game.user?.isGM) return;

  for (const actor of game.actors?.contents ?? []) {
    const updateData = {};
    let tokenBarsNeedMigration = false;

    for (const [barKey, attribute] of Object.entries(DEFAULT_TOKEN_BAR_ATTRIBUTES)) {
      const currentAttribute = foundry.utils.getProperty(
        actor,
        `prototypeToken.${barKey}.attribute`
      );
      if (!currentAttribute) {
        tokenBarsNeedMigration = true;
        foundry.utils.setProperty(
          updateData,
          `prototypeToken.${barKey}.attribute`,
          attribute
        );
      }
    }

    const displayBars = foundry.utils.getProperty(actor, 'prototypeToken.displayBars');
    if (
      displayBars === undefined ||
      displayBars === null ||
      (displayBars === CONST.TOKEN_DISPLAY_MODES.NONE && tokenBarsNeedMigration)
    ) {
      foundry.utils.setProperty(
        updateData,
        'prototypeToken.displayBars',
        CONST.TOKEN_DISPLAY_MODES.ALWAYS
      );
    }

    if (actor.type === 'character' && actor.prototypeToken?.actorLink !== true) {
      foundry.utils.setProperty(updateData, 'prototypeToken.actorLink', true);
    }

    if (Object.keys(updateData).length > 0) {
      await actor.update(updateData);
    }
  }
}

async function initializeConeTemplateDefault() {
  if (!game.user?.isGM) return;
  if (game.settings.get(game.system.id, INITIALIZED_CONE_DEFAULT_SETTING)) return;

  await game.settings.set('core', 'coneTemplateType', DEFAULT_CONE_TEMPLATE_TYPE);
  await game.settings.set(game.system.id, INITIALIZED_CONE_DEFAULT_SETTING, true);
}

async function migrateLegacyFeatureSystemFields() {
  if (!game.user?.isGM) return;

  const featureDocuments = [
    ...(game.items?.contents ?? []),
    ...(game.actors?.contents ?? []).flatMap((actor) => actor.items.contents),
  ].filter((item) => item?.type === ItemType.FEATURE);

  for (const item of featureDocuments) {
    const ancestryFeatureType = String(item.system?.ancestryFeatureType ?? '').trim();
    const ancestry = String(item.system?.ancestry ?? '').trim();
    const legacyFeatureType = String(item.flags?.horizonless?.ancestryFeatureType ?? '').trim();
    const legacyAncestry = String(item.flags?.horizonless?.ancestry ?? '').trim();
    const featureName = String(item.name ?? '').trim();
    const inferredAncestry = featureName.includes(' - ')
      ? String(featureName.split(' - ')[0] ?? '').trim()
      : '';

    const updateData = {};
    if (!ancestryFeatureType && Object.values(AncestryFeatureType).includes(legacyFeatureType)) {
      updateData['system.ancestryFeatureType'] = legacyFeatureType;
    }
    if (!ancestry) {
      const nextAncestry = legacyAncestry || inferredAncestry;
      if (nextAncestry) updateData['system.ancestry'] = nextAncestry;
    }

    if (Object.keys(updateData).length > 0) {
      await item.update(updateData);
    }
  }
}
