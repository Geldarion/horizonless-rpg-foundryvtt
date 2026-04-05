function getInitiativeConfig() {
  return CONFIG.HORIZONLESS_RPG?.initiative ?? {};
}

function getDispositionClass(combatant) {
  const disposition = combatant?.disposition ?? CONST.TOKEN_DISPOSITIONS.HOSTILE;
  if (disposition === 2) return 'player';
  if (disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY) return 'friendly';
  if (disposition === CONST.TOKEN_DISPOSITIONS.NEUTRAL) return 'neutral';
  if (disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) return 'enemy';
  return '';
}

function getIsPopOut(tracker) {
  return Boolean(tracker?.isPopout ?? tracker?.popOut);
}

function getCombatantIdFromTrackerItem(item) {
  if (!item) return null;
  if (typeof item.data === 'function') {
    return item.data('combatant-id') ?? item.data('combatantId') ?? null;
  }

  const element =
    item instanceof HTMLElement ? item : item?.[0] instanceof HTMLElement ? item[0] : null;
  return element?.dataset?.combatantId ?? element?.getAttribute?.('data-combatant-id') ?? null;
}

function removeTurnStepControls(root) {
  if (!(root instanceof HTMLElement)) return;

  for (const selector of [
    '[data-action="nextTurn"]',
    '[data-action="previousTurn"]',
    '[data-control="nextTurn"]',
    '[data-control="previousTurn"]',
  ]) {
    for (const element of root.querySelectorAll(selector)) {
      element.remove();
    }
  }
}

function isAllowedCombatantInteraction(target) {
  if (!(target instanceof Element)) return false;

  return Boolean(
    target.closest(
      '.token-image, .combatant-control, .horizonless-combat-control, .inline-control, a, button, input, select, textarea, label'
    )
  );
}

function enrichTurnData(turn, combatant, activeCombatantIds) {
  const isTakingTurn = activeCombatantIds.has(combatant?.id ?? turn?.id);
  return {
    ...turn,
    css: `${turn?.css ?? ''} ${getDispositionClass(combatant)}`.trim(),
    activations: combatant?.activations?.max ?? 1,
    pending: combatant?.activations?.value ?? 0,
    finished: Number(isTakingTurn),
    isTakingTurn,
  };
}

function sortTrackerTurns(turns, shouldSort) {
  if (!shouldSort) return turns;

  turns.sort((a, b) => {
    const aActive = a.isTakingTurn ? 1 : 0;
    const bActive = b.isTakingTurn ? 1 : 0;
    if (bActive - aActive !== 0) return bActive - aActive;

    const aDone = a.pending === 0 ? 1 : 0;
    const bDone = b.pending === 0 ? 1 : 0;
    if (aDone - bDone !== 0) return aDone - bDone;

    return String(a.name ?? '').localeCompare(String(b.name ?? ''));
  });

  return turns;
}

const BaseCombatTracker =
  foundry.applications?.sidebar?.tabs?.CombatTracker ?? globalThis.CombatTracker;

export class HorizonlessCombatTracker extends BaseCombatTracker {
  static get DEFAULT_OPTIONS() {
    const classes = Array.from(
      new Set([...(super.DEFAULT_OPTIONS?.classes ?? []), 'horizonless-combat-tracker'])
    );

    return foundry.utils.mergeObject(
      super.DEFAULT_OPTIONS ?? {},
      {
        classes,
        position: {
          width: 340,
          height: 380,
        },
        window: {
          resizable: true,
        },
        actions: {
          activateCombatant(event, target) {
            return this._onActivateCombatantAction(event, target);
          },
          deactivateCombatant(event, target) {
            return this._onDeactivateCombatantAction(event, target);
          },
        },
      },
      { inplace: false }
    );
  }

  static get PARTS() {
    return foundry.utils.mergeObject(
      super.PARTS ?? {},
      {
        tracker: {
          template: 'systems/horizonless/templates/combat/parts/tracker.hbs',
          scrollable: ['#combat-tracker'],
        },
      },
      { inplace: false }
    );
  }

  scrollToTurn() {
    if (this.viewed?.turn == null || !(getInitiativeConfig().sortTracker ?? true)) {
      return super.scrollToTurn();
    }

    const trackerElement =
      this.element?.querySelector?.('ol#combat-tracker') ??
      this.element?.find?.('ol#combat-tracker')?.[0];
    if (trackerElement) trackerElement.scrollTop = 0;
  }

  async _prepareTurnContext(combat, combatant, index) {
    const turn = await super._prepareTurnContext(combat, combatant, index);
    const activeCombatantIds = new Set(this.viewed?.activeCombatantIds ?? []);
    return enrichTurnData(turn, combatant, activeCombatantIds);
  }

  async _prepareTrackerContext(context, options) {
    await super._prepareTrackerContext(context, options);

    const config = getInitiativeConfig();
    sortTrackerTurns(context.turns ?? [], config.sortTracker ?? true);
    context.user ??= game.user;
    context.activate_icon_class = config.activateIconClass ?? 'fas fa-play';
    context.deactivate_icon_class = config.deactivateIconClass ?? 'fas fa-stop';
    context.enable_initiative = config.enableInitiative ?? false;
    context.isPopOut = getIsPopOut(this);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    console.log('[HorizonlessCombatTracker] _onRender', {
      viewedCombatId: this.viewed?.id ?? null,
      renderContext: options?.renderContext ?? null,
      parts: options?.parts ?? null,
      combatTurn: this.viewed?.turn ?? null,
      currentCombatantId: this.viewed?.combatant?.id ?? null,
      activeCombatantIds: this.viewed?.activeCombatantIds ?? [],
    });
    if (this.element instanceof HTMLElement) {
      this.element.classList.toggle('is-popout', getIsPopOut(this));
      removeTurnStepControls(this.element);
    }
    if (!getIsPopOut(this)) this._activateSidebarResizeHandle();
  }

  _activateSidebarResizeHandle(html = this.element) {
    const root =
      html instanceof HTMLElement ? html : html?.[0] instanceof HTMLElement ? html[0] : null;
    if (!(root instanceof HTMLElement)) return;

    const tracker = root.querySelector('#combat-tracker');
    const handle = root.querySelector('.horizonless-tracker-resize-handle');
    if (!(tracker instanceof HTMLElement) || !(handle instanceof HTMLElement)) return;

    if (Number.isFinite(this._sidebarTrackerHeight)) {
      tracker.style.height = `${this._sidebarTrackerHeight}px`;
    }

    if (handle.dataset.horizonlessResizeBound === 'true') return;
    handle.dataset.horizonlessResizeBound = 'true';

    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const ownerDocument = handle.ownerDocument;
      const minHeight = 220;
      const startY = event.clientY;
      const startHeight = tracker.getBoundingClientRect().height;

      const onPointerMove = (moveEvent) => {
        const dy = moveEvent.clientY - startY;
        const nextHeight = Math.max(minHeight, startHeight + dy);
        tracker.style.height = `${nextHeight}px`;
        this._sidebarTrackerHeight = nextHeight;
      };

      const onPointerUp = () => {
        ownerDocument.removeEventListener('pointermove', onPointerMove);
        ownerDocument.removeEventListener('pointerup', onPointerUp);
        ownerDocument.removeEventListener('pointercancel', onPointerUp);
        ownerDocument.body.classList.remove('horizonless-resizing-tracker');
        handle.releasePointerCapture?.(event.pointerId);
      };

      ownerDocument.body.classList.add('horizonless-resizing-tracker');
      handle.setPointerCapture?.(event.pointerId);
      ownerDocument.addEventListener('pointermove', onPointerMove);
      ownerDocument.addEventListener('pointerup', onPointerUp);
      ownerDocument.addEventListener('pointercancel', onPointerUp);
    });
  }

  async _onActivateCombatant(event) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    return this._handleActivationControl(button.dataset.control, button);
  }

  async _onActivateCombatantAction(event, target) {
    event.preventDefault();
    event.stopPropagation();
    return this._handleActivationControl('activateCombatant', target);
  }

  async _onDeactivateCombatantAction(event, target) {
    event.preventDefault();
    event.stopPropagation();
    return this._handleActivationControl('deactivateCombatant', target);
  }

  async _onCombatantTrackerClickCapture(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const combatantElement = target.closest('.combatant');
    if (!(combatantElement instanceof HTMLElement)) return;

    const tokenImage = target.closest('.token-image');
    if (tokenImage instanceof HTMLElement) {
      event.preventDefault();
      event.stopPropagation();

      const combatantId = combatantElement.dataset.combatantId;
      const combatant = this.viewed?.combatants?.get?.(combatantId) ?? null;
      combatant?.actor?.sheet?.render?.(true);
      return;
    }

    if (isAllowedCombatantInteraction(target)) return;

    event.preventDefault();
    event.stopPropagation();
  }

  async _handleActivationControl(control, target) {
    const combatantId = target?.closest?.('.combatant')?.dataset?.combatantId;
    console.log('[HorizonlessCombatTracker] _handleActivationControl', {
      control,
      combatantId,
      viewedCombatId: this.viewed?.id ?? null,
      currentTurn: this.viewed?.turn ?? null,
      currentCombatantId: this.viewed?.combatant?.id ?? null,
      activeCombatantIds: this.viewed?.activeCombatantIds ?? [],
    });
    if (!combatantId) return;

    if (control === 'deactivateCombatant') {
      await this.viewed?.deactivateCombatant(combatantId);
      return;
    }

    if (control === 'activateCombatant') {
      await this.viewed?.activateCombatant(combatantId);
    }
  }

  async _onAddActivation(li) {
    const combatantId = getCombatantIdFromTrackerItem(li);
    const combatant = this.viewed?.getEmbeddedDocument('Combatant', combatantId, {});
    await combatant?.addActivations(1);
  }

  async _onRemoveActivation(li) {
    const combatantId = getCombatantIdFromTrackerItem(li);
    const combatant = this.viewed?.getEmbeddedDocument('Combatant', combatantId, {});
    await combatant?.addActivations(-1);
  }

  async _onUndoActivation(li) {
    const combatantId = getCombatantIdFromTrackerItem(li);
    const combatant = this.viewed?.getEmbeddedDocument('Combatant', combatantId, {});
    await combatant?.modifyCurrentActivations(1);
  }

  _getEntryContextOptions() {
    const options = [
      {
        name: 'HORIZONLESS_RPG.Combat.AddActivation',
        icon: '<i class="fas fa-plus"></i>',
        condition: () => game.user?.isGM,
        callback: this._onAddActivation.bind(this),
      },
      {
        name: 'HORIZONLESS_RPG.Combat.RemoveActivation',
        icon: '<i class="fas fa-minus"></i>',
        condition: () => game.user?.isGM,
        callback: this._onRemoveActivation.bind(this),
      },
      {
        name: 'HORIZONLESS_RPG.Combat.UndoActivation',
        icon: '<i class="fas fa-undo"></i>',
        condition: () => game.user?.isGM,
        callback: this._onUndoActivation.bind(this),
      },
    ];

    const baseOptions = super
      ._getEntryContextOptions()
      .filter((entry) => entry.name !== 'COMBAT.CombatantReroll');

    return [...options, ...baseOptions];
  }
}

if (!Handlebars.helpers.horizonlessRepeat) {
  Handlebars.registerHelper('horizonlessRepeat', function (n, block) {
    let output = '';
    for (let i = 0; i < n; i += 1) output += block.fn(i);
    return output;
  });
}
