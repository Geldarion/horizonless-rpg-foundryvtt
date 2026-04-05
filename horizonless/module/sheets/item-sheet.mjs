import {
  onManageActiveEffect,
  prepareActiveEffectCategories,
} from '../helpers/effects.mjs';
import { SpellList } from '../data/enums.mjs';
import { prepareEnrichedChatContent } from '../helpers/chat.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
const TextEditor = foundry.applications.ux.TextEditor.implementation;

function bindEventListeners(root, eventName, selector, listener) {
  for (const element of root.querySelectorAll(selector)) {
    element.addEventListener(eventName, listener);
  }
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

export class HorizonlessItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  tabGroups = {
    primary: 'description',
  };

  async _submitPendingChanges() {
    if (!(this.form instanceof HTMLFormElement) || !this.isEditable) return;
    await this.submit();
  }

  static get DEFAULT_OPTIONS() {
    return foundry.utils.mergeObject(
      super.DEFAULT_OPTIONS ?? {},
      {
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
    const tabConfig = this.constructor.TABS?.[group];
    const activeTab = this.tabGroups[group] ?? tabConfig?.initial ?? tabConfig?.tabs?.[0]?.id ?? '';
    if (!activeTab) return;

    this.tabGroups[group] = activeTab;
    syncTabGroup(root, group, activeTab);
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
    context.spellcastingModifiers = this.item.type === 'spell'
      ? Object.keys(CONFIG.HORIZONLESS_RPG.abilities ?? {}).filter((key) =>
          ['con', 'int', 'wis', 'cha'].includes(key)
        )
      : [];
    context.spellLists = Object.values(SpellList);
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

    if (!this.isEditable) return;

    bindEventListeners(root, 'click', '.effect-control', (event) =>
      onManageActiveEffect(event, this.item)
    );
  }

  async _preClose(options) {
    await this._submitPendingChanges();
    await super._preClose(options);
  }
}
