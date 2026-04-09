import { HorizonlessBaseItem } from './item-base.mjs';
import {
  getDamageTypeSelectGroups,
} from '../helpers/damage-buffers.mjs';
import {
  createDamageButtonController,
  parseStringArray,
} from '../combat/horizonless-damage-button.mjs';
import { prepareEnrichedChatContent } from '../helpers/chat.mjs';
import { markChatMessageWrapper } from '../helpers/chat-dom.mjs';
import { normalizeCurioChatDescription } from '../helpers/compendium-normalization.mjs';

const { DialogV2 } = foundry.applications.api;
const renderTemplate = foundry.applications.handlebars.renderTemplate;

const ITEM_MESSAGE_TEMPLATES = {
  contentMessage: 'systems/horizonless/module/messages/item/content-message.hbs',
  curioFlavor: 'systems/horizonless/module/messages/item/curio-flavor.hbs',
  rollFlavor: 'systems/horizonless/module/messages/item/roll-flavor.hbs',
  weaponAttackFlavor: 'systems/horizonless/module/messages/item/weapon-attack-flavor.hbs',
  weaponDamageFlavor: 'systems/horizonless/module/messages/item/weapon-damage-flavor.hbs',
  weaponDamageRollButton: 'systems/horizonless/module/messages/item/weapon-damage-roll-button.hbs',
  weaponApplyDamageButton: 'systems/horizonless/module/messages/item/damage-apply-button.hbs',
  weaponApplyDamageApplied: 'systems/horizonless/module/messages/item/damage-apply-applied.hbs',
};

export class HorizonlessWeaponItem extends HorizonlessBaseItem {
  static _damageRollButtonHookRegistered = false;

  static registerHooks() {
    this._registerDamageRollButtonHook();
  }

  static _isWeaponChatMessage(message) {
    return Boolean(message?.getFlag?.('horizonless', 'weaponChat'));
  }

  static _markWeaponChatWrapper(html) {
    markChatMessageWrapper(html, 'horizonless-weapon-chat-message');
  }

  static async _renderMessageTemplate(templatePath, data = {}) {
    return renderTemplate(templatePath, data);
  }

  async _renderItemMessageTemplate(templatePath, data = {}) {
    return this.constructor._renderMessageTemplate(templatePath, data);
  }

  async _prepareChatContent(rawContent = '') {
    return prepareEnrichedChatContent(rawContent, {
      rollData: this.getRollData(),
      secrets: Boolean(this.actor?.isOwner || game.user?.isGM),
    });
  }

  _normalizeCurioChatDescription(rawDescription = '') {
    return normalizeCurioChatDescription(rawDescription);
  }

  static _registerDamageRollButtonHook() {
    if (this._damageRollButtonHookRegistered) return;

    Hooks.on('renderChatMessageHTML', async (message, html) => {
      if (!this._isWeaponChatMessage(message)) return;
      this._markWeaponChatWrapper(html);

      const messageHtml =
        typeof html?.querySelectorAll === 'function'
          ? html
          : html?.[0] ?? null;
      if (!messageHtml) return;

      const getDamageTypeSelect = (button) =>
        button
          ?.closest?.('.horizonless-damage-action')
          ?.querySelector?.('.horizonless-damage-type') ?? null;
      const getInjuringCheckbox = (button) =>
        button
          ?.closest?.('.horizonless-damage-action')
          ?.querySelector?.('.horizonless-damage-injuring') ?? null;

      const queryMessageElements = (selector) =>
        Array.from(messageHtml.querySelectorAll(selector));

      const damageButtonController = createDamageButtonController({
        appliedTemplatePath: ITEM_MESSAGE_TEMPLATES.weaponApplyDamageApplied,
        persistence: {
          mode: 'single',
          flag: 'weaponDamageApplication',
        },
        getDamageTypeSelect,
        getInjuringCheckbox,
        getUndoActivator: (event) =>
          event.target instanceof Element
            ? event.target.closest('.horizonless-undo-damage')
            : null,
        getTargetTokenUuids: (button, chatMessage) => {
          const targetTokenUuidsFromButton = parseStringArray(
            String(button?.dataset?.targetTokenUuids ?? '')
          );
          const targetTokenUuidsFromFlag = parseStringArray(
            game.messages?.get?.(chatMessage?.id)?.getFlag?.(
              'horizonless',
              'weaponDamageTargetTokenUuids'
            ) ?? chatMessage?.getFlag?.('horizonless', 'weaponDamageTargetTokenUuids')
          );
          return targetTokenUuidsFromButton.length > 0
            ? targetTokenUuidsFromButton
            : targetTokenUuidsFromFlag;
        },
        getTotalDamage: (button, chatMessage) => {
          const fallbackDamageTotal = Number(
            game.messages?.get?.(chatMessage?.id)?.getFlag?.('horizonless', 'weaponDamageTotal')
              ?? chatMessage?.getFlag?.('horizonless', 'weaponDamageTotal')
          );
          const damageFromRoll = Number(
            chatMessage?.rolls?.[0]?.total ?? chatMessage?.roll?.total ?? 0
          );
          const rawRequestedDamage = String(button?.dataset?.damageTotal ?? '').trim();
          const requestedDamage = rawRequestedDamage.length
            ? Number(rawRequestedDamage)
            : Number.NaN;

          return Number.isFinite(requestedDamage)
            ? requestedDamage
            : Number.isFinite(fallbackDamageTotal)
              ? fallbackDamageTotal
              : damageFromRoll;
        },
        onSkippedTargets: (skippedActors) => {
          ui.notifications?.warn(`Skipped targets: ${skippedActors.join(', ')}`);
        },
      });

      const moveActionContainersAfterLastRoll = (buttons) => {
        const rollBlocks = queryMessageElements('.dice-roll');
        const lastRollBlock = rollBlocks.at(-1) ?? null;
        if (!lastRollBlock) return;

        let insertionPoint = lastRollBlock;
        for (const button of buttons) {
          const actionContainer =
            button.closest('.horizonless-damage-action') ?? button;
          insertionPoint.after(actionContainer);
          insertionPoint = actionContainer;
        }
      };

      const damageButtons = queryMessageElements('.horizonless-roll-weapon-damage');
      if (damageButtons.length) moveActionContainersAfterLastRoll(damageButtons);

      const applyDamageButtons = queryMessageElements('.horizonless-apply-damage');
      if (applyDamageButtons.length) {
        moveActionContainersAfterLastRoll(applyDamageButtons);
        const updatePromises = [];
        applyDamageButtons.forEach((button) => {
          updatePromises.push(damageButtonController.syncButtonState(button, message));
        });
        if (updatePromises.length > 0) await Promise.all(updatePromises);
      }

      damageButtons.forEach((button) => button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const currentButton = event.currentTarget;
        if (!(currentButton instanceof Element)) return;

        const actorUuid = String(currentButton.dataset?.actorUuid ?? '');
        const itemUuid = String(currentButton.dataset?.itemUuid ?? '');
        const formula = String(currentButton.dataset?.formula ?? '').trim();
        const itemName = String(currentButton.dataset?.itemName ?? 'Weapon').trim() || 'Weapon';
        const targetTokenUuids = parseStringArray(
          message.getFlag('horizonless', 'weaponAttackTargetTokenUuids')
        );

        if (!actorUuid || !formula) return;

        const actor = await fromUuid(actorUuid);
        if (!(actor instanceof Actor)) return;
        const item = itemUuid ? await fromUuid(itemUuid) : null;
        const weaponItem = item instanceof Item ? item : null;

        const roll = new Roll(formula, actor.getRollData());
        await roll.evaluate();

        const damageTotal = Math.max(
          0,
          Math.floor(Number(roll.total ?? 0))
        );
        const applyDamageButton = await this._renderMessageTemplate(
          ITEM_MESSAGE_TEMPLATES.weaponApplyDamageButton,
          {
            targetTokenUuids: JSON.stringify(targetTokenUuids),
            damageTotal,
            damageTypeGroups: getDamageTypeSelectGroups(),
            selectedDamageType: String(weaponItem?.system?.damageType ?? '').trim(),
            injuring: Boolean(weaponItem?.system?.injuring),
          }
        );
        const damageFlavor = await this._renderMessageTemplate(
          ITEM_MESSAGE_TEMPLATES.weaponDamageFlavor,
          {
            label: `[weapon] ${itemName} Damage`,
            applyDamageButtonHtml: applyDamageButton,
          }
        );

        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor }),
          rollMode: game.settings.get('core', 'rollMode'),
          flavor: damageFlavor,
          flags: {
            horizonless: {
              weaponChat: true,
              weaponDamageTargetTokenUuids: targetTokenUuids,
              weaponDamageTotal: damageTotal,
            },
          },
        });
      }));

      applyDamageButtons.forEach((button) => button.addEventListener('click', async (event) => {
        const currentButton = event.currentTarget;
        if (!(currentButton instanceof Element)) return;
        await damageButtonController.handleButtonClick(event, message);
      }));
    });

    this._damageRollButtonHookRegistered = true;
  }

  _getAttackAbilityForWeaponRoll() {
    const diceBonus = String(this.system?.roll?.diceBonus ?? '').toLowerCase();
    if (diceBonus.includes('@dex.mod')) return 'dex';
    if (diceBonus.includes('@str.mod')) return 'str';
    return 'str';
  }

  _getWeaponDamageFormula() {
    const attackAbility = this._getAttackAbilityForWeaponRoll();
    const martialDie = String(this.actor?.system?.martialDie ?? '').trim();
    const base = martialDie || '0';
    return `${base}+@${attackAbility}.mod+@tierBonus`;
  }

  async _promptAttackRollModifiers() {
    const content = `
      <div class="horizonless-attack-roll-dialog">
        <div class="form-group">
          <label>Advantages</label>
          <div class="form-fields">
            <button type="button" class="modifier-adjust" data-target="advantages" data-delta="-1">-</button>
            <input type="number" name="advantages" value="0" min="0" step="1" />
            <button type="button" class="modifier-adjust" data-target="advantages" data-delta="1">+</button>
          </div>
        </div>
        <div class="form-group">
          <label>Disadvantages</label>
          <div class="form-fields">
            <button type="button" class="modifier-adjust" data-target="disadvantages" data-delta="-1">-</button>
            <input type="number" name="disadvantages" value="0" min="0" step="1" />
            <button type="button" class="modifier-adjust" data-target="disadvantages" data-delta="1">+</button>
          </div>
        </div>
      </div>
    `;

    const result = await DialogV2.wait({
      window: { title: `${this.name} Attack Roll` },
      content,
      modal: true,
      rejectClose: false,
      buttons: [
        {
          action: 'confirm',
          icon: 'fas fa-dice-d20',
          label: 'Roll Attack',
          default: true,
          callback: (_event, button) => {
            const advantages = Math.max(0, Math.floor(Number(button.form?.elements?.advantages?.value ?? 0)));
            const disadvantages = Math.max(0, Math.floor(Number(button.form?.elements?.disadvantages?.value ?? 0)));
            return { confirmed: true, advantages, disadvantages };
          },
        },
        {
          action: 'cancel',
          icon: 'fas fa-times',
          label: 'Cancel',
          callback: () => ({ confirmed: false }),
        },
      ],
      render: (_event, dialog) => {
        const root = dialog.element;
        if (!root) return;

        const clampAndSet = (input, value) => {
          const normalized = Math.max(0, Math.floor(Number(value ?? 0)));
          input.value = String(normalized);
        };

        for (const input of root.querySelectorAll('input[name="advantages"], input[name="disadvantages"]')) {
          input.addEventListener('change', () => clampAndSet(input, input.value));
        }

        for (const adjustButton of root.querySelectorAll('.modifier-adjust')) {
          adjustButton.addEventListener('click', (event) => {
            event.preventDefault();
            const target = String(adjustButton.dataset.target ?? '');
            const delta = Math.floor(Number(adjustButton.dataset.delta ?? 0));
            if (!target || !Number.isFinite(delta)) return;

            const input = root.querySelector(`input[name="${target}"]`);
            if (!input) return;

            const current = Math.max(0, Math.floor(Number(input.value ?? 0)));
            clampAndSet(input, current + delta);
          });
        }
      },
    });

    return result?.confirmed ? result : null;
  }

  _buildAttackFormulaWithModifiers(rollData, modifiers) {
    const baseRoll = rollData?.roll ?? this.system?.roll ?? {};
    const baseDiceNum = Math.max(1, Math.floor(Number(baseRoll?.diceNum ?? 1)));
    const diceSize = String(baseRoll?.diceSize ?? 'd20') || 'd20';
    const diceBonus = String(baseRoll?.diceBonus ?? '');
    const advantages = Number(modifiers?.advantages ?? 0);
    const disadvantages = Number(modifiers?.disadvantages ?? 0);
    const netModifiers = advantages - disadvantages;

    if (netModifiers === 0) return `${baseDiceNum}${diceSize}${diceBonus}`;

    const totalDice = baseDiceNum + Math.abs(netModifiers);
    const keepClause = netModifiers > 0 ? `kh${baseDiceNum}` : `kl${baseDiceNum}`;
    return `${totalDice}${diceSize}${keepClause}${diceBonus}`;
  }

  _getTargetTokenUuids() {
    const uuids = Array.from(game.user?.targets ?? [])
      .map((token) => token?.document?.uuid ?? '')
      .map((uuid) => String(uuid).trim())
      .filter((uuid) => uuid.length > 0)
      .filter((uuid, index, arr) => arr.indexOf(uuid) === index);
    return uuids;
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  async roll() {
    this.constructor._registerDamageRollButtonHook();

    const item = this;
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    const rollMode = game.settings.get('core', 'rollMode');
    const label = `[${item.type}] ${item.name}`;

    if (!this.system.formula) {
      const rawDescription = this.type === 'curio'
        ? this._normalizeCurioChatDescription(item.system.description ?? '')
        : (item.system.description ?? '');
      const baseContent = await this._prepareChatContent(rawDescription);
      const itemContent = this.type === 'maneuver'
        ? await this._buildManeuverChatContent(baseContent)
        : baseContent;
      const curioFlavor = this.type === 'curio'
        ? String(this.system?.flavor ?? '').trim()
        : '';
      const curioFlavorHtml = curioFlavor
        ? await this._renderItemMessageTemplate(ITEM_MESSAGE_TEMPLATES.curioFlavor, {
            flavor: curioFlavor,
          })
        : '';
      const content = await this._renderItemMessageTemplate(
        ITEM_MESSAGE_TEMPLATES.contentMessage,
        {
          hasItemIcon: this.type === 'curio' && String(this.img ?? '').trim().length > 0,
          itemIcon: String(this.img ?? '').trim(),
          itemName: String(this.name ?? '').trim(),
          curioFlavorHtml,
          itemContentHtml: itemContent,
        }
      );
      ChatMessage.create({
        speaker,
        rollMode,
        flavor: label,
        content,
      });
      return;
    }

    const rollData = this.getRollData();
    let formula = rollData.formula;

    if (this.type === 'weapon') {
      const modifiers = await this._promptAttackRollModifiers();
      if (!modifiers) return null;
      formula = this._buildAttackFormulaWithModifiers(rollData, modifiers);
    }

    const roll = new Roll(formula, rollData.actor);
    await roll.evaluate();

    let flavor = label;
    if (this.type === 'maneuver') {
      flavor = `${flavor}${await this._buildManeuverRollFlavorSuffix()}`;
    }
    let targetTokenUuids = [];
    if (this.type === 'weapon') {
      const damageFormula = this._getWeaponDamageFormula();
      const damageButton = await this._renderItemMessageTemplate(
        ITEM_MESSAGE_TEMPLATES.weaponDamageRollButton,
        {
          actorUuid: this.actor?.uuid ?? '',
          itemUuid: this.uuid ?? '',
          damageFormula,
          itemName: this.name ?? 'Weapon',
        }
      );
      const targets = Array.from(game.user?.targets ?? [])
        .map((token) => ({
          token,
          actor: token?.actor ?? null,
        }))
        .filter((entry) => entry.actor);
      targetTokenUuids = this._getTargetTokenUuids();

      if (targets.length > 0) {
        const attackTotal = Number(roll.total);
        const targetResults = targets.map(({ token, actor }) => {
          const ac = Number(actor.system?.armorClass);
          const hasAc = Number.isFinite(ac);
          const isHit = hasAc && Number.isFinite(attackTotal) && attackTotal >= ac;
          const targetName = token.name || actor.name || 'Target';
          const resultText = isHit ? 'Hit' : 'Miss';
          return {
            targetName,
            resultText,
            resultType: isHit ? 'hit' : 'miss',
            hasAc,
            ac,
          };
        });

        flavor = await this._renderItemMessageTemplate(
          ITEM_MESSAGE_TEMPLATES.weaponAttackFlavor,
          {
            label,
            hasTargets: targetResults.length > 0,
            targets: targetResults,
            damageButtonHtml: damageButton,
          }
        );
      } else {
        flavor = await this._renderItemMessageTemplate(
          ITEM_MESSAGE_TEMPLATES.weaponAttackFlavor,
          {
            label,
            hasTargets: false,
            targets: [],
            damageButtonHtml: damageButton,
          }
        );
      }
    }

    flavor = await this._renderItemMessageTemplate(ITEM_MESSAGE_TEMPLATES.rollFlavor, {
      flavorHtml: flavor,
      wrapInChatCard: this.type === 'maneuver',
    });

    roll.toMessage({
      speaker,
      rollMode,
      flavor,
      flags: this.type === 'weapon'
        ? {
            horizonless: {
              weaponChat: true,
              weaponAttackTargetTokenUuids: targetTokenUuids,
            },
          }
        : {},
    });
    return roll;
  }
}
