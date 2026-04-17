import {
  onManageActiveEffect,
  prepareActiveEffectCategories,
} from '../helpers/effects.mjs';
import {
  createEmptyDamageBuffer,
  getDamageTypeSelectGroups,
  normalizeDamageBufferList,
} from '../helpers/damage-buffers.mjs';
import {
  normalizeAncestryName,
} from '../helpers/compendium-normalization.mjs';
import {
  activateDescriptionEditor,
  getDescriptionEditorActions,
  populateDescriptionEditorContext,
  saveDescriptionEditorContent,
  startDescriptionEditing,
} from '../helpers/description-editor.mjs';
import { getArmorStrengthRequirementFailure } from '../helpers/item-validation.mjs';
import {
  AncestryFeatureType,
  GearItemType,
  GuardMode,
  ItemType,
  SheetTheme,
  TradeTypes,
} from '../data/enums.mjs';
import { HorizonlessSpellItem } from '../documents/item-spell.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const TextEditor = foundry.applications.ux.TextEditor.implementation;
const renderTemplate = foundry.applications.handlebars.renderTemplate;

const ANCESTRY_SLOT_CONFIG = Object.freeze({
  [AncestryFeatureType.PRIMARY]: {
    label: 'Primary Feature',
    featureType: AncestryFeatureType.PRIMARY,
    field: 'primaryFeatureId'
  },
  [AncestryFeatureType.SECONDARY]: {
    label: 'Secondary Feature',
    featureType: AncestryFeatureType.SECONDARY,
    field: 'secondaryFeatureId'
  },
  [AncestryFeatureType.TERTIARY]: {
    label: 'Tertiary Feature',
    featureType: AncestryFeatureType.TERTIARY,
    field: 'tertiaryFeatureId'
  },
});

const ANCESTRY_FEATURE_PACK_ID = 'horizonless.ancestry-features';
const SYSTEM_STATIC_ROOT = `systems/${game.system?.id ?? 'horizonless'}`;
const GUARD_SEQUENCE = Object.freeze([
  GuardMode.NO_GUARD,
  GuardMode.HALF_GUARD,
  GuardMode.FULL_GUARD,
]);
const GUARD_ICON_CONFIG = Object.freeze({
  [GuardMode.NO_GUARD]: {
    label: 'No Guard',
    path: `${SYSTEM_STATIC_ROOT}/assets/icons/noguard.svg`,
  },
  [GuardMode.HALF_GUARD]: {
    label: 'Half Guard',
    path: `${SYSTEM_STATIC_ROOT}/assets/icons/halfguard.svg`,
  },
  [GuardMode.FULL_GUARD]: {
    label: 'Full Guard',
    path: `${SYSTEM_STATIC_ROOT}/assets/icons/fullguard.svg`,
  },
});
const CUSTOM_ATTACK_KIND = Object.freeze({
  ATTACK: 'attack',
  SAVE: 'save',
});
const CUSTOM_ATTACK_SAVE_TYPES = Object.freeze([
  'Poise',
  'Reflex',
  'Fortitude',
  'Quick-Wits',
  'Will',
  'Courage',
]);
const CUSTOM_ATTACK_SAVE_ABILITY_MAP = Object.freeze({
  Poise: 'str',
  Reflex: 'dex',
  Fortitude: 'con',
  'Quick-Wits': 'int',
  Will: 'wis',
  Courage: 'cha',
});
const CUSTOM_ATTACK_MESSAGE_TEMPLATES = Object.freeze({
  weaponAttackFlavor: 'systems/horizonless/module/messages/item/weapon-attack-flavor.hbs',
  spellDamageRollButton: 'systems/horizonless/module/messages/spells/spell-damage-roll-button.hbs',
  spellSaveResults: 'systems/horizonless/module/messages/spells/spell-save-results.hbs',
});

function bindEventListeners(root, eventName, selector, listener) {
  for (const element of root.querySelectorAll(selector)) {
    element.addEventListener(eventName, listener);
  }
}

function getGuardArmorBonus(guardMode, tierBonus) {
  switch (guardMode) {
    case GuardMode.HALF_GUARD:
      return Math.floor(tierBonus / 2);
    case GuardMode.FULL_GUARD:
      return tierBonus;
    case GuardMode.NO_GUARD:
    default:
      return 0;
  }
}

function getGuardDisplayData(guardMode) {
  const normalizedGuardMode = GUARD_SEQUENCE.includes(guardMode) ? guardMode : GuardMode.NO_GUARD;
  const config = GUARD_ICON_CONFIG[normalizedGuardMode] ?? GUARD_ICON_CONFIG[GuardMode.NO_GUARD];

  return {
    mode: normalizedGuardMode,
    label: config.label,
    icon: foundry.utils.getRoute(config.path),
  };
}

function getNextGuardMode(guardMode) {
  const currentIndex = GUARD_SEQUENCE.indexOf(guardMode);
  const normalizedIndex = currentIndex >= 0 ? currentIndex : 0;
  return GUARD_SEQUENCE[(normalizedIndex + 1) % GUARD_SEQUENCE.length];
}

function createEmptyCustomResource() {
  return {
    name: '',
    value: 0,
    max: 0,
  };
}

function normalizeCustomResources(customResources) {
  if (!Array.isArray(customResources)) return [];

  return customResources.map((resource) => ({
    name: String(resource?.name ?? ''),
    value: Math.max(0, Math.floor(Number(resource?.value ?? 0) || 0)),
    max: Math.max(0, Math.floor(Number(resource?.max ?? 0) || 0)),
  }));
}

function createEmptyCustomAttack(kind = CUSTOM_ATTACK_KIND.ATTACK) {
  const normalizedKind = kind === CUSTOM_ATTACK_KIND.SAVE
    ? CUSTOM_ATTACK_KIND.SAVE
    : CUSTOM_ATTACK_KIND.ATTACK;

  return {
    kind: normalizedKind,
    name: '',
    toHitBonus: '',
    saveType: '',
    dc: '',
    damage: '',
    damageType: '',
  };
}

function normalizeCustomAttackKind(kind) {
  return kind === CUSTOM_ATTACK_KIND.SAVE
    ? CUSTOM_ATTACK_KIND.SAVE
    : CUSTOM_ATTACK_KIND.ATTACK;
}

function normalizeCustomAttackSaveType(saveType) {
  const normalized = String(saveType ?? '').trim().toLowerCase();
  const matchedType = CUSTOM_ATTACK_SAVE_TYPES.find(
    (option) => option.toLowerCase() === normalized
  );
  return matchedType ?? '';
}

function normalizeCustomAttacks(customAttacks) {
  if (!Array.isArray(customAttacks)) return [];

  return customAttacks.map((entry) => ({
    kind: normalizeCustomAttackKind(String(entry?.kind ?? '')),
    name: String(entry?.name ?? ''),
    toHitBonus: String(entry?.toHitBonus ?? ''),
    saveType: normalizeCustomAttackSaveType(entry?.saveType),
    dc: String(entry?.dc ?? ''),
    damage: String(entry?.damage ?? ''),
    damageType: Object.prototype.hasOwnProperty.call(
      CONFIG.HORIZONLESS_RPG.damageTypes,
      String(entry?.damageType ?? '')
    )
      ? String(entry?.damageType ?? '')
      : '',
  }));
}

function getTargetedTokens() {
  return Array.from(game.user?.targets ?? []).filter((token) => token?.actor);
}

function isCantripSpell(item) {
  const levelLabel = String(item?.system?.levelLabel ?? '').trim().toLowerCase();
  if (levelLabel === 'cantrip') return true;
  return Number(item?.system?.spellLevel ?? 0) === 0 && levelLabel.length === 0;
}

function getTabGroup(element) {
  return String(
    element?.dataset?.group
    ?? element?.closest?.('[data-group]')?.dataset?.group
    ?? ''
  ).trim();
}

function syncTabGroup(root, group, activeTab) {
  if (!group || !activeTab) return;

  for (const navItem of root.querySelectorAll('.sheet-tabs [data-tab]')) {
    if (getTabGroup(navItem) !== group) continue;
    navItem.classList.toggle('active', navItem.dataset.tab === activeTab);
  }

  for (const panel of root.querySelectorAll(`.sheet-body [data-group="${group}"][data-tab]`)) {
    panel.classList.toggle('active', panel.dataset.tab === activeTab);
  }
}

export class HorizonlessActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  editingDescriptionTarget = null;
  _isSavingDescription = false;

  tabGroups = {
    primary: 'features',
  };

  static get DEFAULT_OPTIONS() {
    return foundry.utils.mergeObject(
      super.DEFAULT_OPTIONS ?? {},
      {
        actions: {
          ...getDescriptionEditorActions(this),
        },
        classes: ['horizonless', 'sheet', 'actor'],
        form: {
          closeOnSubmit: false,
          submitOnChange: true,
        },
        position: {
          width: 720,
          height: 780,
        },
        window: {
          resizable: true,
        },
      },
      { inplace: false }
    );
  }

  static get PARTS() {
    return foundry.utils.mergeObject(
      super.PARTS ?? {},
      {
        sheet: {
          root: true,
          template: 'systems/horizonless/templates/actor/actor-sheet-root.hbs',
        },
      },
      { inplace: false }
    );
  }

  static get TABS() {
    return foundry.utils.mergeObject(
      super.TABS ?? {},
      {
        primary: {
          initial: 'features',
          tabs: [
            { id: 'features' },
            { id: 'ancestries' },
            { id: 'classes' },
            { id: 'trades' },
            { id: 'description' },
            { id: 'items' },
            { id: 'spells' },
            { id: 'maneuvers' },
            { id: 'effects' },
          ],
        },
      },
      { inplace: false }
    );
  }

  get template() {
    return `systems/horizonless/templates/actor/actor-${this.actor.type}-sheet.hbs`;
  }

  _syncTabState(root, group = 'primary') {
    const tabConfig = this.constructor.TABS?.[group];
    const activeTab = this.tabGroups[group] ?? tabConfig?.initial ?? tabConfig?.tabs?.[0]?.id ?? '';
    if (!activeTab) return;

    this.tabGroups[group] = activeTab;
    syncTabGroup(root, group, activeTab);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actorData = this.document.toPlainObject();

    context.actor = this.actor;
    context.config = CONFIG.HORIZONLESS_RPG;
    context.cssClass = this.options.classes.join(' ');
    context.customAttackSaveTypes = CUSTOM_ATTACK_SAVE_TYPES;
    context.damageTypeGroups = getDamageTypeSelectGroups();
    context.flags = actorData.flags;
    context.items = this.actor.items.contents.map((item) => item.toObject());
    context.sheetTemplate = this.template;
    context.system = actorData.system;
    context.guardDisplay = getGuardDisplayData(actorData.system?.guard);

    if (actorData.type === 'character') {
      this._prepareItems(context);
      this._prepareCharacterData(context);
    }

    if (actorData.type === 'npc') {
      this._prepareItems(context);
      this._prepareNpcData(context);
    }

    context.enrichedBiography = await TextEditor.enrichHTML(
      this.actor.system.biography,
      {
        async: true,
        relativeTo: this.actor,
        rollData: this.actor.getRollData(),
        secrets: this.document.isOwner,
      }
    );

    populateDescriptionEditorContext(context, this.actor, this.editingDescriptionTarget);

    context.effects = prepareActiveEffectCategories(this.actor.allApplicableEffects());
    const sheetTheme = String(
      this.actor.getFlag('horizonless', 'characterSheetTheme') ?? SheetTheme.DEFAULT
    );
    context.sheetTheme = sheetTheme === SheetTheme.EMBER ? SheetTheme.EMBER : SheetTheme.DEFAULT;
    context.isEmberTheme = context.sheetTheme === SheetTheme.EMBER;

    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    const root = this.form ?? this.element;
    if (!(root instanceof HTMLElement)) return;

    this._syncTabState(root);
    bindEventListeners(root, 'click', '.sheet-tabs [data-tab]', (event) => {
      const group = getTabGroup(event.currentTarget) || 'primary';
      const tabId = String(event.currentTarget.dataset.tab ?? '').trim();
      if (!tabId) return;

      event.preventDefault();
      this.tabGroups[group] = tabId;
      this._syncTabState(this.form ?? this.element, group);
    });

    bindEventListeners(root, 'change', '.sheet-theme-select', async (event) => {
      if (!this.actor.isOwner) return;

      const selectedTheme = String(event.currentTarget.value ?? SheetTheme.DEFAULT);
      if (selectedTheme === SheetTheme.EMBER) {
        await this.actor.setFlag('horizonless', 'characterSheetTheme', SheetTheme.EMBER);
      } else {
        await this.actor.unsetFlag('horizonless', 'characterSheetTheme');
      }

      this.render(false);
    });

    bindEventListeners(root, 'click', '.item-edit', (event) => {
      event.preventDefault();
      const itemId = event.currentTarget.closest('.item')?.dataset?.itemId;
      const item = this.actor.items.get(itemId);
      item?.sheet.render(true);
    });

    activateDescriptionEditor(this);

    if (!this.isEditable) return;

    bindEventListeners(root, 'click', '.item-create', this._onItemCreate.bind(this));
    bindEventListeners(root, 'click', '.damage-buffer-add', this._onDamageBufferAdd.bind(this));
    bindEventListeners(root, 'click', '.damage-buffer-remove', this._onDamageBufferRemove.bind(this));
    bindEventListeners(root, 'click', '.custom-resource-add', this._onCustomResourceAdd.bind(this));
    bindEventListeners(root, 'click', '.custom-resource-remove', this._onCustomResourceRemove.bind(this));
    bindEventListeners(root, 'click', '.custom-attack-add', this._onCustomAttackAdd.bind(this));
    bindEventListeners(root, 'click', '.custom-save-add', this._onCustomSaveAdd.bind(this));
    bindEventListeners(root, 'click', '.custom-attack-remove', this._onCustomAttackRemove.bind(this));
    bindEventListeners(root, 'click', '.custom-attack-roll', this._onCustomAttackRoll.bind(this));

    bindEventListeners(root, 'click', '.item-delete', async (event) => {
      event.preventDefault();
      const listItem = event.currentTarget.closest('.item');
      const item = this.actor.items.get(listItem?.dataset?.itemId);
      if (!item) return;

      const isInheritorFeature = item.type === ItemType.FEATURE
        && this._getFeatureAncestryType(item) === AncestryFeatureType.INHERITOR;
      await item.delete();
      if (isInheritorFeature) {
        await this._syncTrackedInheritorFeatureId(item.id, { remove: true });
      }
      this.render(false);
    });

    bindEventListeners(root, 'click', '.ancestry-slot-clear', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!this.actor.isOwner) return;

      const slotKey = String(event.currentTarget.dataset.slot ?? '').trim();
      const slotConfig = ANCESTRY_SLOT_CONFIG[slotKey];
      if (!slotConfig) return;

      await this.actor.update({ [`system.ancestries.${slotConfig.field}`]: '' });
      this.render(false);
    });

    bindEventListeners(root, 'change', '.armor-worn-toggle', async (event) => {
      const listItem = event.currentTarget.closest('.item');
      const item = this.actor.items.get(listItem?.dataset?.itemId);
      if (!item || item.type !== ItemType.ARMOR) return;
      if (event.currentTarget.checked) {
        const failure = getArmorStrengthRequirementFailure(item, this.actor);
        if (failure) {
          event.currentTarget.checked = false;
          ui.notifications?.warn(failure.message);
          return;
        }
      }
      await item.update({ 'system.worn': event.currentTarget.checked });
    });

    bindEventListeners(root, 'change', '.weapon-light-attack-toggle', async (event) => {
      const listItem = event.currentTarget.closest('.item');
      const item = this.actor.items.get(listItem?.dataset?.itemId);
      if (!item || item.type !== ItemType.WEAPON) return;
      await item.update({ 'system.lightAttack': event.currentTarget.checked });
    });

    bindEventListeners(root, 'click', '.guard-toggle', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      await this._submitPendingChanges();

      const currentGuardMode = String(this.actor.system?.guard ?? GuardMode.NO_GUARD);
      const nextGuardMode = getNextGuardMode(currentGuardMode);
      const updateData = { 'system.guard': nextGuardMode };

      if (this.actor.type === 'npc') {
        const tierBonus = Math.max(0, Math.floor(Number(this.actor.system?.tierBonus ?? 0)));
        const currentArmorClass = Math.max(0, Math.floor(Number(this.actor.system?.armorClass ?? 0)));
        const nextArmorClass = currentArmorClass
          - getGuardArmorBonus(currentGuardMode, tierBonus)
          + getGuardArmorBonus(nextGuardMode, tierBonus);
        updateData['system.armorClass'] = Math.max(0, nextArmorClass);
      }

      await this.actor.update(updateData);
      this.render(false);
    });

    bindEventListeners(root, 'change', '.spell-prepared-toggle', async (event) => {
      const listItem = event.currentTarget.closest('.item');
      const item = this.actor.items.get(listItem?.dataset?.itemId);
      if (!item || item.type !== ItemType.SPELL) return;
      await item.update({ 'system.prepared': event.currentTarget.checked });
    });

    bindEventListeners(root, 'change', '.spell-heighten-select', async (event) => {
      const listItem = event.currentTarget.closest('.item');
      const item = this.actor.items.get(listItem?.dataset?.itemId);
      if (!item || item.type !== ItemType.SPELL) return;

      const baseCircle = Number(item.system?.spellLevel ?? 0);
      const selected = Number(event.currentTarget.value);
      const maxHeighten = Math.max(baseCircle, 6);
      const heightenedCircle = Math.max(baseCircle, Math.min(maxHeighten, selected));

      await item.update({ 'system.heightenedCircle': heightenedCircle });
    });

    bindEventListeners(root, 'dragstart', '.spell-drag-handle', (event) => {
      const itemId = event.currentTarget.dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (!item || item.type !== ItemType.SPELL) return;
      if (!item.system?.prepared) {
        event.preventDefault();
        ui.notifications?.warn('Only prepared spells can be dragged to Signature Spell.');
        return;
      }
      const dragData = item.toDragData?.() ?? { type: 'Item', uuid: item.uuid };
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer) return;
      dataTransfer.setData('text/plain', JSON.stringify(dragData));
      dataTransfer.effectAllowed = 'move';
    });

    bindEventListeners(root, 'dragstart', '.spell-signature-source', (event) => {
      const listItem = event.currentTarget.closest('.item');
      const item = this.actor.items.get(listItem?.dataset?.itemId);
      if (!item || item.type !== ItemType.SPELL) return;
      if (!item.system?.prepared) {
        event.preventDefault();
      }
    });

    bindEventListeners(root, 'click', '.effect-control', (event) => {
      const row = event.currentTarget.closest('li');
      const document =
        row?.dataset?.parentId === this.actor.id
          ? this.actor
          : this.actor.items.get(row?.dataset?.parentId);
      onManageActiveEffect(event, document);
    });

    bindEventListeners(root, 'click', '.ability-save', this._onAbilitySaveRoll.bind(this));
    bindEventListeners(root, 'click', '.rollable', this._onRoll.bind(this));
    bindEventListeners(root, 'click', '.trade-check', this._onTradeCheck.bind(this));
    bindEventListeners(root, 'click', '.trade-task-check', this._onTradeTaskCheck.bind(this));
    bindEventListeners(root, 'click', '.task-add', this._onTradeTaskAdd.bind(this));
    bindEventListeners(root, 'click', '.task-delete', this._onTradeTaskDelete.bind(this));

    if (this.actor.isOwner) {
      const handler = (event) => this._onDragStart(event);
      for (const listItem of root.querySelectorAll('li.item')) {
        if (listItem.classList.contains('inventory-header')) continue;
        listItem.setAttribute('draggable', 'true');
        listItem.addEventListener('dragstart', handler, false);
      }
    }
  }

  static _onEditDescription(event, target) {
    startDescriptionEditing(this, target);
  }

  async _onDescriptionEditorSave(event) {
    await saveDescriptionEditorContent(this, event);
  }

  async _submitPendingChanges() {
    if (!(this.form instanceof HTMLFormElement) || !this.isEditable) return;
    await this.submit();
  }

  async _preClose(options) {
    await this._submitPendingChanges();
    await super._preClose(options);
  }

  _prepareCharacterData(context) {
    context.customResources = normalizeCustomResources(context.system?.customResources);
  }

  _prepareNpcData(context) {
    context.customAttacks = normalizeCustomAttacks(context.system?.customAttacks);
  }

  _prepareItems(context) {
    const gear = [];
    const curios = [];
    const features = [];
    const classFeatures = [];
    const maneuvers = [];
    const spellBuckets = new Map([
      ['cantrip', []],
      [1, []],
      [2, []],
      [3, []],
      [4, []],
      [5, []],
      [6, []],
      [7, []],
    ]);
    const ancestryFeaturesByType = {
      [AncestryFeatureType.PRIMARY]: [],
      [AncestryFeatureType.SECONDARY]: [],
      [AncestryFeatureType.TERTIARY]: [],
      [AncestryFeatureType.INHERITOR]: [],
    };

    for (const item of context.items) {
      item.img = item.img || Item.DEFAULT_ICON;
      if (GearItemType.includes(item.type)) {
        gear.push(item);
        if (item.type === ItemType.CURIO) curios.push(item);
      }
      else if (item.type === ItemType.FEATURE) {
        const ancestryType = this._getFeatureAncestryType(item);
        if (Object.prototype.hasOwnProperty.call(ancestryFeaturesByType, ancestryType)) {
          ancestryFeaturesByType[ancestryType].push(item);
        } else {
          features.push(item);
        }
      }
      else if (item.type === ItemType.CLASS_FEATURE) {
        classFeatures.push(item);
      }
      else if (item.type === ItemType.SPELL) {
        const cantrip = isCantripSpell(item);
        const circle = Number(item.system.spellLevel);
        if (Number.isInteger(circle) && circle >= 0 && circle <= 7) {
          const minHeighten = circle;
          const maxHeighten = Math.max(minHeighten, 6);
          const currentHeighten = Number(item.system.heightenedCircle ?? minHeighten);
          item.system.heightenedCircle = Math.max(minHeighten, Math.min(maxHeighten, currentHeighten));
          item.heightenOptions = Array.from(
            { length: (maxHeighten - minHeighten) + 1 },
            (_, index) => minHeighten + index
          );
          if (cantrip) {
            spellBuckets.get('cantrip')?.push(item);
          } else {
            spellBuckets.get(circle)?.push(item);
          }
        }
      }
      else if (item.type === ItemType.MANEUVER) {
        maneuvers.push(item);
      }
    }

    context.gear = gear;
    context.curios = curios;
    context.features = features;
    context.classFeatures = classFeatures.sort((a, b) => {
      const rankA = Number(a.system?.rank ?? 0);
      const rankB = Number(b.system?.rank ?? 0);
      if (rankA !== rankB) return rankA - rankB;
      return String(a.name ?? '').localeCompare(String(b.name ?? ''));
    });
    context.spells = Array.from(spellBuckets, ([spellCircle, spells]) => ({ spellCircle, spells }));
    context.maneuvers = maneuvers;
    context.signatureSpell = null;
    context.ancestrySlots = {};
    context.inheritorFeatures = ancestryFeaturesByType[AncestryFeatureType.INHERITOR];

    const signatureSpellId = context.system?.signatureSpellId;
    if (signatureSpellId) {
      context.signatureSpell =
        context.items.find((item) => item.type === ItemType.SPELL && item._id === signatureSpellId) ?? null;
    }

    const ancestryState = context.system?.ancestries ?? {};
    for (const [slotKey, slotConfig] of Object.entries(ANCESTRY_SLOT_CONFIG)) {
      const slotItemId = String(ancestryState?.[slotConfig.field] ?? '').trim();
      context.ancestrySlots[slotKey] = {
        label: slotConfig.label,
        featureType: slotConfig.featureType,
        item: slotItemId
          ? (context.items.find((item) => item.type === ItemType.FEATURE && item._id === slotItemId) ?? null)
          : null,
      };
    }
  }

  _createEmptyDamageBuffer() {
    return createEmptyDamageBuffer();
  }

  async _onDamageBufferAdd(event) {
    event.preventDefault();
    event.stopPropagation();
    if (this._damageBufferMutationInFlight) return;
    this._damageBufferMutationInFlight = true;

    try {
      await this._submitPendingChanges();

      const damageBuffers = normalizeDamageBufferList(
        Array.isArray(this.actor.system?.damageBuffers)
          ? foundry.utils.deepClone(this.actor.system.damageBuffers)
          : []
      );
      damageBuffers.push(this._createEmptyDamageBuffer());

      await this.actor.update({ 'system.damageBuffers': damageBuffers });
      this.render(false);
    } finally {
      this._damageBufferMutationInFlight = false;
    }
  }

  async _onDamageBufferRemove(event) {
    event.preventDefault();
    event.stopPropagation();
    if (this._damageBufferMutationInFlight) return;
    this._damageBufferMutationInFlight = true;

    try {
      const damageBufferIndex = Number(event.currentTarget.dataset.index ?? -1);
      if (!Number.isInteger(damageBufferIndex) || damageBufferIndex < 0) return;

      await this._submitPendingChanges();

      const damageBuffers = normalizeDamageBufferList(
        Array.isArray(this.actor.system?.damageBuffers)
          ? foundry.utils.deepClone(this.actor.system.damageBuffers)
          : []
      );
      if (damageBufferIndex >= damageBuffers.length) return;
      damageBuffers.splice(damageBufferIndex, 1);

      await this.actor.update({ 'system.damageBuffers': damageBuffers });
      this.render(false);
    } finally {
      this._damageBufferMutationInFlight = false;
    }
  }

  async _onCustomResourceAdd(event) {
    event.preventDefault();
    event.stopPropagation();
    if (this.actor.type !== 'character') return;
    if (this._customResourceMutationInFlight) return;
    this._customResourceMutationInFlight = true;

    try {
      await this._submitPendingChanges();

      const customResources = normalizeCustomResources(
        foundry.utils.deepClone(this.actor.system?.customResources ?? [])
      );
      customResources.push(createEmptyCustomResource());

      await this.actor.update({ 'system.customResources': customResources });
      this.render(false);
    } finally {
      this._customResourceMutationInFlight = false;
    }
  }

  async _onCustomResourceRemove(event) {
    event.preventDefault();
    event.stopPropagation();
    if (this.actor.type !== 'character') return;
    if (this._customResourceMutationInFlight) return;
    this._customResourceMutationInFlight = true;

    try {
      const resourceIndex = Number(event.currentTarget.dataset.index ?? -1);
      if (!Number.isInteger(resourceIndex) || resourceIndex < 0) return;

      await this._submitPendingChanges();

      const customResources = normalizeCustomResources(
        foundry.utils.deepClone(this.actor.system?.customResources ?? [])
      );
      if (resourceIndex >= customResources.length) return;

      customResources.splice(resourceIndex, 1);
      await this.actor.update({ 'system.customResources': customResources });
      this.render(false);
    } finally {
      this._customResourceMutationInFlight = false;
    }
  }

  _getCustomAttackEntries() {
    return normalizeCustomAttacks(
      foundry.utils.deepClone(this.actor.system?.customAttacks ?? [])
    );
  }

  async _onCustomAttackAdd(event) {
    event.preventDefault();
    event.stopPropagation();
    if (this.actor.type !== 'npc') return;
    if (this._customAttackMutationInFlight) return;
    this._customAttackMutationInFlight = true;

    try {
      await this._submitPendingChanges();

      const customAttacks = this._getCustomAttackEntries();
      customAttacks.push(createEmptyCustomAttack(CUSTOM_ATTACK_KIND.ATTACK));

      await this.actor.update({ 'system.customAttacks': customAttacks });
      this.render(false);
    } finally {
      this._customAttackMutationInFlight = false;
    }
  }

  async _onCustomSaveAdd(event) {
    event.preventDefault();
    event.stopPropagation();
    if (this.actor.type !== 'npc') return;
    if (this._customAttackMutationInFlight) return;
    this._customAttackMutationInFlight = true;

    try {
      await this._submitPendingChanges();

      const customAttacks = this._getCustomAttackEntries();
      customAttacks.push(createEmptyCustomAttack(CUSTOM_ATTACK_KIND.SAVE));

      await this.actor.update({ 'system.customAttacks': customAttacks });
      this.render(false);
    } finally {
      this._customAttackMutationInFlight = false;
    }
  }

  async _onCustomAttackRemove(event) {
    event.preventDefault();
    event.stopPropagation();
    if (this.actor.type !== 'npc') return;
    if (this._customAttackMutationInFlight) return;
    this._customAttackMutationInFlight = true;

    try {
      const attackIndex = Number(event.currentTarget.dataset.index ?? -1);
      if (!Number.isInteger(attackIndex) || attackIndex < 0) return;

      await this._submitPendingChanges();

      const customAttacks = this._getCustomAttackEntries();
      if (attackIndex >= customAttacks.length) return;

      customAttacks.splice(attackIndex, 1);
      await this.actor.update({ 'system.customAttacks': customAttacks });
      this.render(false);
    } finally {
      this._customAttackMutationInFlight = false;
    }
  }

  _getCustomAttackDamageButtonData(entry, targetTokenUuids = []) {
    const damageFormula = String(entry?.damage ?? '').trim();
    const actorUuid = String(this.actor?.uuid ?? '').trim();
    if (!actorUuid || !damageFormula) return null;

    return {
      actorUuid,
      itemUuid: '',
      damageFormula,
      itemName: String(entry?.name ?? '').trim() || 'Custom Attack',
      damageLabel: damageFormula,
      buttonLabel: 'Roll Damage',
      damageType: String(entry?.damageType ?? '').trim(),
      injuring: false,
      targetTokenUuids: JSON.stringify(
        targetTokenUuids
          .map((uuid) => String(uuid ?? '').trim())
          .filter((uuid) => uuid.length > 0)
      ),
    };
  }

  async _renderCustomAttackDamageButton(entry, targetTokenUuids = []) {
    const data = this._getCustomAttackDamageButtonData(entry, targetTokenUuids);
    if (!data) return '';
    return renderTemplate(CUSTOM_ATTACK_MESSAGE_TEMPLATES.spellDamageRollButton, data);
  }

  async _rollCustomSavingThrowForToken(token, { abilityKey, dc }) {
    const actor = token?.actor;
    if (!actor) return null;
    if (!Object.prototype.hasOwnProperty.call(CONFIG.HORIZONLESS_RPG.abilities, abilityKey)) return null;

    const abilityMod = Number(actor.system?.abilities?.[abilityKey]?.mod ?? 0);
    const tierBonus = Number(actor.system?.tierBonus ?? 0);
    const isHeroic = Boolean(actor.system?.abilities?.[abilityKey]?.saveHeroic);
    const tierContribution = isHeroic ? tierBonus : Math.floor(tierBonus / 2);
    const roll = new Roll(`1d20 + ${abilityMod} + ${tierContribution}`, actor.getRollData());
    await roll.evaluate();

    const normalizedDc = Number(dc);
    const hasSpellDc = Number.isFinite(normalizedDc);
    const savedAgainstSpell = hasSpellDc ? Number(roll.total ?? 0) >= normalizedDc : false;

    return {
      tokenName: String(token.name ?? actor.name ?? 'Target').trim() || 'Target',
      total: Number(roll.total ?? 0),
      formula: roll.formula,
      flavorPrefix: isHeroic ? '[heroic save]' : '[save]',
      isHeroic,
      dieTotal: Number(roll.terms?.[0]?.total ?? 0),
      hasSpellDc,
      spellDc: hasSpellDc ? normalizedDc : null,
      resultLabel: hasSpellDc
        ? (savedAgainstSpell ? 'Spell saved against' : 'Spell succeeded!')
        : '',
      savedAgainstSpell,
    };
  }

  async _rollNpcCustomAttack(entry) {
    const selectedTokens = getTargetedTokens();
    const attackName = String(entry?.name ?? '').trim() || 'Custom Attack';
    if (selectedTokens.length === 0) {
      ui.notifications?.warn(`Target at least one token to roll ${attackName}.`);
      return null;
    }

    const attackBonus = String(entry?.toHitBonus ?? '').trim();
    const attackFormula = attackBonus ? `1d20 + (${attackBonus})` : '1d20';
    let roll;
    try {
      roll = new Roll(attackFormula, this.actor.getRollData());
      await roll.evaluate();
    } catch (_error) {
      ui.notifications?.warn(`Enter a valid to-hit bonus for ${attackName}.`);
      return null;
    }

    const attackTotal = Number(roll.total ?? 0);
    const targetTokenUuids = selectedTokens.map((token) => token?.document?.uuid ?? '');
    const targetResults = selectedTokens.map((token) => {
      const targetActor = token.actor;
      const ac = Number(targetActor?.system?.armorClass);
      const hasAc = Number.isFinite(ac);
      const isHit = hasAc && Number.isFinite(attackTotal) && attackTotal >= ac;

      return {
        targetName: String(token.name ?? targetActor?.name ?? 'Target').trim() || 'Target',
        resultText: isHit ? 'Hit' : 'Miss',
        resultType: isHit ? 'hit' : 'miss',
        hasAc,
        ac,
      };
    });
    const damageButtonHtml = await this._renderCustomAttackDamageButton(entry, targetTokenUuids);
    const flavor = await renderTemplate(CUSTOM_ATTACK_MESSAGE_TEMPLATES.weaponAttackFlavor, {
      label: `[npc attack] ${attackName}`,
      hasTargets: targetResults.length > 0,
      targets: targetResults,
      damageButtonHtml,
      dischargeDamageButtonHtml: '',
    });

    HorizonlessSpellItem.registerHooks();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      rollMode: game.settings.get('core', 'rollMode'),
      flavor,
      flags: {
        horizonless: {
          spellChat: true,
        },
      },
    });

    return roll;
  }

  async _rollNpcCustomSave(entry) {
    const saveName = String(entry?.name ?? '').trim() || 'Custom Saving Throw';
    const saveType = normalizeCustomAttackSaveType(entry?.saveType);
    const abilityKey = CUSTOM_ATTACK_SAVE_ABILITY_MAP[saveType] ?? null;
    if (!abilityKey) {
      ui.notifications?.warn(`Select a valid save type for ${saveName}.`);
      return null;
    }

    const dc = Number(String(entry?.dc ?? '').trim());
    if (!Number.isFinite(dc)) {
      ui.notifications?.warn(`Enter a valid DC for ${saveName}.`);
      return null;
    }

    const selectedTokens = getTargetedTokens();
    if (selectedTokens.length === 0) {
      ui.notifications?.warn(`Target at least one token to roll ${saveType} saves.`);
      return null;
    }

    const results = [];
    for (const token of selectedTokens) {
      const result = await this._rollCustomSavingThrowForToken(token, { abilityKey, dc });
      if (result) results.push(result);
    }
    if (results.length === 0) return null;

    const targetTokenUuids = selectedTokens.map((token) => token?.document?.uuid ?? '');
    const damageButtonHtml = await this._renderCustomAttackDamageButton(entry, targetTokenUuids);
    const content = await renderTemplate(CUSTOM_ATTACK_MESSAGE_TEMPLATES.spellSaveResults, {
      saveLabel: saveType,
      hasSpellDc: true,
      spellDc: dc,
      results,
      hasDamageButton: Boolean(damageButtonHtml),
      damageButtonHtml,
    });

    HorizonlessSpellItem.registerHooks();
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      rollMode: game.settings.get('core', 'rollMode'),
      flavor: `[npc save] ${saveName} Saving Throws`,
      content,
      flags: {
        horizonless: {
          spellChat: true,
          spellSaveResults: true,
        },
      },
    });

    return results;
  }

  async _onCustomAttackRoll(event) {
    event.preventDefault();
    event.stopPropagation();
    if (this.actor.type !== 'npc') return null;

    const attackIndex = Number(event.currentTarget.dataset.index ?? -1);
    if (!Number.isInteger(attackIndex) || attackIndex < 0) return null;

    await this._submitPendingChanges();

    const customAttacks = this._getCustomAttackEntries();
    const entry = customAttacks[attackIndex];
    if (!entry) return null;

    if (entry.kind === CUSTOM_ATTACK_KIND.SAVE) {
      return this._rollNpcCustomSave(entry);
    }

    return this._rollNpcCustomAttack(entry);
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type;
    const data = foundry.utils.deepClone(header.dataset);
    if (type === ItemType.SPELL && data.spellLevel === 'cantrip') {
      data.spellLevel = 0;
      data.levelLabel = 'Cantrip';
      data.heightenedCircle = 0;
    }
    const itemTypeName = type ? `${type.charAt(0).toUpperCase()}${type.slice(1)}` : 'Item';
    const itemData = {
      name: `New ${itemTypeName}`,
      type,
      system: data,
    };
    delete itemData.system.type;

    return Item.create(itemData, { parent: this.actor });
  }

  async _onTradeTaskAdd(event) {
    event.preventDefault();
    event.stopPropagation();
    if (this._tradeTaskMutationInFlight) return;
    this._tradeTaskMutationInFlight = true;

    try {
      const button = event.currentTarget;
      const tradeType = String(button.dataset.tradeType ?? '');
      const tradeIndex = Number(button.dataset.tradeIndex ?? -1);
      if (!TradeTypes.includes(tradeType)) return;
      if (!Number.isInteger(tradeIndex) || tradeIndex < 0) return;

      await this._submitPendingChanges();

      const trades = foundry.utils.deepClone(this.actor.system?.trades ?? {});
      const trade = trades?.[tradeType]?.[tradeIndex];
      if (!trade) return;
      if (!Array.isArray(trade.tasks)) trade.tasks = [];

      trade.tasks.push({ name: '', description: '' });
      await this.actor.update({ 'system.trades': trades });
      this.render(false);
    } finally {
      this._tradeTaskMutationInFlight = false;
    }
  }

  async _onTradeTaskDelete(event) {
    event.preventDefault();
    event.stopPropagation();
    if (this._tradeTaskMutationInFlight) return;
    this._tradeTaskMutationInFlight = true;

    try {
      const button = event.currentTarget;
      const tradeType = String(button.dataset.tradeType ?? '');
      const tradeIndex = Number(button.dataset.tradeIndex ?? -1);
      const taskIndex = Number(button.dataset.taskIndex ?? -1);
      if (!TradeTypes.includes(tradeType)) return;
      if (!Number.isInteger(tradeIndex) || tradeIndex < 0) return;
      if (!Number.isInteger(taskIndex) || taskIndex < 0) return;

      await this._submitPendingChanges();

      const trades = foundry.utils.deepClone(this.actor.system?.trades ?? {});
      const trade = trades?.[tradeType]?.[tradeIndex];
      if (!trade || !Array.isArray(trade.tasks)) return;
      if (taskIndex >= trade.tasks.length) return;

      trade.tasks.splice(taskIndex, 1);
      await this.actor.update({ 'system.trades': trades });
      this.render(false);
    } finally {
      this._tradeTaskMutationInFlight = false;
    }
  }

  _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    if (dataset.rollType && dataset.rollType === 'item') {
      const itemId = element.closest('.item')?.dataset?.itemId;
      const item = this.actor.items.get(itemId);
      if (item?.type === ItemType.SPELL) return item.roll({ sourceApplication: this });
      if (item) return item.roll();
    }

    if (dataset.roll) {
      const label = dataset.label ? `[ability] ${dataset.label}` : '';
      const roll = new Roll(dataset.roll, this.actor.getRollData());
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: label,
        rollMode: game.settings.get('core', 'rollMode'),
      });
      return roll;
    }

    return null;
  }

  async _onAbilitySaveRoll(event) {
    event.preventDefault();
    event.stopPropagation();

    const element = event.currentTarget;
    const abilityKey = String(element.dataset.abilityKey ?? '').trim();
    const label = String(element.dataset.label ?? '').trim();

    await this._submitPendingChanges();

    if (!abilityKey) return null;
    if (!Object.prototype.hasOwnProperty.call(CONFIG.HORIZONLESS_RPG.abilities, abilityKey)) return null;

    const abilityMod = Number(this.actor.system?.abilities?.[abilityKey]?.mod ?? 0);
    const tierBonus = Number(this.actor.system?.tierBonus ?? 0);
    const isHeroic = Boolean(this.actor.system?.abilities?.[abilityKey]?.saveHeroic);
    const tierContribution = isHeroic ? tierBonus : Math.floor(tierBonus / 2);
    const formula = `1d20 + ${abilityMod} + ${tierContribution}`;
    const resolvedLabel = label || `${this._getTradeAbilityLabel(abilityKey)} Save`;
    const flavorPrefix = isHeroic ? '[heroic save]' : '[save]';

    const roll = new Roll(formula);
    roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${flavorPrefix} ${resolvedLabel}`,
      rollMode: game.settings.get('core', 'rollMode'),
    });

    return roll;
  }

  async _onTradeCheck(event) {
    await this._rollTradeCheck(event, { includeTask: false });
  }

  async _onTradeTaskCheck(event) {
    await this._rollTradeCheck(event, { includeTask: true });
  }

  _getTradeAbilityKey(ability) {
    const key = String(ability ?? '').trim();
    if (!key) return null;
    return Object.prototype.hasOwnProperty.call(CONFIG.HORIZONLESS_RPG.abilities, key) ? key : null;
  }

  _getTradeAbilityLabel(abilityKey) {
    if (!abilityKey) return 'Unknown Ability';
    const abilityPath = CONFIG.HORIZONLESS_RPG.abilities?.[abilityKey];
    return game.i18n.localize(abilityPath) ?? abilityKey.toUpperCase();
  }

  _getTradeSpecializationLabel(specialization) {
    return CONFIG.HORIZONLESS_RPG.tradeSpecializations?.[specialization] ?? 'Unspecified';
  }

  _composeTradeRollFlavor({ tradeName, specializationLabel, abilityLabel, taskName, taskDescription }) {
    if (taskName !== null) {
      const descriptionLine = taskDescription ? `<br>${taskDescription}` : '';
      return `[trade task] ${tradeName} - ${taskName}${descriptionLine}<br><small>${specializationLabel} (${abilityLabel})</small>`;
    }

    return `[trade] ${tradeName}<br><small>${specializationLabel} (${abilityLabel})</small>`;
  }

  async _rollTradeCheck(event, { includeTask }) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    const tradeType = String(button.dataset.tradeType ?? '');
    const tradeIndex = Number(button.dataset.tradeIndex ?? -1);
    const taskIndex = Number(button.dataset.taskIndex ?? -1);

    await this._submitPendingChanges();

    if (!TradeTypes.includes(tradeType)) return null;
    if (!Number.isInteger(tradeIndex) || tradeIndex < 0) return null;

    const trades = this.actor.system?.trades ?? {};
    const trade = trades?.[tradeType]?.[tradeIndex];
    if (!trade) return null;

    const abilityKey = this._getTradeAbilityKey(trade.ability);
    if (!abilityKey) {
      ui.notifications?.warn('Select an ability before rolling a trade check.');
      return null;
    }

    const abilityMod = Number(this.actor.system?.abilities?.[abilityKey]?.mod ?? 0);
    const tierBonus = Number(this.actor.system?.tierBonus ?? 0);
    const tierContribution = includeTask ? tierBonus : Math.floor(tierBonus / 2);
    const formula = `1d20 + ${abilityMod} + ${tierContribution}`;
    const roll = new Roll(formula);

    const tradeName = String(trade.name ?? '').trim() || 'Trade Check';
    const specializationLabel = this._getTradeSpecializationLabel(trade.specialization);
    const abilityLabel = this._getTradeAbilityLabel(abilityKey);

    let taskName = null;
    let taskDescription = '';
    if (includeTask) {
      const task = Array.isArray(trade.tasks) ? trade.tasks[taskIndex] : null;
      if (!task) return null;
      taskName = String(task.name ?? '').trim() || 'Task';
      taskDescription = String(task.description ?? '').trim();
    }

    roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: this._composeTradeRollFlavor({
        tradeName,
        specializationLabel,
        abilityLabel,
        taskName,
        taskDescription
      }),
      rollMode: game.settings.get('core', 'rollMode'),
    });

    return roll;
  }

  async _onDrop(event) {
    if (await this._handleAncestryFeatureDrop(event)) return false;

    const dropTarget = event.target?.closest?.('.signature-spell-dropzone');
    if (!dropTarget) return super._onDrop(event);

    event.preventDefault();
    event.stopPropagation();

    const spell = await this._getDroppedOwnedSpell(event);
    if (!spell) {
      ui.notifications?.warn('Only spells already on this character can be set as signature spells.');
      return false;
    }

    if (!spell.system?.prepared) {
      ui.notifications?.warn('Only prepared spells can be set as signature spells.');
      return false;
    }

    await this.actor.update({ 'system.signatureSpellId': spell.id });
    this.render(false);
    return false;
  }

  _getFeatureAncestryType(feature) {
    if (!feature) return '';
    return String(feature.system?.ancestryFeatureType ?? '').trim();
  }

  _getFeatureAncestryName(feature) {
    if (!feature) return '';
    return String(feature.system?.ancestry ?? '').trim();
  }

  _getTrackedInheritorFeatureIds() {
    const rawIds = this.actor.system?.ancestries?.inheritorFeatureIds;
    if (!Array.isArray(rawIds)) return [];

    return [...new Set(rawIds.map((value) => String(value ?? '').trim()).filter(Boolean))];
  }

  async _syncTrackedInheritorFeatureId(featureId, { remove = false } = {}) {
    const normalizedFeatureId = String(featureId ?? '').trim();
    if (!normalizedFeatureId) return false;

    const currentIds = this._getTrackedInheritorFeatureIds();
    const nextIds = [...currentIds];
    const existingIndex = nextIds.indexOf(normalizedFeatureId);

    if (remove) {
      if (existingIndex === -1) return false;
      nextIds.splice(existingIndex, 1);
    } else if (existingIndex === -1) {
      nextIds.push(normalizedFeatureId);
    } else {
      return false;
    }

    await this.actor.update({ 'system.ancestries.inheritorFeatureIds': nextIds });
    return true;
  }

  async _findCompendiumInheritorFeatureByAncestry(ancestryName) {
    const normalizedAncestry = normalizeAncestryName(ancestryName);
    if (!normalizedAncestry) return null;

    const ancestryPack = game.packs?.get(ANCESTRY_FEATURE_PACK_ID);
    if (!ancestryPack) return null;

    const index = await ancestryPack.getIndex({
      fields: ['system.ancestryFeatureType', 'system.ancestry', 'system.normalizedAncestry'],
    });

    const matchingEntry = index.find((entry) => {
      const entryFeatureType = String(entry.system?.ancestryFeatureType ?? '').trim();
      if (entryFeatureType !== AncestryFeatureType.INHERITOR) return false;

      const entryAncestry = normalizeAncestryName(
        entry.system?.normalizedAncestry ?? entry.system?.ancestry
      );
      return entryAncestry === normalizedAncestry;
    });
    if (!matchingEntry?._id) return null;

    return ancestryPack.getDocument(matchingEntry._id);
  }

  async _ensureInheritorFeatureForAncestry(sourceFeature) {
    const ancestryName = this._getFeatureAncestryName(sourceFeature);
    const normalizedAncestry = normalizeAncestryName(ancestryName);
    if (!normalizedAncestry) return null;

    const existingInheritor = this.actor.items.find((item) => {
      if (item.type !== ItemType.FEATURE) return false;
      if (this._getFeatureAncestryType(item) !== AncestryFeatureType.INHERITOR) return false;
      return normalizeAncestryName(this._getFeatureAncestryName(item)) === normalizedAncestry;
    });
    if (existingInheritor) return existingInheritor;

    const compendiumFeature = await this._findCompendiumInheritorFeatureByAncestry(ancestryName);
    if (!compendiumFeature) return null;

    return this._getDroppedFeatureForActor(null, {
      requireAncestryType: true,
      droppedItem: compendiumFeature,
    });
  }

  async _handleAncestryFeatureDrop(event) {
    const dropTarget = event.target;
    const ancestryTarget = dropTarget?.closest?.('.ancestry-slot-dropzone')
      ?? dropTarget?.closest?.('.inheritor-features-dropzone')
      ?? dropTarget?.closest?.('.tab.ancestries')
      ?? dropTarget?.closest?.('.sheet-tabs .item[data-tab="ancestries"]');
    if (!ancestryTarget) return false;

    const dropData = TextEditor.getDragEventData(event);
    if (!dropData) return false;

    let droppedItem = null;
    try {
      droppedItem = await Item.fromDropData(dropData);
    } catch (_err) {
      return false;
    }

    if (!droppedItem || droppedItem.type !== ItemType.FEATURE) return false;
    const droppedFeatureType = this._getFeatureAncestryType(droppedItem);
    if (!droppedFeatureType) return false;

    event.preventDefault();
    event.stopPropagation();

    const feature = await this._getDroppedFeatureForActor(event, {
      requireAncestryType: true,
      droppedItem,
    });
    if (!feature) {
      ui.notifications?.warn('Drop an ancestry feature item from the Ancestry Features compendium.');
      return true;
    }

    const featureType = this._getFeatureAncestryType(feature);
    const slotConfig = ANCESTRY_SLOT_CONFIG[featureType];

    if (slotConfig) {
      const updates = {};
      const currentFeatureId = String(this.actor.system?.ancestries?.[slotConfig.field] ?? '').trim();
      if (currentFeatureId !== feature.id) {
        updates[`system.ancestries.${slotConfig.field}`] = feature.id;
      }

      const inheritorFeature = await this._ensureInheritorFeatureForAncestry(feature);
      if (inheritorFeature?.id) {
        const trackedIds = this._getTrackedInheritorFeatureIds();
        if (!trackedIds.includes(inheritorFeature.id)) {
          updates['system.ancestries.inheritorFeatureIds'] = [...trackedIds, inheritorFeature.id];
        }
      }

      if (Object.keys(updates).length > 0) {
        await this.actor.update(updates);
      }
      this.render(false);
      return true;
    }

    if (featureType === AncestryFeatureType.INHERITOR) {
      await this._syncTrackedInheritorFeatureId(feature.id);
      this.render(false);
      return true;
    }

    ui.notifications?.warn('Only ancestry features can be dropped on the Ancestries tab.');
    return true;
  }

  _getDraggedSpellId(event) {
    const dataTransfer = event?.dataTransfer;
    if (!dataTransfer) return null;

    const raw = dataTransfer.getData('text/plain');
    if (!raw) return null;

    try {
      const data = JSON.parse(raw);
      if (data?.type === 'Item') {
        if (data?.uuid) {
          const match = String(data.uuid).match(/Item\.([^.\s]+)/);
          if (match?.[1]) return match[1];
        }
        if (data?.data?._id) return data.data._id;
        if (data?._id) return data._id;
      }
    } catch (_err) {
      return null;
    }

    return null;
  }

  async _getDroppedOwnedSpell(event) {
    const spellId = this._getDraggedSpellId(event);
    if (spellId) {
      const ownedSpell = this.actor.items.get(spellId);
      if (ownedSpell?.type === ItemType.SPELL) return ownedSpell;
    }

    const dropData = TextEditor.getDragEventData(event);
    if (!dropData) return null;

    let droppedItem = null;
    try {
      droppedItem = await Item.fromDropData(dropData);
    } catch (_err) {
      return null;
    }
    if (!droppedItem || droppedItem.type !== ItemType.SPELL) return null;
    if (droppedItem.parent?.id !== this.actor.id) return null;

    return this.actor.items.get(droppedItem.id) ?? droppedItem;
  }

  async _getDroppedFeatureForActor(event, { requireAncestryType = false, droppedItem = null } = {}) {
    let candidate = droppedItem;
    if (!candidate) {
      const dropData = TextEditor.getDragEventData(event);
      if (!dropData) return null;

      try {
        candidate = await Item.fromDropData(dropData);
      } catch (_err) {
        return null;
      }
    }

    if (!candidate || candidate.type !== ItemType.FEATURE) return null;
    if (requireAncestryType && !this._getFeatureAncestryType(candidate)) return null;

    if (candidate.parent?.id === this.actor.id) {
      return this.actor.items.get(candidate.id) ?? candidate;
    }

    const sourceId = String(candidate.uuid ?? '').trim();
    if (sourceId) {
      const existingItem = this.actor.items.find(
        (item) => item.type === ItemType.FEATURE && String(item.flags?.core?.sourceId ?? '') === sourceId
      );
      if (existingItem) return existingItem;
    }

    const itemData = candidate.toObject();
    delete itemData._id;
    itemData.system ??= {};
    itemData.system.ancestryFeatureType ??= String(candidate.flags?.horizonless?.ancestryFeatureType ?? '').trim();
    itemData.system.ancestry ??= String(candidate.flags?.horizonless?.ancestry ?? '').trim();
    itemData.flags = foundry.utils.mergeObject(itemData.flags ?? {}, {
      core: { sourceId }
    });

    const [createdItem] = await this.actor.createEmbeddedDocuments('Item', [itemData]);
    if (!createdItem) return null;

    return this.actor.items.get(createdItem.id) ?? createdItem;
  }
}
