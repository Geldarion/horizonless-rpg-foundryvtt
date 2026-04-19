import { HorizonlessBaseItem } from './item-base.mjs';
import { ItemType, SpellList } from '../data/enums.mjs';
import {
  getOrdinalSuffix,
  prepareEnrichedChatContent,
} from '../helpers/chat.mjs';
import {
  getDamageTypeSelectGroups,
} from '../helpers/damage-buffers.mjs';
import {
  createDamageButtonController,
  parseStringArray,
} from '../combat/horizonless-damage-button.mjs';
import { markChatMessageWrapper } from '../helpers/chat-dom.mjs';
import { normalizeSpellDamageFormula } from '../helpers/compendium-normalization.mjs';

const { DialogV2 } = foundry.applications.api;
const renderTemplate = foundry.applications.handlebars.renderTemplate;

const SPELL_MESSAGE_TEMPLATES = {
  spellChat: 'systems/horizonless/module/messages/spells/spell-chat.hbs',
  spellRollFlavor: 'systems/horizonless/module/messages/spells/spell-roll-flavor.hbs',
  heighteningDialog: 'systems/horizonless/module/messages/spells/heightening-dialog.hbs',
  heighteningNote: 'systems/horizonless/module/messages/spells/heightening-note.hbs',
  spellSaveResults: 'systems/horizonless/module/messages/spells/spell-save-results.hbs',
  spellAttackFlavor: 'systems/horizonless/module/messages/item/weapon-attack-flavor.hbs',
  spellDamageRollButton: 'systems/horizonless/module/messages/spells/spell-damage-roll-button.hbs',
  spellDamageFlavor: 'systems/horizonless/module/messages/spells/spell-damage-flavor.hbs',
  spellDamageMessage: 'systems/horizonless/module/messages/spells/spell-damage-message.hbs',
  spellApplyDamageButton: 'systems/horizonless/module/messages/spells/spell-apply-damage-button.hbs',
  spellApplyDamageApplied: 'systems/horizonless/module/messages/spells/spell-apply-damage-applied.hbs',
};

const SPELL_SAVE_ABILITY_MAP = Object.freeze({
  poise: 'str',
  reflex: 'dex',
  fortitude: 'con',
  'quick-wits': 'int',
  will: 'wis',
  courage: 'cha',
});

const SPELL_LIST_DEFAULT_MODIFIER_MAP = Object.freeze({
  [SpellList.ARCANE]: 'int',
  [SpellList.DIVINE]: 'wis',
  [SpellList.HARMONIC]: 'cha',
  [SpellList.OCCULT]: 'int',
  [SpellList.PRIMAL]: 'wis',
});

const HERALD_OF_DEFIANCE_DAMAGE_TYPE_OPTIONS = Object.freeze([
  { value: 'radiant', label: 'Radiant' },
  { value: 'necrotic', label: 'Necrotic' },
]);

const SPELL_DAMAGE_INCREASE_PATTERNS = Object.freeze({
  baseSpecific: [
    /(?:this spell's|its)\s+initial\s+damage\s+roll\s+(?:is\s+)?increase(?:d|s)\s+by\s+([^,.]+?)(?=(?:,| and\b|\.|$))/gi,
    /(?:this spell's|its)\s+area\s+damage\s+roll\s+(?:is\s+)?increase(?:d|s)\s+by\s+([^,.]+?)(?=(?:,| and\b|\.|$))/gi,
  ],
  spellstrikeSpecific: [
    /(?:this spell's|its)\s+bonus\s+attack\s+damage\s+roll\s+(?:is\s+)?increase(?:d|s)\s+by\s+([^,.]+?)(?=(?:,| and\b|\.|$))/gi,
    /(?:this spell's|its)\s+bonus\s+weapon\s+damage\s+roll\s+(?:is\s+)?increase(?:d|s)\s+by\s+([^,.]+?)(?=(?:,| and\b|\.|$))/gi,
  ],
  generic: [
    /(?:this spell's|its)\s+damage\s+roll\s+(?:is\s+)?increase(?:d|s)\s+by\s+([^,.]+?)(?=(?:,| and\b|\.|$))/gi,
  ],
  herald: [
    /damage\s+increase(?:d|s)?\s+by\s+([^,.]+?)(?=(?:,| and\b|\.|$))/gi,
  ],
});

function normalizeSpellRuleText(value = '') {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\\\./g, '.')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSpellBonusFormula(value = '') {
  const cleaned = normalizeSpellRuleText(value)
    .replace(/\.$/, '')
    .trim();
  if (!cleaned) return null;
  return normalizeSpellDamageFormula(cleaned) ?? (/^\d+$/.test(cleaned) ? cleaned : null);
}

function extractFormulaTermsFromText(text = '', patterns = []) {
  const normalizedText = normalizeSpellRuleText(text);
  const terms = [];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(normalizedText)) !== null) {
      const rawAmount = String(match[1] ?? '')
        .replace(/\.$/, '')
        .trim();
      const formula = normalizeSpellBonusFormula(rawAmount);
      if (!formula) continue;
      terms.push({
        formula,
        label: rawAmount,
      });
    }
  }

  return terms;
}

function repeatFormulaTerms(terms = [], count = 1) {
  const safeCount = Math.max(1, Math.floor(Number(count ?? 1) || 1));
  const repeated = [];
  for (let index = 0; index < safeCount; index += 1) {
    repeated.push(...terms.map((term) => ({ ...term })));
  }
  return repeated;
}

function combineSpellFormulaTerms(baseFormula = '', bonusTerms = []) {
  const terms = [
    String(baseFormula ?? '').trim(),
    ...bonusTerms
      .map((term) => String(term?.formula ?? '').trim())
      .filter((term) => term.length > 0),
  ]
    .filter((term) => term.length > 0)
    .map((term) => `(${term})`);

  return terms.length > 0 ? terms.join(' + ') : '';
}

function combineSpellDamageLabels(baseLabel = '', bonusTerms = []) {
  return [
    String(baseLabel ?? '').trim(),
    ...bonusTerms
      .map((term) => String(term?.label ?? '').trim())
      .filter((term) => term.length > 0),
  ]
    .filter((term) => term.length > 0)
    .join(' + ');
}

function extractDamageAmountFromPhrase(phrase = '') {
  const normalizedPhrase = normalizeSpellRuleText(phrase)
    .replace(/\.$/, '')
    .trim();
  if (!normalizedPhrase) return null;

  const patterns = [
    /^(.+?)\s+injuring\s+[A-Za-z-]+\s+damage$/i,
    /^(.+?)\s+[A-Za-z-]+\s+damage$/i,
    /^(.+?)\s+damage$/i,
  ];

  for (const pattern of patterns) {
    const match = normalizedPhrase.match(pattern);
    if (!match) continue;
    const rawAmount = String(match[1] ?? '').trim();
    const formula = normalizeSpellBonusFormula(rawAmount);
    if (!formula) return null;
    return {
      formula,
      label: rawAmount,
    };
  }

  const formula = normalizeSpellBonusFormula(normalizedPhrase);
  if (!formula) return null;
  return {
    formula,
    label: normalizedPhrase,
  };
}

function getControlledTokens() {
  const placeables = canvas?.tokens?.placeables ?? [];
  return placeables.filter((token) => token?.controlled && token?.actor);
}

function getTargetedTokens() {
  const targets = Array.from(game.user?.targets ?? []);
  return targets.filter((token) => token?.actor);
}

function getSaveRollTokens() {
  const tokens = getTargetedTokens();
  if (tokens.length > 0) return tokens;

  return getControlledTokens();
}

/**
 * Spell-oriented Item document behavior.
 * @extends {HorizonlessBaseItem}
 */
export class HorizonlessSpellItem extends HorizonlessBaseItem {
  static _spellChatHookRegistered = false;
  static _damageButtonController = createDamageButtonController({
    appliedTemplatePath: SPELL_MESSAGE_TEMPLATES.spellApplyDamageApplied,
    persistence: {
      mode: 'perTarget',
      flag: 'spellDamageApplications',
      keyDataset: 'applicationKey',
    },
    getDamageTypeSelect: (button) =>
      button
        ?.closest?.('.horizonless-damage-action')
        ?.querySelector?.('.horizonless-damage-type') ?? null,
    getInjuringCheckbox: (button) =>
      button
        ?.closest?.('.horizonless-damage-action')
        ?.querySelector?.('.horizonless-damage-injuring') ?? null,
    getHalfDamageCheckbox: (button) =>
      button
        ?.closest?.('.horizonless-damage-action')
        ?.querySelector?.('.horizonless-damage-half') ?? null,
    getUndoActivator: (event) =>
      event.target instanceof Element
        ? event.target.closest('.horizonless-undo-damage')
        : null,
    getTargetTokenUuids: (button) =>
      String(button?.dataset?.targetTokenUuids ?? '').trim(),
    getTotalDamage: (button) =>
      Number(String(button?.dataset?.damageTotal ?? '').trim()),
  });

  static getDefaultSpellcastingModifier(spellList = '') {
    const normalizedSpellList = String(spellList ?? '').trim().toLowerCase();
    return SPELL_LIST_DEFAULT_MODIFIER_MAP[normalizedSpellList] ?? 'int';
  }

  static parseSpellCircleLabel(levelLabel = '') {
    const normalizedLabel = String(levelLabel ?? '').trim().toLowerCase();
    if (!normalizedLabel) return null;
    if (normalizedLabel === 'cantrip') return 0;

    const match = normalizedLabel.match(/^(\d+)(st|nd|rd|th)\s+circle$/);
    if (!match) return null;

    const circle = Number(match[1]);
    if (!Number.isFinite(circle)) return null;
    return Math.max(0, Math.min(7, circle));
  }

  static getNormalizedSpellCircleData(systemData = {}) {
    const parsedCircle = this.parseSpellCircleLabel(systemData?.levelLabel);
    if (parsedCircle === null) return null;

    const rawSpellLevel = Number(systemData?.spellLevel);
    const rawHeightenedCircle = Number(systemData?.heightenedCircle);
    const hasLegacyOffset = Number.isFinite(rawSpellLevel) && rawSpellLevel === (parsedCircle + 1);
    const normalizedSpellLevel = parsedCircle;

    let normalizedHeightenedCircle = Number.isFinite(rawHeightenedCircle)
      ? rawHeightenedCircle
      : normalizedSpellLevel;

    if (hasLegacyOffset && Number.isFinite(rawHeightenedCircle)) {
      normalizedHeightenedCircle -= 1;
    }

    normalizedHeightenedCircle = Math.max(
      normalizedSpellLevel,
      Math.min(7, Number.isFinite(normalizedHeightenedCircle) ? normalizedHeightenedCircle : normalizedSpellLevel)
    );

    if (rawSpellLevel === normalizedSpellLevel && rawHeightenedCircle === normalizedHeightenedCircle) return null;

    return {
      spellLevel: normalizedSpellLevel,
      heightenedCircle: normalizedHeightenedCircle,
    };
  }

  static applyDefaultSpellcastingModifier(updateData = {}, fallbackSpellList = '') {
    const systemChanges = updateData.system ?? {};
    const nextSpellList = systemChanges.spellList ?? fallbackSpellList;
    const currentModifier = systemChanges.spellcastingModifier;

    if (String(currentModifier ?? '').trim()) return updateData;

    return foundry.utils.mergeObject(updateData, {
      system: {
        spellcastingModifier: this.getDefaultSpellcastingModifier(nextSpellList),
      },
    });
  }

  _applyDefaultSpellcastingModifierToSource(data = {}) {
    const createData = foundry.utils.deepClone(data ?? {});
    const normalizedCircleData = HorizonlessSpellItem.getNormalizedSpellCircleData(createData.system);
    if (normalizedCircleData) {
      createData.system ??= {};
      foundry.utils.mergeObject(createData, { system: normalizedCircleData });
    }
    const withDefaultModifier = HorizonlessSpellItem.applyDefaultSpellcastingModifier(
      createData,
      createData.system?.spellList ?? this.system?.spellList
    );
    this.updateSource(withDefaultModifier);
  }

  _normalizeSpellCircleDataOnSource() {
    const normalizedCircleData = HorizonlessSpellItem.getNormalizedSpellCircleData(this.system);
    if (!normalizedCircleData) return;
    this.updateSource({ system: normalizedCircleData });
  }

  _applyDefaultSpellcastingModifierToUpdate(changed = {}) {
    const normalizedCircleData = HorizonlessSpellItem.getNormalizedSpellCircleData({
      ...this.system,
      ...(changed?.system ?? {}),
    });
    if (normalizedCircleData) {
      foundry.utils.mergeObject(changed, { system: normalizedCircleData });
    }

    const currentModifier = String(this.system?.spellcastingModifier ?? '').trim();
    const currentSpellList = String(this.system?.spellList ?? '').trim();
    const nextSpellList = String(changed?.system?.spellList ?? currentSpellList).trim();
    const requestedModifier = String(changed?.system?.spellcastingModifier ?? '').trim();

    if (requestedModifier) return;
    if (!changed?.system?.spellList && currentModifier) return;

    const shouldApplyDefault =
      !currentModifier
      || (changed?.system?.spellList && !requestedModifier && !Object.prototype.hasOwnProperty.call(changed.system, 'spellcastingModifier'));

    if (!shouldApplyDefault) return;

    foundry.utils.mergeObject(changed, {
      system: {
        spellcastingModifier: HorizonlessSpellItem.getDefaultSpellcastingModifier(nextSpellList),
      },
    });
  }

  static registerHooks() {
    this._registerSpellChatMessageHook();
  }

  static _isSpellChatMessage(message) {
    return Boolean(message?.getFlag?.('horizonless', 'spellChat'));
  }

  static _markSpellChatWrapper(html) {
    markChatMessageWrapper(html, 'horizonless-spell-chat-message');
    this._moveItemChatAfterDiceResult(html);
  }

  static _registerSpellChatMessageHook() {
    if (this._spellChatHookRegistered) return;

    const applySpellWrapperClass = (message, html) => {
      if (!this._isSpellChatMessage(message)) return;
      this._markSpellChatWrapper(html);
      this._bindSavingThrowButtons(html);
      this._bindAttackButtons(html);
      this._bindDamageRollButtons(html);
      this._bindApplyDamageButtons(html, message);
    };

    Hooks.on('renderChatMessageHTML', (message, html) => {
      applySpellWrapperClass(message, html);
    });

    this._spellChatHookRegistered = true;
  }

  static _getSaveAbilityKey(saveType) {
    const normalized = String(saveType ?? '').trim().toLowerCase();
    return SPELL_SAVE_ABILITY_MAP[normalized] ?? null;
  }

  static _getSpellDc(item) {
    const actor = item?.actor;
    if (!(actor instanceof Actor)) return null;

    const spellcastingModifierKey = String(
      item?.system?.spellcastingModifier ?? this.getDefaultSpellcastingModifier(item?.system?.spellList)
    ).trim().toLowerCase();
    const spellcastingModifier = Number(actor.system?.abilities?.[spellcastingModifierKey]?.mod ?? 0);
    const tierBonus = Number(actor.system?.tierBonus ?? 0);

    return {
      total: 8 + spellcastingModifier + tierBonus,
      modifierKey: spellcastingModifierKey,
      modifierValue: spellcastingModifier,
      tierBonus,
    };
  }

  static _isSpellAttackType(attackType) {
    const normalized = String(attackType ?? '').trim().toLowerCase();
    return normalized === 'melee spell attack' || normalized === 'ranged spell attack';
  }

  static _getSpellAttackBonus(item) {
    const actor = item?.actor;
    if (!(actor instanceof Actor)) return null;

    const spellcastingModifierKey = String(
      item?.system?.spellcastingModifier ?? this.getDefaultSpellcastingModifier(item?.system?.spellList)
    ).trim().toLowerCase();
    const spellcastingModifier = Number(actor.system?.abilities?.[spellcastingModifierKey]?.mod ?? 0);
    const tierBonus = Number(actor.system?.tierBonus ?? 0);

    return {
      total: spellcastingModifier + tierBonus,
      modifierKey: spellcastingModifierKey,
      modifierValue: spellcastingModifier,
      tierBonus,
    };
  }

  static _getSaveButtonElements(html) {
    if (typeof html?.find === 'function') {
      return Array.from(html.find('.horizonless-spell-chat-save-button') ?? []);
    }
    if (typeof html?.querySelectorAll === 'function') {
      return Array.from(html.querySelectorAll('.horizonless-spell-chat-save-button'));
    }
    return [];
  }

  static _getAttackButtonElements(html) {
    if (typeof html?.find === 'function') {
      return Array.from(html.find('.horizonless-spell-chat-attack-button') ?? []);
    }
    if (typeof html?.querySelectorAll === 'function') {
      return Array.from(html.querySelectorAll('.horizonless-spell-chat-attack-button'));
    }
    return [];
  }

  static _getDamageButtonElements(html) {
    if (typeof html?.find === 'function') {
      return Array.from(html.find('.horizonless-spell-chat-damage-button') ?? []);
    }
    if (typeof html?.querySelectorAll === 'function') {
      return Array.from(html.querySelectorAll('.horizonless-spell-chat-damage-button'));
    }
    return [];
  }

  static _getApplyDamageButtonElements(html) {
    if (typeof html?.find === 'function') {
      return Array.from(html.find('.horizonless-apply-damage') ?? []);
    }
    if (typeof html?.querySelectorAll === 'function') {
      return Array.from(html.querySelectorAll('.horizonless-apply-damage'));
    }
    return [];
  }

  static _moveItemChatAfterDiceResult(html) {
    const root =
      typeof html?.querySelector === 'function'
        ? html
        : typeof html?.[0]?.querySelector === 'function'
          ? html[0]
          : null;
    if (!root) return;

    const itemChat = root.querySelector('.horizonless-chat-card.horizonless-item-chat');
    const diceResult = root.querySelector('.dice-result');
    if (!(itemChat instanceof Element) || !(diceResult instanceof Element)) return;
    if (itemChat.compareDocumentPosition(diceResult) & Node.DOCUMENT_POSITION_FOLLOWING) {
      diceResult.parentNode?.insertBefore(itemChat, diceResult.nextSibling);
    }
  }

  static _bindSavingThrowButtons(html) {
    for (const button of this._getSaveButtonElements(html)) {
      if (button.dataset.saveButtonBound === 'true') continue;
      button.dataset.saveButtonBound = 'true';
      button.addEventListener('click', (event) => this._onSavingThrowButtonClick(event));
    }
  }

  static _bindAttackButtons(html) {
    for (const button of this._getAttackButtonElements(html)) {
      if (button.dataset.attackButtonBound === 'true') continue;
      button.dataset.attackButtonBound = 'true';
      button.addEventListener('click', (event) => this._onAttackButtonClick(event));
    }
  }

  static _bindDamageRollButtons(html) {
    for (const button of this._getDamageButtonElements(html)) {
      if (button.dataset.damageButtonBound === 'true') continue;
      button.dataset.damageButtonBound = 'true';
      button.addEventListener('click', (event) => this._onDamageRollButtonClick(event));
    }
  }

  static _bindApplyDamageButtons(html, message) {
    const buttons = this._getApplyDamageButtonElements(html);

    for (const button of buttons) {
      if (button.dataset.spellApplyButtonBound === 'true') continue;
      button.dataset.spellApplyButtonBound = 'true';
      this._damageButtonController.syncButtonState(button, message);
      button.addEventListener('click', (event) =>
        this._damageButtonController.handleButtonClick(event, message)
      );
    }
  }

  static async _onSavingThrowButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    const abilityKey = String(button?.dataset?.saveAbilityKey ?? '').trim();
    const saveLabel = String(button?.dataset?.saveLabel ?? '').trim();
    const itemUuid = String(button?.dataset?.itemUuid ?? '').trim();
    const targetTokenUuids = parseStringArray(button?.dataset?.targetTokenUuids ?? '');

    if (!abilityKey || !saveLabel || !itemUuid) return;

    const selectedTokens = targetTokenUuids.length > 0
      ? await Promise.all(
          targetTokenUuids.map(async (uuid) => {
            const tokenDocument = await fromUuid(uuid);
            return tokenDocument?.object ?? null;
          })
        ).then((tokens) => tokens.filter((token) => token?.actor))
      : getSaveRollTokens();
    if (selectedTokens.length === 0) {
      ui.notifications?.warn(`Target or select at least one token to roll ${saveLabel} saves.`);
      return;
    }

    const item = await fromUuid(itemUuid);
    if (!(item instanceof Item)) return;

    const spellDc = this._getSpellDc(item);

    const results = [];
    for (const token of selectedTokens) {
      const result = await this._rollSavingThrowForToken(token, {
        abilityKey,
        spellDc: spellDc?.total ?? null,
      });
      if (result) results.push(result);
    }

    if (results.length === 0) return;

    const defaultHalfDamage = results.length > 0
      && results.every((result) => !Boolean(result?.savedAgainstSpell));
    const damageData = this._getSpellDamageButtonData(
      item,
      selectedTokens.map((token) => token?.document?.uuid ?? ''),
      {
        halfDamage: defaultHalfDamage,
      }
    );
    const damageButtonHtml = damageData
      ? await renderTemplate(SPELL_MESSAGE_TEMPLATES.spellDamageRollButton, damageData)
      : '';
    const content = await renderTemplate(SPELL_MESSAGE_TEMPLATES.spellSaveResults, {
      saveLabel,
      hasSpellDc: Number.isFinite(spellDc?.total),
      spellDc: spellDc?.total ?? null,
      results,
      hasDamageButton: Boolean(damageButtonHtml),
      damageButtonHtml,
    });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: item.actor }),
      rollMode: game.settings.get('core', 'rollMode'),
      flavor: `[spell] ${item.name} Saving Throws`,
      content,
      flags: {
        horizonless: {
          spellChat: true,
          spellSaveResults: true,
        },
      },
    });
  }

  static async _onAttackButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    const attackLabel = String(button?.dataset?.attackLabel ?? '').trim();
    const itemUuid = String(button?.dataset?.itemUuid ?? '').trim();
    const targetTokenUuids = parseStringArray(button?.dataset?.targetTokenUuids ?? '');

    if (!attackLabel || !itemUuid) return;

    const selectedTokens = targetTokenUuids.length > 0
      ? await Promise.all(
          targetTokenUuids.map(async (uuid) => {
            const tokenDocument = await fromUuid(uuid);
            return tokenDocument?.object ?? null;
          })
        ).then((tokens) => tokens.filter((token) => token?.actor))
      : getTargetedTokens();

    if (selectedTokens.length === 0) {
      ui.notifications?.warn(`Target at least one token to roll ${attackLabel}.`);
      return;
    }

    const item = await fromUuid(itemUuid);
    if (!(item instanceof Item)) return;

    const actor = item.actor;
    if (!(actor instanceof Actor)) return;

    const attackBonus = this._getSpellAttackBonus(item);
    if (!attackBonus) return;

    const roll = new Roll(
      `1d20 + ${Number(attackBonus.modifierValue ?? 0)} + ${Number(attackBonus.tierBonus ?? 0)}`,
      actor.getRollData()
    );
    await roll.evaluate();

    const attackTotal = Number(roll.total ?? 0);
    const targetResults = selectedTokens.map((token) => {
      const targetActor = token.actor;
      const ac = Number(targetActor?.system?.armorClass);
      const hasAc = Number.isFinite(ac);
      const isHit = hasAc && Number.isFinite(attackTotal) && attackTotal >= ac;
      const targetName = String(token.name ?? targetActor?.name ?? 'Target').trim() || 'Target';

      return {
        targetName,
        resultText: isHit ? 'Hit' : 'Miss',
        resultType: isHit ? 'hit' : 'miss',
        hasAc,
        ac,
      };
    });

    const damageButtonData = this._getSpellDamageButtonData(
      item,
      selectedTokens.map((token) => token?.document?.uuid ?? '')
    );
    const damageButtonHtml = damageButtonData
      ? await renderTemplate(SPELL_MESSAGE_TEMPLATES.spellDamageRollButton, damageButtonData)
      : '';
    const dischargeDamageButtonData = this._getSpellDischargeDamageButtonData(
      item,
      selectedTokens.map((token) => token?.document?.uuid ?? '')
    );
    const dischargeDamageButtonHtml = dischargeDamageButtonData
      ? await renderTemplate(SPELL_MESSAGE_TEMPLATES.spellDamageRollButton, dischargeDamageButtonData)
      : '';
    const flavor = await renderTemplate(SPELL_MESSAGE_TEMPLATES.spellAttackFlavor, {
      label: `[spell attack] ${item.name}`,
      hasTargets: targetResults.length > 0,
      targets: targetResults,
      damageButtonHtml,
      dischargeDamageButtonHtml,
    });

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      rollMode: game.settings.get('core', 'rollMode'),
      flavor,
      flags: {
        horizonless: {
          spellChat: true,
        },
      },
    });
  }

  static async _rollSavingThrowForToken(token, { abilityKey, spellDc = null }) {
    const actor = token?.actor;
    if (!actor) return null;
    if (!Object.prototype.hasOwnProperty.call(CONFIG.HORIZONLESS_RPG.abilities, abilityKey)) return null;

    const abilityMod = Number(actor.system?.abilities?.[abilityKey]?.mod ?? 0);
    const tierBonus = Number(actor.system?.tierBonus ?? 0);
    const isHeroic = Boolean(actor.system?.abilities?.[abilityKey]?.saveHeroic);
    const tierContribution = isHeroic ? tierBonus : Math.floor(tierBonus / 2);
    const formula = `1d20 + ${abilityMod} + ${tierContribution}`;
    const flavorPrefix = isHeroic ? '[heroic save]' : '[save]';

    const roll = new Roll(formula, actor.getRollData());
    await roll.evaluate();

    const normalizedSpellDc = Number(spellDc);
    const hasSpellDc = Number.isFinite(normalizedSpellDc);
    const savedAgainstSpell = hasSpellDc ? Number(roll.total ?? 0) >= normalizedSpellDc : false;

    return {
      tokenName: String(token.name ?? actor.name ?? 'Target').trim() || 'Target',
      total: Number(roll.total ?? 0),
      formula: roll.formula,
      flavorPrefix,
      isHeroic,
      dieTotal: Number(roll.terms?.[0]?.total ?? 0),
      hasSpellDc,
      spellDc: hasSpellDc ? normalizedSpellDc : null,
      resultLabel: hasSpellDc
        ? (savedAgainstSpell ? 'Spell saved against' : 'Spell succeeded!')
        : '',
      savedAgainstSpell,
    };
  }

  static async _renderSpellApplyDamageButton({
    applicationKey = '',
    targetTokenUuids,
    damageTotal,
    selectedDamageType,
    damageTypeOptions = [],
    injuring = false,
    showInjuring = true,
    showHalfDamage = false,
    halfDamage = false,
    buttonLabel = 'Apply Damage',
  }) {
    return renderTemplate(SPELL_MESSAGE_TEMPLATES.spellApplyDamageButton, {
      applicationKey: String(applicationKey ?? '').trim(),
      targetTokenUuids,
      damageTotal,
      damageTypeGroups: getDamageTypeSelectGroups(),
      damageTypeOptions: Array.isArray(damageTypeOptions) ? damageTypeOptions : [],
      hasDamageTypeOptions: Array.isArray(damageTypeOptions) && damageTypeOptions.length > 0,
      selectedDamageType: String(selectedDamageType ?? '').trim(),
      injuring: Boolean(injuring),
      showInjuring: Boolean(showInjuring),
      showHalfDamage: Boolean(showHalfDamage),
      halfDamage: Boolean(halfDamage),
      buttonLabel: String(buttonLabel ?? '').trim() || 'Apply Damage',
    });
  }

  static _getSpellDamageApplicationKey(tokenUuid = '') {
    return JSON.stringify(parseStringArray(tokenUuid));
  }

  static _getDischargeDamageFormula(item) {
    if (!item || !this._isSpellAttackType(item?.system?.attackType)) return null;

    const actor = item.actor;
    if (!(actor instanceof Actor)) return null;

    const rawDischargeDamage = String(item?.system?.discharge?.discharge_damage ?? '').trim();
    if (!rawDischargeDamage) return null;

    const match = rawDischargeDamage.match(/^X\s*d\s*(\d+)$/i);
    if (!match) return null;

    const dieSize = Number(match[1]);
    if (!Number.isFinite(dieSize) || dieSize <= 0) return null;

    const tierBonus = Math.max(0, Math.floor(Number(actor.system?.tierBonus ?? 0)));
    const dischargeDice = Math.floor(tierBonus / 2);
    if (dischargeDice <= 0) return null;

    return `${dischargeDice}d${dieSize}`;
  }

  static _getSpellBaseDamageData(item) {
    const rawDamage = String(item?.system?.damage ?? '').trim();
    const spellcastingModifierKey = String(
      item?.system?.spellcastingModifier ?? this.getDefaultSpellcastingModifier(item?.system?.spellList)
    ).trim().toLowerCase();
    const normalizedDamageSource = rawDamage.toLowerCase();
    const baseDamageFormula = normalizedDamageSource === 'spellcasting modifier'
      ? `@${spellcastingModifierKey}.mod`
      : normalizeSpellDamageFormula(rawDamage);
    return {
      rawDamage,
      baseDamageFormula,
    };
  }

  static _isHeraldOfDefianceSpell(item) {
    return String(item?.name ?? '').trim().toLowerCase() === 'herald of defiance';
  }

  static _getSpellstrikeBonusDamageData(item) {
    const description = String(item?.system?.description ?? '');
    const match = description.match(/\*\*Spellstrike\.\*\*[\s\S]*?deals?\s+an\s+additional\s+\*\*([^*]+?)\*\*/i);
    if (!match) return null;
    return extractDamageAmountFromPhrase(match[1]);
  }

  static _getSelectedHeighteningDamageTerms(selections = [], { hasSpellstrike = false } = {}) {
    const terms = {
      baseTerms: [],
      spellstrikeTerms: [],
    };

    for (const selection of Array.isArray(selections) ? selections : []) {
      const count = Math.max(1, Math.floor(Number(selection?.count ?? 1) || 1));
      const text = String(selection?.text ?? '').trim();
      if (!text) continue;

      const genericTerms = extractFormulaTermsFromText(text, SPELL_DAMAGE_INCREASE_PATTERNS.generic);
      const baseSpecificTerms = extractFormulaTermsFromText(text, SPELL_DAMAGE_INCREASE_PATTERNS.baseSpecific);
      const spellstrikeSpecificTerms = hasSpellstrike
        ? extractFormulaTermsFromText(text, SPELL_DAMAGE_INCREASE_PATTERNS.spellstrikeSpecific)
        : [];

      terms.baseTerms.push(...repeatFormulaTerms([...genericTerms, ...baseSpecificTerms], count));
      if (hasSpellstrike) {
        terms.spellstrikeTerms.push(
          ...repeatFormulaTerms([...genericTerms, ...spellstrikeSpecificTerms], count)
        );
      }
    }

    return terms;
  }

  static _getHeraldDamageIncreaseTotal(selections = []) {
    let totalIncrease = 0;

    for (const selection of Array.isArray(selections) ? selections : []) {
      const count = Math.max(1, Math.floor(Number(selection?.count ?? 1) || 1));
      const terms = extractFormulaTermsFromText(selection?.text ?? '', SPELL_DAMAGE_INCREASE_PATTERNS.herald);
      for (const term of terms) {
        const numericIncrease = Number(term.formula);
        if (!Number.isFinite(numericIncrease)) continue;
        totalIncrease += (numericIncrease * count);
      }
    }

    return Math.max(0, totalIncrease);
  }

  static async _getStrictSpellDamageChatData(item, targetTokenUuids = [], selections = []) {
    const attackType = String(item?.system?.attackType ?? '').trim();
    const savingThrowType = String(item?.system?.savingThrowType ?? '').trim();
    const actorUuid = String(item?.actor?.uuid ?? '').trim();
    const itemUuid = String(item?.uuid ?? '').trim();
    if (!actorUuid || !itemUuid) {
      return {
        damageActions: [],
        inlineApplyDamageButtonHtml: '',
      };
    }

    if (this._isSpellAttackType(attackType) || this._getSaveAbilityKey(savingThrowType)) {
      return {
        damageActions: [],
        inlineApplyDamageButtonHtml: '',
      };
    }

    const normalizedTargets = JSON.stringify(parseStringArray(targetTokenUuids));

    if (this._isHeraldOfDefianceSpell(item)) {
      const inlineApplyDamageButtonHtml = await this._renderSpellApplyDamageButton({
        applicationKey: this._getSpellDamageApplicationKey(targetTokenUuids),
        targetTokenUuids: normalizedTargets,
        damageTotal: 5 + this._getHeraldDamageIncreaseTotal(selections),
        selectedDamageType: '',
        damageTypeOptions: HERALD_OF_DEFIANCE_DAMAGE_TYPE_OPTIONS,
        injuring: false,
        showInjuring: false,
        showHalfDamage: false,
        halfDamage: false,
      });

      return {
        damageActions: [],
        inlineApplyDamageButtonHtml,
      };
    }

    const { rawDamage, baseDamageFormula } = this._getSpellBaseDamageData(item);
    if (!baseDamageFormula) {
      return {
        damageActions: [],
        inlineApplyDamageButtonHtml: '',
      };
    }

    const spellstrikeBonusData = this._getSpellstrikeBonusDamageData(item);
    const heighteningTerms = this._getSelectedHeighteningDamageTerms(selections, {
      hasSpellstrike: Boolean(spellstrikeBonusData),
    });
    const baseButtonData = {
      actorUuid,
      itemUuid,
      damageFormula: combineSpellFormulaTerms(baseDamageFormula, heighteningTerms.baseTerms),
      itemName: String(item?.name ?? 'Spell').trim() || 'Spell',
      damageLabel: combineSpellDamageLabels(rawDamage, heighteningTerms.baseTerms),
      buttonLabel: 'Roll Damage',
      damageType: String(item?.system?.damageType ?? '').trim(),
      injuring: Boolean(item?.system?.injuring),
      halfDamageOption: false,
      halfDamage: false,
      targetTokenUuids: normalizedTargets,
      useCurrentTargets: true,
    };

    const damageActions = [
      await renderTemplate(SPELL_MESSAGE_TEMPLATES.spellDamageRollButton, baseButtonData),
    ];

    if (spellstrikeBonusData) {
      damageActions.push(
        await renderTemplate(SPELL_MESSAGE_TEMPLATES.spellDamageRollButton, {
          actorUuid,
          itemUuid,
          damageFormula: combineSpellFormulaTerms(
            spellstrikeBonusData.formula,
            heighteningTerms.spellstrikeTerms
          ),
          itemName: `${String(item?.name ?? 'Spell').trim() || 'Spell'} Spellstrike`,
          damageLabel: combineSpellDamageLabels(
            spellstrikeBonusData.label,
            heighteningTerms.spellstrikeTerms
          ),
          buttonLabel: 'Roll Damage (Spellstrike)',
          damageType: String(item?.system?.damageType ?? '').trim(),
          injuring: Boolean(item?.system?.injuring),
          halfDamageOption: false,
          halfDamage: false,
          targetTokenUuids: normalizedTargets,
          useCurrentTargets: true,
        })
      );
    }

    return {
      damageActions,
      inlineApplyDamageButtonHtml: '',
    };
  }

  static _getSpellDamageButtonData(item, targetTokenUuids = [], options = {}) {
    const actorUuid = String(item?.actor?.uuid ?? '').trim();
    const itemUuid = String(item?.uuid ?? '').trim();
    const { rawDamage, baseDamageFormula } = this._getSpellBaseDamageData(item);
    if (!actorUuid || !itemUuid || !baseDamageFormula) return null;

    const halfDamage = Boolean(options?.halfDamage);
    return {
      actorUuid,
      itemUuid,
      damageFormula: baseDamageFormula,
      itemName: String(item?.name ?? 'Spell').trim() || 'Spell',
      damageLabel: rawDamage,
      buttonLabel: 'Roll Damage',
      damageType: String(item?.system?.damageType ?? '').trim(),
      injuring: Boolean(item?.system?.injuring),
      halfDamageOption: Boolean(item?.system?.basicSavingThrow),
      halfDamage,
      targetTokenUuids: JSON.stringify(parseStringArray(targetTokenUuids)),
    };
  }

  static _getSpellDischargeDamageButtonData(item, targetTokenUuids = [], options = {}) {
    const actorUuid = String(item?.actor?.uuid ?? '').trim();
    const itemUuid = String(item?.uuid ?? '').trim();
    const { rawDamage, baseDamageFormula } = this._getSpellBaseDamageData(item);
    const dischargeDamageFormula = this._getDischargeDamageFormula(item);
    if (!actorUuid || !itemUuid || !baseDamageFormula || !dischargeDamageFormula) return null;

    const halfDamage = Boolean(options?.halfDamage);
    return {
      actorUuid,
      itemUuid,
      damageFormula: `(${baseDamageFormula}) + (${dischargeDamageFormula})`,
      itemName: String(item?.name ?? 'Spell').trim() || 'Spell',
      damageLabel: `${rawDamage} + ${String(item?.system?.discharge?.discharge_damage ?? '').trim()} discharge`,
      buttonLabel: 'Roll Discharge Damage',
      damageType: String(item?.system?.damageType ?? '').trim(),
      injuring: Boolean(item?.system?.injuring),
      halfDamageOption: Boolean(item?.system?.basicSavingThrow),
      halfDamage,
      targetTokenUuids: JSON.stringify(parseStringArray(targetTokenUuids)),
    };
  }

  static async _onDamageRollButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    const actorUuid = String(button?.dataset?.actorUuid ?? '').trim();
    const itemName = String(button?.dataset?.itemName ?? 'Spell').trim() || 'Spell';
    const formula = String(button?.dataset?.formula ?? '').trim();
    const damageLabel = String(button?.dataset?.damageLabel ?? '').trim();
    const selectedDamageType = String(button?.dataset?.damageType ?? '').trim();
    const injuring = String(button?.dataset?.injuring ?? '').trim() === 'true';
    const showHalfDamage = String(button?.dataset?.halfDamageOption ?? '').trim() === 'true';
    const halfDamage = String(button?.dataset?.halfDamage ?? '').trim() === 'true';
    const useCurrentTargets = String(button?.dataset?.useCurrentTargets ?? '').trim() === 'true';
    let targetTokenUuids = parseStringArray(button?.dataset?.targetTokenUuids ?? '');

    if (!actorUuid || !formula) return;

    const actor = await fromUuid(actorUuid);
    if (!(actor instanceof Actor)) return;

    if (useCurrentTargets) {
      targetTokenUuids = Array.from(
        new Set(
          getTargetedTokens()
            .map((token) => token?.document?.uuid ?? '')
            .map((uuid) => String(uuid).trim())
            .filter((uuid) => uuid.length > 0)
        )
      );
    }

    if (targetTokenUuids.length === 0) {
      ui.notifications?.warn('Target at least one token before rolling spell damage.');
      return;
    }

    const resolvedTargets = await Promise.all(
      targetTokenUuids.map(async (tokenUuid) => {
        const tokenDocument = await fromUuid(tokenUuid);
        const token = tokenDocument?.object ?? tokenDocument ?? null;
        const tokenName = String(
          token?.name ?? tokenDocument?.name ?? tokenDocument?.actor?.name ?? 'Target'
        ).trim() || 'Target';

        return {
          tokenUuid,
          tokenName,
        };
      })
    );
    const targetNames = resolvedTargets
      .map((target) => target.tokenName)
      .filter((name) => name.length > 0);

    const roll = new Roll(formula, actor.getRollData());
    await roll.evaluate();

    const damageTotal = Math.max(0, Math.floor(Number(roll.total ?? 0)));
    const applyDamageButtonHtml = await this._renderSpellApplyDamageButton({
      applicationKey: this._getSpellDamageApplicationKey(targetTokenUuids),
      targetTokenUuids: JSON.stringify(targetTokenUuids),
      damageTotal,
      selectedDamageType,
      injuring,
      showHalfDamage,
      halfDamage,
    });

    const content = await renderTemplate(SPELL_MESSAGE_TEMPLATES.spellDamageMessage, {
      label: `[spell] ${itemName} Damage`,
      hasDamageLabel: damageLabel.length > 0,
      damageLabel,
      hasTargets: targetNames.length > 0,
      targetNames: targetNames.join(', '),
      rollHtml: await roll.render(),
      applyDamageButtonHtml,
    });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      rollMode: game.settings.get('core', 'rollMode'),
      flavor: `[spell] ${itemName} Damage`,
      content,
      flags: {
        horizonless: {
          spellChat: true,
          spellDamageApplications: {},
        },
      },
    });
  }

  _getOrdinalSuffix(value) {
    return getOrdinalSuffix(value);
  }

  _getSpellCircleFromSystem() {
    const baseCircle = Math.max(0, Math.min(7, Number(this.system?.spellLevel ?? 0)));
    const heightenedCircle = Math.max(baseCircle, Math.min(7, Number(this.system?.heightenedCircle ?? baseCircle)));
    return this._isHeighteningSelected() ? heightenedCircle : baseCircle;
  }

  _getSpellCircleLabel(circleValue = 0) {
    const normalizedCircle = Math.max(0, Math.min(7, Math.trunc(Number(circleValue ?? 0) || 0)));
    if (normalizedCircle === 0) return 'Cantrip';

    const circleNumber = normalizedCircle;
    const suffix = this._getOrdinalSuffix(circleNumber);
    return `${circleNumber}${suffix} Circle`;
  }

  _resolveSpellTemplateConfig() {
    if (this.type !== ItemType.SPELL) return null;

    const rawShape = String(this.system?.shape ?? '')
      .trim()
      .toLowerCase();
    const rawSize = String(this.system?.shapeSize ?? '')
      .trim()
      .toLowerCase();
    const combined = `${rawShape} ${rawSize}`.trim();

    const shapeKey = rawShape || combined;
    if (!shapeKey) return null;

    const shapeMap = {
      circle: 'circle',
      sphere: 'circle',
      cylinder: 'circle',
      cone: 'cone',
      line: 'ray',
      ray: 'ray',
      square: 'rect',
      cube: 'rect',
      rect: 'rect',
      rectangle: 'rect',
    };

    let t = null;
    for (const [key, value] of Object.entries(shapeMap)) {
      if (shapeKey.includes(key)) {
        t = value;
        break;
      }
    }
    if (!t) return null;

    const size = this._parseFirstNumber(rawSize);
    if (!Number.isFinite(size) || size <= 0) return null;

    const distance = t === 'rect'
      ? (size * Math.SQRT2)
      : size;

    return {
      t,
      distance,
      // Foundry rectangles are defined by a diagonal, not a side length.
      // Start square templates on a 45-degree diagonal so they render with
      // the expected width and height instead of collapsing to a line.
      direction: t === 'rect' ? 45 : 0,
      angle: t === 'cone' ? 90 : undefined,
      width:
        t === 'ray'
          ? Number(canvas?.scene?.grid?.distance ?? 5)
          : undefined,
      fillColor: game.user?.color ?? '#ff6400',
      texture: null,
    };
  }

  _isHeighteningSelected() {
    if (this.type !== ItemType.SPELL) return false;
    const baseCircle = Number(this.system?.spellLevel ?? 0);
    const heightenedCircle = Number(this.system?.heightenedCircle ?? baseCircle);
    if (!Number.isFinite(baseCircle) || !Number.isFinite(heightenedCircle)) return false;
    return heightenedCircle > baseCircle;
  }

  _setPendingHeighteningSelections(selections) {
    const safeSelections = Array.isArray(selections)
      ? selections
          .map((selection) => ({
            text: String(selection?.text ?? '').trim(),
            requirement: String(selection?.requirement ?? '').trim(),
            count: Math.max(1, Math.floor(Number(selection?.count ?? 1))),
          }))
          .filter((selection) => selection.text.length > 0)
      : [];
    this._pendingHeighteningSelections = safeSelections;
  }

  _consumePendingHeighteningSelections() {
    const selections = Array.isArray(this._pendingHeighteningSelections)
      ? this._pendingHeighteningSelections
      : [];
    this._pendingHeighteningSelections = [];
    return selections;
  }

  async _formatHeighteningSelectionsHtml(selections = []) {
    if (!Array.isArray(selections) || selections.length === 0) return '';
    const normalizedSelections = selections
      .map((selection) => {
        const count = Math.max(1, Math.floor(Number(selection?.count ?? 1)));
        const text = String(selection?.text ?? '').trim();
        if (!text) return null;
        const requirement = String(selection?.requirement ?? '').trim();
        return {
          text,
          count,
          requirement,
          showCount: count > 1,
        };
      })
      .filter(Boolean);

    if (normalizedSelections.length === 0) return '';

    return renderTemplate(SPELL_MESSAGE_TEMPLATES.heighteningNote, {
      selections: normalizedSelections,
    });
  }

  async _showHeighteningConfirmationDialog() {
    if (!this._isHeighteningSelected()) return [];

    const baseCircle = Number(this.system?.spellLevel ?? 0);
    const heightenedCircle = Number(this.system?.heightenedCircle ?? baseCircle);
    const requiredSelections = Math.max(0, heightenedCircle - baseCircle);
    if (requiredSelections <= 0) return [];

    const normalizedOptions = this.system.heighteningOptions.map((option, index) => ({
      id: String(index),
      text: String(option.text ?? '').trim(),
      repeatable: Boolean(option.repeatable),
      requirement: String(option.attributeRequirement ?? '').trim(),
    }));

    if (normalizedOptions.length === 0) return [];

    const dialogContent = await renderTemplate(
      SPELL_MESSAGE_TEMPLATES.heighteningDialog,
      {
        requiredSelections,
        spellName: this.name,
        pluralSuffix: requiredSelections === 1 ? '' : 's',
        options: normalizedOptions.map((option) => ({
          id: option.id,
          text: option.text,
          requirement: option.requirement,
          repeatable: option.repeatable,
          repeatableAttr: option.repeatable ? 'true' : 'false',
        })),
      }
    );

    return DialogV2.wait({
      window: { title: `Heightening: ${this.name}` },
      content: dialogContent,
      modal: true,
      rejectClose: false,
      buttons: [
        {
          action: 'cancel',
          icon: 'fas fa-times',
          label: 'Cancel',
          callback: () => null,
        },
        {
          action: 'confirm',
          icon: 'fas fa-check',
          label: 'Confirm',
          default: true,
          callback: (_event, _button, dialog) => {
            const root = dialog.element;
            if (!root) return null;

            const counts = Array.from(root.querySelectorAll('.hl-heightening-count'));
            const selectedCount = counts.reduce((sum, element) => sum + Number(element?.textContent ?? 0), 0);
            if (selectedCount !== requiredSelections) return null;

            return normalizedOptions
              .map((option) => {
                const countNode = root.querySelector(`[data-count-for="${option.id}"]`);
                const count = Math.max(0, Math.floor(Number(countNode?.textContent ?? 0)));
                if (count <= 0) return null;
                return {
                  text: option.text,
                  requirement: option.requirement,
                  count,
                };
              })
              .filter(Boolean);
          },
        },
      ],
      render: (_event, dialog) => {
        const root = dialog.element;
        if (!root) return;

        const optionRows = Array.from(root.querySelectorAll('.hl-heightening-option-row'));
        const selectedLabel = root.querySelector('.hl-selected-count');
        const counts = new Map(optionRows.map((row) => [row.dataset.optionId, 0]));

        const selectedTotal = () => Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
        const maxForOption = (row) => {
          const isRepeatable = row.dataset.repeatable === 'true';
          return isRepeatable ? requiredSelections : 1;
        };
        const resolveConfirmButton = () => root.querySelector('[data-action="confirm"]');

        const syncUi = () => {
          for (const row of optionRows) {
            const optionId = row.dataset.optionId;
            const count = counts.get(optionId) ?? 0;
            const countLabel = row.querySelector('.hl-heightening-count');
            if (countLabel) countLabel.textContent = String(count);

            const decrementButton = row.querySelector('.hl-heightening-adjust[data-action="decrement"]');
            const incrementButton = row.querySelector('.hl-heightening-adjust[data-action="increment"]');
            if (decrementButton) decrementButton.disabled = count <= 0;

            const total = selectedTotal();
            if (incrementButton) incrementButton.disabled = count >= maxForOption(row) || total >= requiredSelections;
          }

          const total = selectedTotal();
          if (selectedLabel) selectedLabel.textContent = String(total);
          const confirmButton = resolveConfirmButton();
          if (confirmButton) confirmButton.disabled = total !== requiredSelections;
        };

        for (const row of optionRows) {
          row.addEventListener('click', (event) => {
            const button = event.target.closest('.hl-heightening-adjust');
            if (!button) return;
            event.preventDefault();
            const optionId = row.dataset.optionId;
            if (!counts.has(optionId)) return;

            const current = counts.get(optionId) ?? 0;
            const action = button.dataset.action;
            if (action === 'decrement') {
              counts.set(optionId, Math.max(0, current - 1));
            } else if (action === 'increment') {
              const total = selectedTotal();
              const limit = maxForOption(row);
              if (current < limit && total < requiredSelections) counts.set(optionId, current + 1);
            }
            syncUi();
          });
        }

        syncUi();
      },
    });
  }

  _getCastingSourceApplication(options = {}) {
    const sourceApplication = options?.sourceApplication;
    if (!sourceApplication || sourceApplication.actor !== this.actor) return null;
    if (typeof sourceApplication.minimize !== 'function') return null;
    if (typeof sourceApplication.maximize !== 'function') return null;
    return sourceApplication;
  }

  async _withMinimizedCastingSourceApplication(options, callback) {
    const sourceApplication = this._getCastingSourceApplication(options);
    const shouldMinimize =
      Boolean(sourceApplication?.rendered)
      && !sourceApplication.minimized
      && Boolean(this._resolveSpellTemplateConfig())
      && Boolean(canvas?.scene)
      && Boolean(canvas?.grid);

    if (!shouldMinimize) return callback();

    try {
      await sourceApplication.minimize();
    } catch (error) {
      return callback();
    }

    try {
      return await callback();
    } finally {
      try {
        await sourceApplication.maximize();
      } catch (error) {}
    }
  }

  async roll(options = {}) {
    if (this.type !== ItemType.SPELL) return null;
    HorizonlessSpellItem.registerHooks();

    const selectedHeightenings = await this._showHeighteningConfirmationDialog();
    if (!selectedHeightenings) return null;
    this._setPendingHeighteningSelections(selectedHeightenings);

    await this._withMinimizedCastingSourceApplication(options, async () => {
      const placedTemplate = await this._placeSpellTemplate();
      if (placedTemplate) await this._targetTokensInTemplate(placedTemplate);
    });

    const item = this;
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    const rollMode = game.settings.get('core', 'rollMode');
    const label = `[${item.type}] ${item.name}`;
    const pendingHeighteningSelections = this._consumePendingHeighteningSelections?.() ?? [];
    const heighteningNoteHtml = (
      await this._formatHeighteningSelectionsHtml?.(pendingHeighteningSelections)
    ) ?? '';

    const prepareSpellChatContent = async (rawContent = '') => {
      return prepareEnrichedChatContent(rawContent, {
        rollData: this.getRollData(),
        secrets: Boolean(this.actor?.isOwner || game.user?.isGM),
      });
    };

    const stripHeighteningSection = (rawDescription = '') => {
      const lines = String(rawDescription ?? '').split('\n');
      const startIndex = lines.findIndex((line) => /\*\*\*Heightening\.\*\*\*/i.test(line));
      if (startIndex === -1) return String(rawDescription ?? '');

      let endIndex = lines.length;
      for (let index = startIndex + 1; index < lines.length; index += 1) {
        const line = String(lines[index] ?? '');
        if (/^\s*#/.test(line) || /^\s*\*\*\*[^*]+\.\*\*\*/.test(line)) {
          endIndex = index;
          break;
        }
      }

      return [...lines.slice(0, startIndex), ...lines.slice(endIndex)].join('\n').trim();
    };

    if (!this.system.formula) {
      const spellName = String(item.name ?? '').trim();
      const spellIcon = String(item.img ?? '').trim();
      const spellFlavorText = String(item.system?.flavor ?? '').trim();
      const spellFlavorHtml = spellFlavorText
        ? await prepareSpellChatContent(spellFlavorText)
        : '';
      const spellDescriptionText = stripHeighteningSection(item.system?.description ?? '');
      const spellDescriptionHtml = await prepareSpellChatContent(spellDescriptionText);
      const possibleHeighteningOptions = item.system.heighteningOptions.map((option) => ({
        text: String(option.text ?? '').trim(),
        requirement: String(option.attributeRequirement ?? '').trim(),
        repeatable: Boolean(option.repeatable),
      }));
      const possibleHeightenings = await Promise.all(
        possibleHeighteningOptions.map(async (option) => ({
          textHtml: await prepareSpellChatContent(option.text),
          requirement: option.requirement,
          repeatable: option.repeatable,
        }))
      );
      const spellCircleLabel = this._getSpellCircleLabel(this._getSpellCircleFromSystem());
      const spellRange = String(item.system?.range ?? '').trim();
      const spellDuration = String(item.system?.duration ?? '').trim();
      const spellCastingTime = String(item.system?.castingTime ?? '').trim();
      const attackType = String(item.system?.attackType ?? '').trim();
      const savingThrowType = String(item.system?.savingThrowType ?? '').trim();
      const hasSpellAttackButton = HorizonlessSpellItem._isSpellAttackType(attackType);
      const savingThrowAbilityKey = HorizonlessSpellItem._getSaveAbilityKey(savingThrowType);
      const targetTokenUuids = JSON.stringify(
        Array.from(game.user?.targets ?? [])
          .map((token) => token?.document?.uuid ?? '')
          .map((uuid) => String(uuid).trim())
          .filter((uuid) => uuid.length > 0)
          .filter((uuid, index, list) => list.indexOf(uuid) === index)
      );
      const strictSpellDamageChatData = await HorizonlessSpellItem._getStrictSpellDamageChatData(
        item,
        parseStringArray(targetTokenUuids),
        pendingHeighteningSelections
      );
      const content = await renderTemplate(SPELL_MESSAGE_TEMPLATES.spellChat, {
        hasSpellName: spellName.length > 0,
        spellName,
        hasSpellIcon: spellIcon.length > 0,
        spellIcon,
        hasSpellFlavor: Boolean(spellFlavorHtml),
        spellFlavorHtml,
        hasSpellCircle: spellCircleLabel.length > 0,
        spellCircleLabel,
        spellRange: spellRange.length > 0 ? spellRange : '-',
        spellDuration: spellDuration.length > 0 ? spellDuration : '-',
        spellCastingTime: spellCastingTime.length > 0 ? spellCastingTime : '-',
        hasHeighteningNote: Boolean(heighteningNoteHtml),
        heighteningNoteHtml,
        hasPossibleHeightenings: possibleHeightenings.length > 0,
        possibleHeightenings,
        hasSpellAttackButton,
        spellAttackLabel: attackType,
        hasSavingThrowButton: Boolean(savingThrowAbilityKey),
        savingThrowAbilityKey,
        savingThrowLabel: savingThrowType,
        itemUuid: this.uuid,
        targetTokenUuids,
        hasDamageActions: strictSpellDamageChatData.damageActions.length > 0,
        damageActions: strictSpellDamageChatData.damageActions,
        hasInlineApplyDamageButton: Boolean(strictSpellDamageChatData.inlineApplyDamageButtonHtml),
        inlineApplyDamageButtonHtml: strictSpellDamageChatData.inlineApplyDamageButtonHtml,
        spellDescriptionHtml,
      });
      ChatMessage.create({
        speaker,
        rollMode,
        flavor: label,
        content,
        flags: {
          horizonless: {
            spellChat: true,
            spellDamageApplications: {},
          },
        },
      });
      return;
    }

    const rollData = this.getRollData();
    const roll = new Roll(rollData.formula, rollData.actor);
    await roll.evaluate();

    const flavor = await renderTemplate(SPELL_MESSAGE_TEMPLATES.spellRollFlavor, {
      flavorHtml: label,
      hasHeighteningNote: Boolean(heighteningNoteHtml),
      heighteningNoteHtml,
    });

    roll.toMessage({
      speaker,
      rollMode,
      flavor,
      flags: {
        horizonless: {
          spellChat: true,
        },
      },
    });
    return roll;
  }

  async _placeSpellTemplate() {
    const templateConfig = this._resolveSpellTemplateConfig();
    if (!templateConfig || !canvas?.scene || !canvas?.grid) return null;

    const controlledToken = getControlledTokens()[0];
    const startPoint =
      controlledToken?.center ??
      this.actor?.getActiveTokens?.(true, true)?.[0]?.center ??
      { x: canvas.dimensions.width / 2, y: canvas.dimensions.height / 2 };

    const baseTemplateData = {
      user: game.user.id,
      x: startPoint.x,
      y: startPoint.y,
      ...templateConfig,
    };

    const previewDocument = new CONFIG.MeasuredTemplate.documentClass(baseTemplateData, {
      parent: canvas.scene,
    });
    const TemplateObjectClass = CONFIG.MeasuredTemplate.objectClass ?? MeasuredTemplate;
    const previewTemplate = new TemplateObjectClass(previewDocument);
    const templateLayer = canvas.templates;
    if (!templateLayer?.preview || typeof previewTemplate.draw !== 'function') return null;

    await previewTemplate.draw();
    templateLayer.preview.addChild(previewTemplate);

    const originalLayer = canvas.activeLayer;
    templateLayer.activate();

    const snapPoint = (point) => {
      if (typeof templateLayer.getSnappedPoint === 'function') return templateLayer.getSnappedPoint(point);
      if (typeof canvas.grid?.getSnappedPoint === 'function') return canvas.grid.getSnappedPoint(point);
      return point;
    };

    const updatePreviewPosition = (point) => {
      if (!point) return;
      const snapped = snapPoint(point);
      const x = Number(snapped?.x ?? point.x);
      const y = Number(snapped?.y ?? point.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      previewDocument.updateSource({ x, y });
      previewTemplate.refresh();
    };

    const finalizeData = () => {
      const data = foundry.utils.deepClone(previewDocument.toObject());
      delete data._id;
      data.user = game.user.id;
      return data;
    };

    return await new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        canvas.stage?.off?.('pointermove', onPointerMove);
        canvas.stage?.off?.('pointerdown', onPointerDown);
        canvas.stage?.off?.('wheel', onWheel);
        window.removeEventListener('keydown', onKeyDown, true);
        previewTemplate.destroy({ children: true });
        originalLayer?.activate?.();
      };

      const settle = (result, error = null) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(result);
      };

      const onPointerMove = (event) => {
        const point = event?.getLocalPosition?.(canvas.stage) ?? null;
        updatePreviewPosition(point);
      };

      const onPointerDown = async (event) => {
        const isLeftClick = event?.button === 0;
        const isRightClick = event?.button === 2;
        if (isRightClick) {
          event?.preventDefault?.();
          return settle(null);
        }
        if (!isLeftClick) return;

        event?.preventDefault?.();
        event?.stopPropagation?.();

        const point = event?.getLocalPosition?.(canvas.stage) ?? null;
        updatePreviewPosition(point);

        try {
          const created = await canvas.scene.createEmbeddedDocuments('MeasuredTemplate', [finalizeData()]);
          settle(created?.[0] ?? null);
        } catch (error) {
          settle(null, error);
        }
      };

      const onWheel = (event) => {
        if (!event?.ctrlKey) return;
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        const nativeEvent = event?.nativeEvent ?? event?.originalEvent;
        nativeEvent?.preventDefault?.();
        nativeEvent?.stopPropagation?.();
        nativeEvent?.stopImmediatePropagation?.();
        const step = event.deltaY < 0 ? 15 : -15;
        const rawDirection = Number(previewDocument.direction ?? 0) + step;
        const direction = ((rawDirection % 360) + 360) % 360;
        previewDocument.updateSource({ direction });
        previewTemplate.refresh();
      };

      const onKeyDown = (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        settle(null);
      };

      canvas.stage?.on?.('pointermove', onPointerMove);
      canvas.stage?.on?.('pointerdown', onPointerDown);
      canvas.stage?.on?.('wheel', onWheel);
      window.addEventListener('keydown', onKeyDown, true);

      updatePreviewPosition({ x: previewDocument.x, y: previewDocument.y });
    });
  }

  async _targetTokensInTemplate(templateDocument) {
    if (!templateDocument || !canvas?.templates || !canvas?.tokens) {
      return;
    }

    const delay = (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      });

    const getTokenSamplePoints = (token) => {
      const points = [];
      if (token?.center) points.push(token.center);

      const bounds = token?.bounds;
      if (!bounds) return points;

      const { x, y, width, height } = bounds;
      if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
        return points;
      }

      // Include corners so larger or gridless tokens can be targeted by overlap,
      // not only by center-point containment.
      const insetX = Math.min(width / 4, Math.max(2, width * 0.05));
      const insetY = Math.min(height / 4, Math.max(2, height * 0.05));
      points.push({ x: x + insetX, y: y + insetY });
      points.push({ x: x + width - insetX, y: y + insetY });
      points.push({ x: x + insetX, y: y + height - insetY });
      points.push({ x: x + width - insetX, y: y + height - insetY });

      return points;
    };

    const resolveTemplateObject = () =>
      templateDocument.object ??
      canvas.templates.get(templateDocument.id) ??
      canvas.templates.placeables?.find((template) => template.document?.id === templateDocument.id);

    let templateObject = resolveTemplateObject();

    // Newly created templates can exist on canvas before their PIXI shape is initialized.
    // Retry briefly so targeting still works when cast flow runs immediately after placement.
    for (let attempt = 0; attempt < 5 && !templateObject?.shape; attempt += 1) {
      templateObject?.refresh?.();
      await delay(25);
      templateObject = resolveTemplateObject();
    }

    if (!templateObject?.shape) {
      return;
    }

    const placeables = canvas.tokens.placeables ?? [];
    const casterActorId = this.actor?.id ?? null;

    const targetIds = placeables
      .filter((token) => {
        if (!token?.isVisible) return false;
        if (casterActorId && token.actor?.id === casterActorId) return false;
        const originX = templateObject.document?.x ?? templateDocument.x;
        const originY = templateObject.document?.y ?? templateDocument.y;
        if (!Number.isFinite(originX) || !Number.isFinite(originY)) return false;

        const testPoints = getTokenSamplePoints(token);
        if (testPoints.length === 0) return false;

        return testPoints.some((point) => {
          const localX = point.x - originX;
          const localY = point.y - originY;
          return templateObject.shape.contains(localX, localY);
        });
      })
      .map((token) => token.id);

    const user = game.user;
    if (!user) return;

    if (typeof user.updateTokenTargets === 'function') {
      user.updateTokenTargets(targetIds);
      return;
    }

    for (const token of user.targets ?? []) {
      token?.setTarget?.(false, { user, releaseOthers: false, groupSelection: true });
    }

    for (const tokenId of targetIds) {
      const token = canvas.tokens.get(tokenId);
      token?.setTarget?.(true, { user, releaseOthers: false, groupSelection: true });
    }
  }
}

