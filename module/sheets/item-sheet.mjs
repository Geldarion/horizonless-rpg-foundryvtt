import {
  onManageActiveEffect,
  prepareActiveEffectCategories,
} from '../helpers/effects.mjs';
import {
  activateDescriptionEditor,
  getDescriptionEditorActions,
  populateDescriptionEditorContext,
  saveDescriptionEditorContent,
  startDescriptionEditing,
} from '../helpers/description-editor.mjs';
import {
  bindEventListeners,
  getEventTabGroup,
  submitPendingSheetChanges,
  syncSheetTabState,
} from '../helpers/sheet.mjs';
import { AncestryFeatureType, SpellList } from '../data/enums.mjs';
import { prepareEnrichedChatContent } from '../helpers/chat.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
const TextEditor = foundry.applications.ux.TextEditor.implementation;

const ITEM_PRIMARY_TABS = [
  { id: 'description', label: 'Description' },
  { id: 'attributes', label: 'Attributes' },
  { id: 'effects', label: 'Effects' },
];

const ITEM_TYPES_WITH_EFFECTS = new Set(['armor', 'weapon', 'feature', 'class-feature']);
const ITEM_PRIMARY_TABS_WITHOUT_EFFECTS = ITEM_PRIMARY_TABS.filter((tab) => tab.id !== 'effects');

const ARMOR_TYPE_CHOICES = Object.freeze({
  agile: 'Agile Armor',
  stock: 'Stock Armor',
  fortified: 'Fortified Armor',
});

const MANEUVER_TYPE_CHOICES = Object.freeze({
  '': 'None',
  attack: 'Attack',
  strategy: 'Strategy',
});

const ANCESTRY_FEATURE_TYPE_CHOICES = Object.freeze({
  '': 'None',
  [AncestryFeatureType.PRIMARY]: 'Primary',
  [AncestryFeatureType.SECONDARY]: 'Secondary',
  [AncestryFeatureType.TERTIARY]: 'Tertiary',
  [AncestryFeatureType.INHERITOR]: 'Inheritor',
});

function getPrimaryTabsForItem(type, activeTab) {
  const tabs = ITEM_TYPES_WITH_EFFECTS.has(type) ? ITEM_PRIMARY_TABS : ITEM_PRIMARY_TABS_WITHOUT_EFFECTS;
  return tabs.map((tab) => ({
    ...tab,
    active: activeTab === tab.id,
  }));
}

export class HorizonlessItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  editingDescriptionTarget = null;
  _isSavingDescription = false;

  tabGroups = {
    primary: 'description',
  };

  async _submitPendingChanges() {
    await submitPendingSheetChanges(this);
  }

  static get DEFAULT_OPTIONS() {
    return foundry.utils.mergeObject(
      super.DEFAULT_OPTIONS ?? {},
      {
        actions: {
          ...getDescriptionEditorActions(this),
        },
        classes: ['horizonless', 'sheet', 'item'],
        form: {
          closeOnSubmit: false,
          submitOnChange: true,
        },
        position: {
          width: 520,
          height: 480,
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
          template: 'systems/horizonless/templates/item/item-sheet-root.hbs',
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
          initial: 'description',
          tabs: [
            { id: 'description' },
            { id: 'attributes' },
            { id: 'effects' },
          ],
        },
      },
      { inplace: false }
    );
  }

  get template() {
    return `systems/horizonless/templates/item/item-${this.item.type}-sheet.hbs`;
  }

  _syncTabState(root, group = 'primary') {
    syncSheetTabState(this, root, group);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const itemData = this.document.toPlainObject();

    context.config = CONFIG.HORIZONLESS_RPG;
    context.cssClass = this.options.classes.join(' ');
    context.effects = prepareActiveEffectCategories(this.item.effects);
    context.flags = itemData.flags;
    context.heighteningOptions = [];
    context.item = this.item;
    context.sheetTemplate = this.template;
    context.primaryTabs = getPrimaryTabsForItem(
      itemData.type,
      context.tabGroups?.primary ?? this.tabGroups.primary
    );
    context.ancestryFeatureTypeChoices = ANCESTRY_FEATURE_TYPE_CHOICES;
    context.armorTypeChoices = ARMOR_TYPE_CHOICES;
    context.maneuverTypeChoices = MANEUVER_TYPE_CHOICES;
    context.sizeChoices = CONFIG.HORIZONLESS_RPG.sizes;
    context.spellListChoices = Object.fromEntries(
      Object.values(SpellList).map((spellList) => [
        spellList,
        spellList.charAt(0).toUpperCase() + spellList.slice(1),
      ])
    );
    context.spellcastingModifiers = this.item.type === 'spell'
      ? Object.fromEntries(
          Object.entries(CONFIG.HORIZONLESS_RPG.abilities ?? {})
            .filter(([key]) => ['con', 'int', 'wis', 'cha'].includes(key))
            .map(([key, label]) => [key, game.i18n.localize(label)])
        )
      : [];
    context.system = itemData.system;

    context.enrichedDescription = ['spell', 'curio', 'class-feature', 'feature'].includes(this.item.type)
      ? await prepareEnrichedChatContent(this.item.system.description, {
          rollData: this.item.getRollData(),
          secrets: this.document.isOwner,
        })
      : await TextEditor.enrichHTML(
          this.item.system.description,
          {
            async: true,
            relativeTo: this.item,
            rollData: this.item.getRollData(),
            secrets: this.document.isOwner,
          }
        );

    if (this.item.type === 'spell') {
      const rawOptions = this.item.system.heighteningOptions;
      context.heighteningOptions = await Promise.all(
        rawOptions.map(async (option) => ({
          ...option,
          enrichedText: await TextEditor.enrichHTML(option.text, {
            async: true,
            relativeTo: this.item,
            rollData: this.item.getRollData(),
            secrets: this.document.isOwner,
          }),
        }))
      );
    }

    populateDescriptionEditorContext(context, this.item, this.editingDescriptionTarget);

    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    const root = this.form ?? this.element;
    if (!(root instanceof HTMLElement)) return;

    this._syncTabState(root);
    bindEventListeners(root, 'click', '.sheet-tabs [data-tab]', (event) => {
      const group = getEventTabGroup(event);
      const tabId = String(event.currentTarget.dataset.tab ?? '').trim();
      if (!tabId) return;

      event.preventDefault();
      this.tabGroups[group] = tabId;
      this._syncTabState(this.form ?? this.element, group);
    });

    activateDescriptionEditor(this);

    if (!this.isEditable) return;

    bindEventListeners(root, 'click', '.effect-control', (event) =>
      onManageActiveEffect(event, this.item)
    );
  }

  static _onEditDescription(event, target) {
    startDescriptionEditing(this, target);
  }

  async _onDescriptionEditorSave(event) {
    await saveDescriptionEditorContent(this, event);
  }

  async _preClose(options) {
    await this._submitPendingChanges();
    await super._preClose(options);
  }
}
